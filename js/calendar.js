import { setupPanelDragging, loadPanelPosition, setupEscapeListener } from './ui.js';
import { fetchEventsForBucket } from './api.js';
import { calculateActivitySegments } from './events.js';
import { formatDuration, getFormattedDate, isColorDark } from './utils.js';
import { getColorForEvent } from './colorRules.js';
import { getAfkBucketId, getColorRules } from './state.js';

const CALENDAR_PANEL_SELECTOR = "#calendar-panel";
const CURRENT_MONTH_YEAR_SELECTOR = "#current-month-year";
const PREV_MONTH_BUTTON_SELECTOR = "#prev-month-button";
const NEXT_MONTH_BUTTON_SELECTOR = "#next-month-button";
const CALENDAR_GRID_SELECTOR = "#calendar-grid";
const CALENDAR_WEEKDAYS_SELECTOR = "#calendar-weekdays"; // New selector

let currentMonth;
let currentYear;
let activitySlotMap = new Map(); // Map to store activity label to its assigned slot index

/**
 * Initializes the calendar by setting up event listeners and rendering the current month.
 */
export function initCalendar() {
    const calendarPanel = window.d3.select(CALENDAR_PANEL_SELECTOR);
    loadPanelPosition(calendarPanel, 'calendarPanelPosition');
    setupPanelDragging(calendarPanel);

    const today = new Date();
    currentMonth = today.getMonth();
    currentYear = today.getFullYear();

    renderCalendar();

    // Store initial month and year to detect changes
    let lastRenderedMonth = currentMonth;
    let lastRenderedYear = currentYear;

    window.d3.select(PREV_MONTH_BUTTON_SELECTOR).on("click", () => {
        currentMonth--;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        }
        // Clear activitySlotMap if month or year changed
        if (currentMonth !== lastRenderedMonth || currentYear !== lastRenderedYear) {
            activitySlotMap.clear();
            lastRenderedMonth = currentMonth;
            lastRenderedYear = currentYear;
        }
        renderCalendar();
    });

    window.d3.select(NEXT_MONTH_BUTTON_SELECTOR).on("click", () => {
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        // Clear activitySlotMap if month or year changed
        if (currentMonth !== lastRenderedMonth || currentYear !== lastRenderedYear) {
            activitySlotMap.clear();
            lastRenderedMonth = currentMonth;
            lastRenderedYear = currentYear;
        }
        renderCalendar();
    });

    // Add calendar panel to escape listener
    setupEscapeListener(window.d3.select("#event-info-panel"), window.d3.select("#event-edit-panel"), window.d3.select("#zoom-panel"), window.d3.select("#report-panel"), window.d3.select("#color-rules-panel"), calendarPanel);
}

/**
 * Renders the calendar grid for the current month and year.
 */
export async function renderCalendar() {
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    window.d3.select(CURRENT_MONTH_YEAR_SELECTOR).text(`${monthNames[currentMonth]} ${currentYear}`);

    const calendarGrid = window.d3.select(CALENDAR_GRID_SELECTOR);
    calendarGrid.html(""); // Clear previous days

    // Render weekday headers directly into the grid
    calendarGrid.append("div").attr("class", "calendar-week-number").text("Week"); // Week column header
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    dayNames.forEach(dayName => {
        calendarGrid.append("div").attr("class", "calendar-weekday-header").text(dayName);
    });

    // Calculate date range for fetching events (current month + 1 week buffer on each side)
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);

    const fetchStartDate = new Date(firstDayOfMonth);
    fetchStartDate.setDate(firstDayOfMonth.getDate() - 7); // 1 week before

    const fetchEndDate = new Date(lastDayOfMonth);
    fetchEndDate.setDate(lastDayOfMonth.getDate() + 7); // 1 week after

    // Fetch and process real data
    const allEvents = await Promise.all([
        fetchEventsForBucket('aw-stopwatch', fetchStartDate, fetchEndDate),
        fetchEventsForBucket(getAfkBucketId(), fetchStartDate, fetchEndDate)
    ]).then(arrays => arrays.flat());

    const stopwatchEvents = allEvents.filter(e => e.bucket.startsWith('aw-stopwatch'));
    const afkEvents = allEvents.filter(e => e.bucket === getAfkBucketId());

    const processedEvents = calculateActivitySegments(stopwatchEvents, afkEvents);

    // Group processed events by label for calendar display
    const groupedActivities = new Map(); // Map<label, { label: string, activitySegments: Array<[string, number]> }>
    processedEvents.forEach(event => {
        const label = event.data.label || 'Untitled';
        if (!groupedActivities.has(label)) {
            groupedActivities.set(label, { label: label, activitySegments: [] });
        }
        // Add only 'not-afk' segments to the calendar's activitySegments
        event.activitySegments.forEach(segment => {
            if (segment.status === 'not-afk') {
                groupedActivities.get(label).activitySegments.push([segment.startTimestamp.toISOString(), segment.duration]);
            }
        });
    });
    const calendarData = Array.from(groupedActivities.values());

    // Pre-process activities to create a map of activity labels to their active dates
    const activityDatesByLabel = new Map(); // Map<activityLabel, Set<dateString>>
    calendarData.forEach(activity => {
        const activeDates = new Set();
        activity.activitySegments.forEach(segment => {
            const segmentDate = new Date(segment[0]);
            activeDates.add(getFormattedDate(segmentDate));
        });
        activityDatesByLabel.set(activity.label, activeDates);
    });

    const daysInMonth = lastDayOfMonth.getDate();

    // Adjust start day to Monday (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    let startDay = firstDayOfMonth.getDay();
    if (startDay === 0) startDay = 7; // If Sunday, make it 7 for correct offset
    startDay--; // Adjust to 0-indexed where Monday is 0

    // Calculate week number for the first day of the month
    const getWeekNumber = (date) => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    };

    let currentDay = new Date(currentYear, currentMonth, 1 - startDay); // Start from the first day to render (could be previous month)
    let previousDaySlots = new Map(); // Map to store activity label to its assigned slot index for the previous day

    // Render all cells (including empty ones for previous/next month)
    for (let i = 0; i < (startDay + daysInMonth + (7 - (new Date(currentYear, currentMonth + 1, 0).getDay() || 7)) % 7); i++) {
        const dayOfWeek = currentDay.getDay(); // 0 for Sunday, 1 for Monday

        // Add week number at the start of each week (Monday)
        if (dayOfWeek === 1) {
            calendarGrid.append("div")
                .attr("class", "calendar-week-number")
                .text(getWeekNumber(currentDay));
        }

        const day = calendarGrid.append("div")
            .attr("class", `calendar-day ${currentDay.getMonth() === currentMonth ? 'current-month' : 'other-month'}`)
            .attr("data-date", currentDay.toISOString().split('T')[0]);

        if (currentDay.getMonth() === currentMonth) {
            day.append("span").attr("class", "day-number").text(currentDay.getDate());
            previousDaySlots = renderActivitiesForDay(day, currentDay, calendarData, activityDatesByLabel, previousDaySlots);
        } else {
            day.classed("empty", true); // Mark as empty if not current month
            previousDaySlots.clear(); // Clear slots if moving to an empty day (e.g., end of month)
        }

        currentDay.setDate(currentDay.getDate() + 1); // Move to the next day
    }
}

/**
 * Renders activities for a specific day in the calendar.
 * @param {d3.Selection} daySelection - The D3 selection for the calendar day cell.
 * @param {Date} date - The date for which to render activities.
 * @param {Map<string, Set<string>>} activityDatesMap - Map of activity labels to their active dates.
 * @param {Map<string, number>} previousDaySlots - Map of activity labels to their assigned slot index from the previous day.
 * @returns {Map<string, number>} A map of activity labels to their assigned slot index for the current day.
 */
function renderActivitiesForDay(daySelection, date, calendarData, activityDatesMap, previousDaySlots) {
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

    return currentDaySlots; // Return the slots for the current day
}
