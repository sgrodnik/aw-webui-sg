import { fetchEventsForBucket } from './api.js';
import { calculateActivitySegments } from './events.js';
import { getAfkBucketId, getColorRules } from './state.js';
import { setupPanelDragging, loadPanelPosition, setupEscapeListener, setupCalendarResize } from './panelManager.js';
import { getCurrentMonth, setCurrentMonth, getCurrentYear, setCurrentYear, getActivitySlotMap, setActivitySlotMap, clearActivitySlotMap } from './calendarState.js';
import { renderActivitiesForDay } from './calendarRenderer.js';
import { getFormattedDate } from './utils.js';

const CALENDAR_PANEL_SELECTOR = "#calendar-panel";
const CURRENT_MONTH_YEAR_SELECTOR = "#current-month-year";
const PREV_MONTH_BUTTON_SELECTOR = "#prev-month-button";
const NEXT_MONTH_BUTTON_SELECTOR = "#next-month-button";
const CALENDAR_GRID_SELECTOR = "#calendar-grid";
const CALENDAR_WEEKDAYS_SELECTOR = "#calendar-weekdays";
const CALENDAR_RESIZE_HANDLE_SELECTOR = ".calendar-resize-handle";

/**
 * Initializes the calendar by setting up event listeners and rendering the current month.
 */
export function initCalendar() {
    const calendarPanel = window.d3.select(CALENDAR_PANEL_SELECTOR);
    const calendarResizeHandle = window.d3.select(CALENDAR_RESIZE_HANDLE_SELECTOR);

    loadPanelPosition(calendarPanel, 'calendarPanelPosition');
    setupPanelDragging(calendarPanel);
    setupCalendarResize(calendarPanel, calendarResizeHandle); // Setup resize functionality

    const today = new Date();
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());

    renderCalendar();

    // Store initial month and year to detect changes
    let lastRenderedMonth = getCurrentMonth();
    let lastRenderedYear = getCurrentYear();

    window.d3.select(PREV_MONTH_BUTTON_SELECTOR).on("click", () => {
        let newMonth = getCurrentMonth() - 1;
        let newYear = getCurrentYear();
        if (newMonth < 0) {
            newMonth = 11;
            newYear--;
        }
        setCurrentMonth(newMonth);
        setCurrentYear(newYear);

        // Clear activitySlotMap if month or year changed
        if (getCurrentMonth() !== lastRenderedMonth || getCurrentYear() !== lastRenderedYear) {
            clearActivitySlotMap();
            lastRenderedMonth = getCurrentMonth();
            lastRenderedYear = getCurrentYear();
        }
        renderCalendar();
    });

    window.d3.select(NEXT_MONTH_BUTTON_SELECTOR).on("click", () => {
        let newMonth = getCurrentMonth() + 1;
        let newYear = getCurrentYear();
        if (newMonth > 11) {
            newMonth = 0;
            newYear++;
        }
        setCurrentMonth(newMonth);
        setCurrentYear(newYear);

        // Clear activitySlotMap if month or year changed
        if (getCurrentMonth() !== lastRenderedMonth || getCurrentYear() !== lastRenderedYear) {
            clearActivitySlotMap();
            lastRenderedMonth = getCurrentMonth();
            lastRenderedYear = getCurrentYear();
        }
        renderCalendar();
    });

    setupEscapeListener(window.d3.select("#event-info-panel"), window.d3.select("#event-edit-panel"), window.d3.select("#zoom-panel"), window.d3.select("#report-panel"), window.d3.select("#color-rules-panel"), calendarPanel, calendarResizeHandle);
}

/**
 * Calculates weekly statistics for a given week.
 * @param {Array<Object>} stopwatchEvents - Array of stopwatch events.
 * @param {Array<Object>} afkEvents - Array of AFK events.
 * @param {number} weekNumber - The week number.
 * @param {number} year - The year.
 * @returns {Object} Weekly statistics object.
 */
function calculateWeeklyStats(stopwatchEvents, afkEvents, weekNumber, year) {
    // Calculate week start and end dates (Monday to Sunday)
    const weekStart = new Date(year, 0, 1 + (weekNumber - 1) * 7);
    const dayOfWeek = weekStart.getDay();
    const diff = weekStart.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust to Monday
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    let totalTaskTime = 0; // Stopwatch time during 'not-afk'
    let totalNotAfkTime = 0; // Total 'not-afk' time from AFK events
    const uniqueTasks = new Set();
    const dailyStats = {}; // Track daily task and not-afk time

    // Initialize daily stats for the week
    for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dateKey = getFormattedDate(date);
        dailyStats[dateKey] = { taskTime: 0, notAfkTime: 0 };
    }

    // Process stopwatch events
    stopwatchEvents.forEach(event => {
        const eventStart = new Date(event.timestamp);
        if (eventStart >= weekStart && eventStart <= weekEnd) {
            // Add to unique tasks
            if (event.data.label) {
                uniqueTasks.add(event.data.label);
            }

            // Calculate task time from activity segments
            if (event.activitySegments) {
                event.activitySegments.forEach(segment => {
                    if (segment.status === 'not-afk') {
                        totalTaskTime += segment.duration;
                        const segmentDate = new Date(segment.startTimestamp);
                        const dateKey = getFormattedDate(segmentDate);
                        if (dailyStats[dateKey]) {
                            dailyStats[dateKey].taskTime += segment.duration;
                        }
                    }
                });
            }
        }
    });

    // Process AFK events to calculate total not-afk time
    afkEvents.forEach(event => {
        const eventStart = new Date(event.timestamp);
        const eventEnd = new Date((event.timestamp instanceof Date ? event.timestamp.getTime() : new Date(event.timestamp).getTime()) + event.duration * 1000);

        if (eventStart <= weekEnd && eventEnd >= weekStart && event.data.status === 'not-afk') {
            const overlapStart = eventStart < weekStart ? weekStart : eventStart;
            const overlapEnd = eventEnd > weekEnd ? weekEnd : eventEnd;
            const overlapDuration = (overlapEnd - overlapStart) / 1000;

            totalNotAfkTime += overlapDuration;

            // Add to daily stats
            const dateKey = getFormattedDate(overlapStart);
            if (dailyStats[dateKey]) {
                dailyStats[dateKey].notAfkTime += overlapDuration;
            }
        }
    });

    // Calculate task-free time
    const totalTaskFreeTime = Math.max(0, totalNotAfkTime - totalTaskTime);

    // Find longest task day and longest not-afk day separately
    let longestTaskDay = { date: null, taskTime: 0 };
    let longestNotAfkDay = { date: null, notAfkTime: 0 };

    Object.entries(dailyStats).forEach(([dateKey, stats]) => {
        if (stats.taskTime > longestTaskDay.taskTime) {
            longestTaskDay = { date: dateKey, taskTime: stats.taskTime };
        }
        if (stats.notAfkTime > longestNotAfkDay.notAfkTime) {
            longestNotAfkDay = { date: dateKey, notAfkTime: stats.notAfkTime };
        }
    });

    return {
        totalTaskTime,
        totalTaskFreeTime,
        longestTaskDay,
        longestNotAfkDay,
        taskCount: uniqueTasks.size
    };
}

/**
 * Renders the calendar grid for the current month and year.
 */
export async function renderCalendar() {
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const currentMonth = getCurrentMonth();
    const currentYear = getCurrentYear();
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

    // Calculate weekly statistics for each week in the displayed period
    const weeklyStatsMap = new Map();
    const eventsByWeek = new Map();

    // Group events by week for statistics calculation
    processedEvents.forEach(event => {
        if (event.activitySegments) {
            event.activitySegments.forEach(segment => {
                const segmentDate = new Date(segment.startTimestamp);
                const weekNum = getWeekNumber(segmentDate);
                const year = segmentDate.getFullYear();

                if (!eventsByWeek.has(`${year}-${weekNum}`)) {
                    eventsByWeek.set(`${year}-${weekNum}`, {
                        stopwatchEvents: [],
                        afkEvents: [],
                        weekNumber: weekNum,
                        year: year
                    });
                }

                const weekData = eventsByWeek.get(`${year}-${weekNum}`);
                const eventId = event.id || `${event.timestamp}-${event.data?.label || 'unknown'}`;
                if (!weekData.stopwatchEvents.some(e => (e.id || `${e.timestamp}-${e.data?.label || 'unknown'}`) === eventId)) {
                    weekData.stopwatchEvents.push(event);
                }
            });
        }
    });

    // Calculate stats for each week
    eventsByWeek.forEach(weekData => {
        const stats = calculateWeeklyStats(weekData.stopwatchEvents, afkEvents, weekData.weekNumber, weekData.year);
        weeklyStatsMap.set(`${weekData.year}-${weekData.weekNumber}`, stats);
    });

    let currentDay = new Date(currentYear, currentMonth, 1 - startDay); // Start from the first day to render (could be previous month)
    let previousDaySlots = new Map(); // Map to store activity label to its assigned slot index for the previous day

    // Render all cells (including empty ones for previous/next month)
    for (let i = 0; i < (startDay + daysInMonth + (7 - (new Date(currentYear, currentMonth + 1, 0).getDay() || 7)) % 7); i++) {
        const dayOfWeek = currentDay.getDay(); // 0 for Sunday, 1 for Monday

        // Add week number at the start of each week (Monday)
        if (dayOfWeek === 1) {
            const weekNum = getWeekNumber(currentDay);
            const weekStats = weeklyStatsMap.get(`${currentYear}-${weekNum}`);

            const weekNumberCell = calendarGrid.append("div")
                .attr("class", "calendar-week-number");

            if (weekStats) {
                const taskHours = (weekStats.totalTaskTime / 3600).toFixed(1);
                const taskFreeHours = (weekStats.totalTaskFreeTime / 3600).toFixed(1);
                const longestTaskHours = (weekStats.longestTaskDay.taskTime / 3600).toFixed(1);
                const longestNotAfkHours = (weekStats.longestNotAfkDay.notAfkTime / 3600).toFixed(1);

                weekNumberCell.html(`
                    <div class="week-number">${weekNum}</div>
                    <div class="week-total" title="Total ${taskHours}h +\ntask-free ${taskFreeHours}h">
                                                  ${taskHours}h +<br>${taskFreeHours}h</div>
                    <div class="week-longest" title="Longest day ${longestTaskHours}h /\nLongest day (task-free) ${longestNotAfkHours}h">
                                                    ${longestTaskHours}h /<br>${longestNotAfkHours}h</div>
                    <div class="week-tasks" title="Unique task count ${weekStats.taskCount}">
                                                   ${weekStats.taskCount}</div>
                `);
            } else {
                weekNumberCell.html(`<div class="week-number">${weekNum}</div>`);
            }
        }

        const day = calendarGrid.append("div")
            .attr("class", `calendar-day ${currentDay.getMonth() === currentMonth ? 'current-month' : 'other-month'}`)
            .attr("data-date", currentDay.toISOString().split('T')[0]);

        if (currentDay.getMonth() === currentMonth) {
            day.append("span").attr("class", "day-number").text(currentDay.getDate());
            previousDaySlots = renderActivitiesForDay(day, currentDay, calendarData, activityDatesByLabel, previousDaySlots, afkEvents);
        } else {
            day.classed("empty", true); // Mark as empty if not current month
            previousDaySlots.clear(); // Clear slots if moving to an empty day (e.g., end of month)
        }

        currentDay.setDate(currentDay.getDate() + 1); // Move to the next day
    }
}
