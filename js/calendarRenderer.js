import { formatDuration, getFormattedDate, isColorDark, getHourlyAfkData } from './utils.js';
import { getColorForEvent } from './colorRules.js';
import { getColorRules } from './state.js';
import { getActivitySlotMap } from './calendarState.js'; // Import from new state module

/**
 * Renders activities for a specific day in the calendar.
 * @param {d3.Selection} daySelection - The D3 selection for the calendar day cell.
 * @param {Date} date - The date for which to render activities.
 * @param {Array<Object>} calendarData - Array of activity data for the calendar.
 * @param {Map<string, Set<string>>} activityDatesMap - Map of activity labels to their active dates.
 * @param {Map<string, number>} previousDaySlots - Map of activity labels to their assigned slot index from the previous day.
 * @param {Array<Object>} afkEvents - Array of AFK events for the calendar.
 * @returns {Map<string, number>} A map of activity labels to their assigned slot index for the current day.
 */
export function renderActivitiesForDay(daySelection, date, calendarData, activityDatesMap, previousDaySlots, afkEvents) {
    const activitiesMap = new Map(); // Map to group activities by label
    const dateString = getFormattedDate(date);
    const currentDaySlots = new Map(); // Map to store activity label to its assigned slot index for the current day

    calendarData.forEach(activity => {
        let totalDurationForActivity = 0;
        activity.activitySegments.forEach(segment => {
            const segmentDate = new Date(segment[0]);
            if (getFormattedDate(segmentDate) === dateString) {
                totalDurationForActivity += segment[1];
            }
        });

        if (totalDurationForActivity > 0) {
            activitiesMap.set(activity.label, {
                label: activity.label,
                duration: totalDurationForActivity,
                activity: activity // Store the full activity object
            });
        }
    });

    let activitiesForDay = Array.from(activitiesMap.values());

    // Determine occupied slots for the current day
    const occupiedSlots = new Set();
    const activitiesToAssignNewSlot = [];

    // First, assign slots for activities that were present yesterday
    activitiesForDay.forEach(activity => {
        if (previousDaySlots.has(activity.label)) {
            const assignedSlot = previousDaySlots.get(activity.label);
            currentDaySlots.set(activity.label, assignedSlot);
            occupiedSlots.add(assignedSlot);
        } else {
            activitiesToAssignNewSlot.push(activity);
        }
    });

    // Sort new activities by duration (or any other criteria if needed)
    activitiesToAssignNewSlot.sort((a, b) => b.duration - a.duration);

    // Assign slots for new activities
    let currentSlotIndex = 0;
    activitiesToAssignNewSlot.forEach(activity => {
        while (occupiedSlots.has(currentSlotIndex)) {
            currentSlotIndex++;
        }
        const assignedSlot = currentSlotIndex;
        currentDaySlots.set(activity.label, assignedSlot);
        occupiedSlots.add(assignedSlot);
        currentSlotIndex++;
    });

    // Sort activities for rendering based on their assigned slots
    activitiesForDay.sort((a, b) => currentDaySlots.get(a.label) - currentDaySlots.get(b.label));

    // Create a map for quick lookup of activities by slot
    const activitiesBySlot = new Map();
    let maxSlot = -1;
    activitiesForDay.forEach(activity => {
        const assignedSlot = currentDaySlots.get(activity.label);
        activitiesBySlot.set(assignedSlot, activity);
        if (assignedSlot > maxSlot) maxSlot = assignedSlot;
    });

    // Render activities and placeholders based on assigned slots
    for (let slotIndex = 0; slotIndex <= maxSlot; slotIndex++) {
        const activity = activitiesBySlot.get(slotIndex);

        if (activity) {
            const eventData = {
                bucket: 'aw-stopwatch',
                data: { label: activity.label }
            };
            const customColor = getColorForEvent(eventData, getColorRules());

            const activityRect = daySelection.append("div")
                .attr("class", "activity-rectangle")
                .attr("data-activity-label", activity.label)
                .attr("title", `${activity.label} (${formatDuration(activity.duration, false)})`)
                .style("order", slotIndex) // Use slotIndex for order
                .style("background-color", customColor)
                .style("color", customColor && isColorDark(customColor) ? "white" : "black")
                .on("mouseover", function () {
                    const label = window.d3.select(this).attr("data-activity-label");
                    window.d3.selectAll(`.activity-rectangle[data-activity-label="${label.replace(/"/g, '\\"')}"]`)
                        .classed("highlight-same-name", true);
                })
                .on("mouseout", function () {
                    const label = window.d3.select(this).attr("data-activity-label");
                    window.d3.selectAll(`.activity-rectangle[data-activity-label="${label.replace(/"/g, '\\"')}"]`)
                        .classed("highlight-same-name", false);
                });


            // Determine if the activity continues from yesterday or to tomorrow
            const yesterday = new Date(date);
            yesterday.setDate(date.getDate() - 1);
            const yesterdayString = getFormattedDate(yesterday);

            const tomorrow = new Date(date);
            tomorrow.setDate(date.getDate() + 1);
            const tomorrowString = getFormattedDate(tomorrow);

            const activityActiveDates = activityDatesMap.get(activity.label);
            const continuesFromYesterday = activityActiveDates && activityActiveDates.has(yesterdayString);
            const continuesToTomorrow = activityActiveDates && activityActiveDates.has(tomorrowString);

            if (continuesFromYesterday) {
                activityRect.classed("continues-from-yesterday", true);
            }
            if (continuesToTomorrow) {
                activityRect.classed("continues-to-tomorrow", true);
            }

            const isMonday = date.getDay() === 1; // 1 for Monday
            const isSunday = date.getDay() === 0; // 0 for Sunday

            // Добавить класс для поднятия элемента, если задача продолжается на следующий день
            // и это первый день многодневной задачи ИЛИ понедельник, и не воскресенье
            if (continuesToTomorrow && (!continuesFromYesterday || isMonday) && !isSunday) {
                activityRect.classed("activity-elevated", true);
            }

            // Скрыть имя задачи, если она продолжается со вчерашнего дня и сегодня не понедельник
            if (!continuesFromYesterday || isMonday) {
                activityRect.append("div")
                    .attr("class", "activity-label")
                    .text(activity.label);
            }
        } else {
            // Render a placeholder for empty slots
            daySelection.append("div")
                .attr("class", "activity-placeholder")
                .style("order", slotIndex); // Use slotIndex for order
        }
    }

    // Render hourly activity histogram
    const hourlyAfkData = getHourlyAfkData(afkEvents, date);
    const histogramContainer = daySelection.append("div")
        .attr("class", "hourly-activity-histogram");

    hourlyAfkData.forEach(minutes => {
        histogramContainer.append("div")
            .attr("class", "histogram-bar")
            .style("height", `${(minutes / 60) * 100}%`); // Height based on minutes (max 60)
    });

    return currentDaySlots; // Return the slots for the current day
}
