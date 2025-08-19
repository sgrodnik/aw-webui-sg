import { fetchEventsForBucket } from './api.js';
import { calculateActivitySegments } from './events.js';
import { getAfkBucketId, getColorRules } from './state.js';
import { setupPanelDragging, loadPanelPosition, setupEscapeListener } from './panelManager.js';
import { getCurrentMonth, setCurrentMonth, getCurrentYear, setCurrentYear, getActivitySlotMap, setActivitySlotMap, clearActivitySlotMap } from './calendarState.js';
import { renderActivitiesForDay } from './calendarRenderer.js';
import { getFormattedDate } from './utils.js';

const CALENDAR_PANEL_SELECTOR = "#calendar-panel";
const CURRENT_MONTH_YEAR_SELECTOR = "#current-month-year";
const PREV_MONTH_BUTTON_SELECTOR = "#prev-month-button";
const NEXT_MONTH_BUTTON_SELECTOR = "#next-month-button";
const CALENDAR_GRID_SELECTOR = "#calendar-grid";
const CALENDAR_WEEKDAYS_SELECTOR = "#calendar-weekdays"; // New selector

/**
 * Initializes the calendar by setting up event listeners and rendering the current month.
 */
export function initCalendar() {
    const calendarPanel = window.d3.select(CALENDAR_PANEL_SELECTOR);
    loadPanelPosition(calendarPanel, 'calendarPanelPosition');
    setupPanelDragging(calendarPanel);

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
            previousDaySlots = renderActivitiesForDay(day, currentDay, calendarData, activityDatesByLabel, previousDaySlots, afkEvents);
        } else {
            day.classed("empty", true); // Mark as empty if not current month
            previousDaySlots.clear(); // Clear slots if moving to an empty day (e.g., end of month)
        }

        currentDay.setDate(currentDay.getDate() + 1); // Move to the next day
    }
}
