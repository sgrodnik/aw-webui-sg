
import { toLocalISO, formatDuration, formatRelativeTime, formatDateTime } from './utils.js';
import { calculateActivitySegments } from './events.js';
import { getAfkBucketId, getVisibleBuckets, setVisibleBuckets } from './state.js';
import { showNotification } from './notification.js';
import { setupPanelDragging, loadPanelPosition, savePanelPosition, renderReportPanel, renderColorRulesPanel, setupEscapeListener, renderBucketFilterPanel } from './panelManager.js';
import { renderEventEditPanel, setupEditControls, getActiveTimeInput } from './eventForm.js';

const INFO_PANEL_SELECTOR = "#event-info-panel";
const EDIT_PANEL_SELECTOR = "#event-edit-panel";
const EVENT_DATA_SELECTOR = "#event-data-table";
const DRAG_CURSOR_GRABBING = "grabbing";
const DRAG_CURSOR_GRAB = "grab";
const NOTIFICATION_CONTAINER_SELECTOR = "#notification-container";

/**
 * Renders the event attributes table in the info panel.
 * @param {Object} eventData - The event object to display.
 * @param {d3.Selection} container - The D3 selection for the container to render the table into.
 */
export function renderEventTable(eventData, container) {
    container.html("");

    const table = container.append("table").attr("class", "event-attributes-table");
    const tbody = table.append("tbody");

    tbody.append("tr").html(`<td>Bucket:</td><td>${eventData.bucket}</td>`);
    tbody.append("tr").html(`<td>ID:</td><td>${eventData.id}</td>`);
    tbody.append("tr").html(`<td>Time:</td><td>${eventData.timestamp.toLocaleString('en-US')}</td>`);

    let displayedDuration;
    if (eventData.duration > 900) {
        displayedDuration = formatDuration(eventData.duration, false);
    } else {
        displayedDuration = formatDuration(eventData.duration);
    }
    tbody.append("tr").html(`<td>Duration:</td><td><span title="${eventData.duration.toFixed(2)} s">${displayedDuration}</span></td>`);

    if (eventData.data) {
        for (const key in eventData.data) {
            if (eventData.data.hasOwnProperty(key)) {
                let value = eventData.data[key];
                if (typeof value === 'object' && value !== null) {
                    value = JSON.stringify(value, null, 2);
                    tbody.append("tr").html(`<td>${key}:</td><td><pre>${value}</pre></td>`);
                } else {
                    tbody.append("tr").html(`<td>${key}:</td><td>${value}</td>`);
                }
            }
        }
    }
}

/**
 * Renders the latest events table.
 * @param {Array<Object>} events - The array of event data.
 * @param {d3.Selection} container - The D3 selection for the table container.
 * @param {function} zoomToEventCallback - Callback function to zoom/pan the timeline to a specific event.
 * @param {d3.Selection} newEventLabelInput - The D3 selection for the new event label input field.
 */
export function renderLatestEventsTable(events, container, zoomToEventCallback, newEventLabelInput) {
    // Проверки на undefined параметры
    if (!container || container.empty()) {
        console.warn("renderLatestEventsTable: container is undefined or empty");
        return;
    }
    if (!events || !Array.isArray(events)) {
        console.warn("renderLatestEventsTable: events is undefined or not an array");
        return;
    }

    container.select("tbody").html("");

    const stopwatchEvents = events.filter(event => event.bucket.startsWith('aw-stopwatch'));
    const afkEvents = events.filter(event => event.bucket === getAfkBucketId());

    const processedStopwatchEvents = calculateActivitySegments(stopwatchEvents, afkEvents);

    const latestEvents = processedStopwatchEvents.sort((a, b) => (b.timestamp.getTime() + b.duration * 1000) - (a.timestamp.getTime() + a.duration * 1000)).slice(0, 15);

    latestEvents.forEach(event => {
        const row = container.select("tbody").append("tr")
            .attr("data-event-id", event.id)
            .on("mouseover", function() {
                window.d3.select(`#event-${event.id}`).classed("highlighted", true);
            })
            .on("mouseout", function() {
                window.d3.select(`#event-${event.id}`).classed("highlighted", false);
            })
            .on("click", function() {
                if (zoomToEventCallback) {
                    zoomToEventCallback(event);
                }
                if (event.data.label) {
                    // Проверяем, доступен ли newEventLabelInput
                    if (newEventLabelInput && typeof newEventLabelInput.empty === 'function' && !newEventLabelInput.empty()) {
                        newEventLabelInput.property("value", event.data.label);
                        newEventLabelInput.node().focus();
                    } else {
                        // Если newEventLabelInput недоступен, попробуем найти элемент заново
                        const fallbackInput = window.d3.select("#new-event-label-input");
                        if (fallbackInput && typeof fallbackInput.empty === 'function' && !fallbackInput.empty()) {
                            fallbackInput.property("value", event.data.label);
                            fallbackInput.node().focus();
                        }
                    }
                }
            });

        const endTime = new Date(event.timestamp.getTime() + event.duration * 1000);
        const startTime = formatDateTime(event.timestamp);
        const status = event.data.running ? " ⏳" : "";
        row.append("td").html(`<span class="ligth-font">${startTime}</span>, ${formatRelativeTime(endTime, new Date(), true)} ago ${status}`);

        let nonAfkDuration = 0;
        if (event.activitySegments) {
            nonAfkDuration = event.activitySegments
                .filter(segment => segment.status === 'not-afk')
                .reduce((sum, segment) => sum + segment.duration, 0);
        }
        const eventDurationF = formatDuration(event.duration, false);
        const nonAfkDurationF = formatDuration(nonAfkDuration, false);
        row.append("td").html(`${nonAfkDurationF} <span class="ligth-font">(${eventDurationF})</span>`);

        row.append("td").text(`${event.data.label || event.data.status || "N/A"}`);
    });
}









/**
 * Sets up the zoom controls for the timeline.
 * @param {d3.Selection} svg - The D3 selection for the SVG element.
 * @param {function} zoomToRangeCallback - Callback function to zoom the timeline to a specific range.
 */
export function setupZoomControls(svg, zoomToRangeCallback) {
    const zoomConfigs = [
        { id: "last-hour", default: 1, unit: 'hours' },
        { id: "last-day", default: 1, unit: 'days' },
        { id: "to-morning", default: 8, unit: 'morning' }
    ];

    zoomConfigs.forEach(config => {
        const input = window.d3.select(`#zoom-${config.id}-input`);

        const savedValue = localStorage.getItem(`zoom-${config.id}-value`);
        input.property("value", savedValue || config.default);

        input.on("change", () => localStorage.setItem(`zoom-${config.id}-value`, input.property("value")));
        input.on("wheel", handleWheelScroll);

        window.d3.select(`#zoom-${config.id}-option`).on("click", () => {
            const value = parseInt(input.property("value"));
            let startTime, endTime = new Date();

            if (config.unit === 'hours') {
                if (isNaN(value) || value < 1 || value > 99) return showNotification("Please enter a number between 1 and 99 for hours.");
                startTime = new Date(endTime.getTime() - value * 60 * 60 * 1000);
            } else if (config.unit === 'days') {
                if (isNaN(value) || value < 1 || value > 99) return showNotification("Please enter a number between 1 and 99 for days.");
                startTime = new Date(endTime.getTime() - value * 24 * 60 * 60 * 1000);
            } else if (config.unit === 'morning') {
                const currentHour = endTime.getHours();
                if (isNaN(value) || value < 0 || value > currentHour) return showNotification(`Please enter a number between 0 and ${currentHour} for the morning hour.`);
                startTime = new Date(endTime.getFullYear(), endTime.getMonth(), endTime.getDate(), value, 0, 0, 0);
            }
            zoomToRangeCallback(startTime, endTime);
        });
    });

    function handleWheelScroll(event) {
        event.preventDefault();
        const input = window.d3.select(event.currentTarget);
        let value = parseInt(input.property("value"));
        const min = parseInt(input.attr("min"));
        const max = parseInt(input.attr("max"));

        if (event.deltaY < 0) value = Math.min(value + 1, max);
        else if (event.deltaY > 0) value = Math.max(value - 1, min);

        input.property("value", value);
        input.dispatch("change");
    }
}
