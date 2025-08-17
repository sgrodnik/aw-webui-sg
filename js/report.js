import { formatDuration } from './utils.js';
import { getAfkBucketId } from './state.js';

/**
 * Processes raw events to generate a task report.
 * @param {Array<Object>} allEvents - All events fetched from the API, including processed stopwatch events with activitySegments.
 * @returns {Array<Object>} An array of task report objects.
 */
export function generateTaskReport(allEvents) {
    const taskMap = new Map();

    const stopwatchEvents = allEvents.filter(e => e.bucket.startsWith('aw-stopwatch') && e.activitySegments);
    const afkBucketId = getAfkBucketId();

    for (const swEvent of stopwatchEvents) {
        const label = swEvent.data.label || 'Untitled';

        if (!taskMap.has(label)) {
            taskMap.set(label, {
                label: label,
                totalCleanTime: 0,
                dailyBreakdown: new Map(),
                startDate: null,
                endDate: null,
            });
        }

        const task = taskMap.get(label);

        for (const segment of swEvent.activitySegments) {
            if (segment.status === 'not-afk') {
                task.totalCleanTime += segment.duration;

                const segmentDate = segment.startTimestamp.toISOString().split('T')[0]; // YYYY-MM-DD
                task.dailyBreakdown.set(segmentDate, (task.dailyBreakdown.get(segmentDate) || 0) + segment.duration);
            }
        }

        // Update start and end dates for the task
        if (!task.startDate || swEvent.timestamp < task.startDate) {
            task.startDate = swEvent.timestamp;
        }
        const swEventEnd = new Date(swEvent.timestamp.getTime() + swEvent.duration * 1000);
        if (!task.endDate || swEventEnd > task.endDate) {
            task.endDate = swEventEnd;
        }
    }

    // Convert dailyBreakdown Map to a sortable array and format durations
    const report = Array.from(taskMap.values()).map(task => {
        const sortedDailyBreakdown = Array.from(task.dailyBreakdown.entries())
            .sort((a, b) => new Date(a[0]) - new Date(b[0]))
            .map(([date, duration]) => {
                const dateObj = new Date(date);
                const day = dateObj.getDate();
                const month = dateObj.toLocaleString('en-US', { month: 'long' });
                return `${day} ${month}: ${formatDuration(duration, false)}`;
            });

        return {
            label: task.label,
            totalCleanTimeFormatted: formatDuration(task.totalCleanTime, false), // Format to Hh Mm
            totalCleanTimeRaw: task.totalCleanTime, // Keep raw for sorting
            dailyBreakdown: sortedDailyBreakdown,
        };
    });

    return report.sort((a, b) => b.totalCleanTimeRaw - a.totalCleanTimeRaw); // Sort by total clean time
}

/**
 * Renders the task report into the specified container.
 * @param {Array<Object>} reportData - The array of task report objects.
 * @param {d3.Selection} container - The D3 selection for the container to render the report into.
 */
export function renderReport(reportData, container) {
    container.html(""); // Clear previous content

    if (reportData.length === 0) {
        container.append("p").text("No data for the report.");
        return;
    }

    reportData.forEach(task => {
        const taskItem = container.append("div").attr("class", "task-report-item");
        taskItem.append("h3").text(task.label);
        taskItem.append("span").attr("class", "duration").text(task.totalCleanTimeFormatted);
        if (task.dailyBreakdown.length > 0) {
            taskItem.append("span").attr("class", "daily-breakdown").text(`(${task.dailyBreakdown.join(', ')})`);
        }
    });
}
