
import { toLocalISO, formatDuration } from './utils.js';
import { deleteEvent, createEvent } from './api.js';

const INFO_PANEL_SELECTOR = "#event-info-panel";
const EDIT_PANEL_SELECTOR = "#event-edit-panel";
const EVENT_DATA_SELECTOR = "#event-data-table";
const DRAG_CURSOR_GRABBING = "grabbing";
const DRAG_CURSOR_GRAB = "grab";
const NOTIFICATION_CONTAINER_SELECTOR = "#notification-container";

let activeTimeInput = null;

/**
 * Displays a non-intrusive notification in the corner of the screen.
 * @param {string} message - The message to display in the notification.
 * @param {number} duration - The duration in milliseconds for which the notification should be visible.
 */
export function showNotification(message, duration = 3000) {
    const container = window.d3.select(NOTIFICATION_CONTAINER_SELECTOR);
    if (container.empty()) {
        console.error("Notification container not found.");
        return;
    }

    const notification = container.append("div")
        .attr("class", "notification-item")
        .text(message);

    setTimeout(() => {
        notification.remove();
    }, duration);
}

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
    container.select("tbody").html("");

    const filteredEvents = events.filter(event => event.bucket === 'aw-stopwatch');

    const latestEvents = filteredEvents.sort((a, b) => b.timestamp - a.timestamp).slice(0, 15);

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
                if (newEventLabelInput && event.data.label) {
                    newEventLabelInput.property("value", event.data.label);
                }
            });

        row.append("td").text(event.timestamp.toLocaleString('en-US'));
        const status = event.data.running ? " ⏳" : "";
        row.append("td").text(formatDuration(event.duration) + status);
        row.append("td").text(`${event.data.label || event.data.status || "N/A"}`);
    });
}

/**
 * Sets up drag functionality for a given panel.
 * @param {d3.Selection} panel - The D3 selection for the panel to make draggable.
 */
function setupPanelDrag(panel) {
    let isDragging = false;
    let initialMouseX, initialMouseY;
    let initialPanelTop;
    let initialPanelLeft;
    let initialPanelRight;
    let isPositionedByLeft = false;

    panel.on("mousedown", (event) => {
        const targetTagName = event.target.tagName;
        if (targetTagName === 'INPUT' || targetTagName === 'BUTTON' || targetTagName === 'LABEL') {
            return;
        }

        if (event.target === panel.node() || panel.node().contains(event.target)) {
            isDragging = true;
            initialMouseX = event.clientX;
            initialMouseY = event.clientY;
            const computedStyle = window.getComputedStyle(panel.node());
            initialPanelTop = parseFloat(computedStyle.top);

            if (computedStyle.left !== 'auto' && parseFloat(computedStyle.left) !== 0) {
                initialPanelLeft = parseFloat(computedStyle.left);
                isPositionedByLeft = true;
            } else {
                initialPanelRight = parseFloat(computedStyle.right);
                isPositionedByLeft = false;
            }

            panel.style("cursor", DRAG_CURSOR_GRABBING);
            event.preventDefault();
        }
    });

    document.addEventListener("mousemove", (event) => {
        if (!isDragging) return;

        const deltaX = event.clientX - initialMouseX;
        const deltaY = event.clientY - initialMouseY;

        panel.style("top", (initialPanelTop + deltaY) + "px");

        if (isPositionedByLeft) {
            panel.style("left", (initialPanelLeft + deltaX) + "px");
            panel.style("right", "auto");
        } else {
            panel.style("right", (initialPanelRight - deltaX) + "px");
            panel.style("left", "auto");
        }
    });

    document.addEventListener("mouseup", () => {
        if (isDragging) {
            isDragging = false;
            panel.style("cursor", DRAG_CURSOR_GRAB);
        }
    });
}

/**
 * Sets up drag functionality for multiple panels and saves their positions.
 * @param {...d3.Selection} panels - D3 selections for the panels to make draggable.
 */
export function setupPanelDragging(...panels) {
    panels.forEach((panel) => {
        const storageKey = `${panel.attr('id')}Position`;
        loadPanelPosition(panel, storageKey);
        setupPanelDrag(panel);
        panel.on("mouseup", () => savePanelPosition(panel, storageKey));
    });
}

/**
 * Loads the saved position of a panel from local storage.
 * @param {d3.Selection} panel - The D3 selection for the panel.
 * @param {string} storageKey - The key used to store the position in local storage.
 */
export function loadPanelPosition(panel, storageKey) {
    const savedPosition = localStorage.getItem(storageKey);
    if (savedPosition) {
        const { top, left } = JSON.parse(savedPosition);
        panel.style("top", top).style("left", left);
    }
}

/**
 * Saves the current position of a panel to local storage.
 * @param {d3.Selection} panel - The D3 selection for the panel.
 * @param {string} storageKey - The key to use for storing the position in local storage.
 */
export function savePanelPosition(panel, storageKey) {
    const computedStyle = window.getComputedStyle(panel.node());
    localStorage.setItem(storageKey, JSON.stringify({ top: computedStyle.top, left: computedStyle.left }));
}

/**
 * Sets up the event listener for the Escape key to hide panels.
 * @param {d3.Selection} infoPanel - The D3 selection for the info panel.
 * @param {d3.Selection} editPanel - The D3 selection for the edit panel.
 * @param {d3.Selection} zoomPanel - The D3 selection for the zoom panel.
 */
export function setupEscapeListener(infoPanel, editPanel, zoomPanel) {
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (editPanel.style('display') === 'block') {
                editPanel.style('display', 'none');
                activeTimeInput = null;
            } else if (infoPanel.style('display') === 'block') {
                infoPanel.style('display', 'none');
            } else {
                zoomPanel.style('display', zoomPanel.style('display') === 'none' ? 'flex' : 'none');
            }
        }
    });
}

/**
 * Renders the event edit panel with input fields for event attributes.
 * @param {Object} eventData - The event object to edit.
 * @param {d3.Selection} container - The D3 selection for the container to render the form into.
 * @param {boolean} isSplitMode - Whether the panel is in split mode (for splitting an event).
 */
export function renderEventEditPanel(eventData, container, isSplitMode = false) {
    container.html("");

    const table = container.append("table").attr("class", "event-attributes-table");
    const tbody = table.append("tbody");

    tbody.append("tr").html(`<td>ID:</td><td><input type="text" value="${eventData.id}" readonly></td>`);
    tbody.append("tr").html(`<td>Bucket:</td><td><input type="text" value="${eventData.bucket}" readonly></td>`);
    tbody.append("tr").html(`<td>Title:</td><td><input type="text" id="edit-title-input" value="${eventData.data.label || ''}"></td>`);

    const startTime = eventData.timestamp;
    let endTime = new Date(startTime.getTime() + eventData.duration * 1000);

    tbody.append("tr").html(`<td>Start Time:</td><td><input type="text" id="edit-start-time-input" class="time-input" value="${toLocalISO(startTime)}"></td>`);
    tbody.append("tr").html(`<td>End Time:</td><td><input type="text" id="edit-end-time-input" class="time-input" value="${toLocalISO(endTime)}"></td>`);

    if (isSplitMode) {
        const splitTime = new Date(startTime.getTime() + eventData.duration * 500);
        endTime = splitTime;

        tbody.select("#edit-end-time-input").property("value", toLocalISO(endTime));

        tbody.append("tr").attr("class", "split-mode-field").html(`<td>Title 2:</td><td><input type="text" id="edit-title-2-input" value="${eventData.data.label || ''}"></td>`);
        tbody.append("tr").attr("class", "split-mode-field").html(`<td>Start Time 2:</td><td><input type="text" id="edit-start-time-2-input" class="time-input" value="${toLocalISO(splitTime)}"></td>`);
        tbody.append("tr").attr("class", "split-mode-field").html(`<td>End Time 2:</td><td><input type="text" id="edit-end-time-2-input" class="time-input" value="${toLocalISO(new Date(eventData.timestamp.getTime() + eventData.duration * 1000))}"></td>`);
    }

    if (eventData.data) {
        for (const key in eventData.data) {
            if (eventData.data.hasOwnProperty(key) && key !== 'label') {
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

    container.selectAll(".time-input")
        .on("focus", function() {
            activeTimeInput = this;
        });

    const saveButton = window.d3.select("#edit-save-button");
    const stopButton = window.d3.select("#edit-stop-button");

    if (eventData.data.running) {
        stopButton.style("display", "inline-block");
    } else {
        stopButton.style("display", "none");
    }

    if (isSplitMode) {
        saveButton.property("disabled", false);
    } else {
        saveButton.property("disabled", true);

        const getFormValues = () => {
            const values = {
                title: window.d3.select("#edit-title-input").property("value"),
                startTime: window.d3.select("#edit-start-time-input").property("value"),
                endTime: window.d3.select("#edit-end-time-input").property("value"),
            };
            return values;
        };

        const initialFormState = JSON.stringify(getFormValues());

        const inputs = container.selectAll('input[type="text"]:not([readonly])');
        inputs.on("input", () => {
            const currentFormState = JSON.stringify(getFormValues());
            saveButton.property("disabled", initialFormState === currentFormState);
        });
    }
}

/**
 * Returns the currently active time input field.
 * @returns {HTMLElement|null} The active input element or null if none is active.
 */
export function getActiveTimeInput() {
    return activeTimeInput;
}

/**
 * Renders the bucket filter panel with checkboxes for each bucket.
 * @param {Array<{id: string, count: number}>} buckets - An array of bucket objects with id and event count.
 * @param {function} onFilterChange - Callback function to be called when filter changes.
 * @param {Array<string>} visibleBuckets - The array of currently visible buckets (only IDs).
 */
export function renderBucketFilterPanel(buckets, onFilterChange, visibleBuckets) {
    const bucketList = window.d3.select("#bucket-list");
    bucketList.html("");

    buckets.forEach(bucket => {
        if (!bucket || !bucket.id) {
            console.warn("Skipping undefined or malformed bucket:", bucket);
            return;
        }
        const label = bucketList.append("label");
        label.append("input")
            .attr("type", "checkbox")
            .attr("value", bucket.id)
            .attr("checked", visibleBuckets.includes(bucket.id) ? true : null)
            .on("change", function() {
                const bucketId = d3.select(this).attr("value");
                if (this.checked) {
                    if (!visibleBuckets.includes(bucketId)) {
                        visibleBuckets.push(bucketId);
                    }
                } else {
                    const index = visibleBuckets.indexOf(bucketId);
                    if (index > -1) {
                        visibleBuckets.splice(index, 1);
                    }
                }
                onFilterChange();
                localStorage.setItem("visibleBuckets", JSON.stringify(visibleBuckets));
            });
        label.append("span").text(`${bucket.id} (${bucket.count})`);
    });

    window.d3.select("#bucket-filter-panel").style("display", "block");
    setupPanelDragging(window.d3.select("#bucket-filter-panel"));
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

/**
 * Sets up controls for the event edit panel (save, cancel, split, delete).
 * @param {d3.Selection} editPanel - The D3 selection for the edit panel.
 * @param {function} onSaveCallback - Callback function to be called after a successful save/delete.
 * @param {d3.Selection} svg - The D3 selection for the SVG element (for zoom transform).
 * @param {d3.ZoomBehavior<SVGSVGElement>} zoomBehavior - The D3 zoom behavior (for zoom transform).
 */
export function setupEditControls(editPanel, onSaveCallback, svg, zoomBehavior) {
    const splitButton = window.d3.select("#edit-split-button");
    const cancelButton = window.d3.select("#edit-cancel-button");
    const saveButton = window.d3.select("#edit-save-button");
    const deleteButton = window.d3.select("#edit-delete-button");
    const stopButton = window.d3.select("#edit-stop-button");

    const resetEditPanel = () => {
        editPanel.style("display", "none");
        editPanel.property("isSplitMode", false);
        splitButton.property("disabled", false);
        stopButton.style("display", "none"); // Скрыть кнопку "Стоп" при сбросе
        editPanel.selectAll(".split-mode-field").remove();
        activeTimeInput = null;
    };

    cancelButton.on("click", () => {
        resetEditPanel();
    });

    deleteButton.on("click", async () => {
        const originalEvent = editPanel.property("originalEvent");
        if (!originalEvent || !confirm(`Are you sure you want to delete event ${originalEvent.id}?`)) return;

        try {
            await deleteEvent(originalEvent.bucket, originalEvent.id);
            showNotification('Event deleted successfully!');
            resetEditPanel();
            onSaveCallback();
        } catch (error) {
            showNotification('Failed to delete event. Please check console for details.');
        }
    });

    stopButton.on("click", async () => {
        const originalEvent = editPanel.property("originalEvent");
        if (!originalEvent || !originalEvent.data.running) return;

        const now = new Date();
        const startTime = originalEvent.timestamp;
        const duration = (now.getTime() - startTime.getTime()) / 1000;

        if (duration < 0) {
            showNotification('Некорректная продолжительность события.');
            return;
        }

        const stoppedEvent = {
            timestamp: startTime.toISOString(),
            duration: duration,
            data: { ...originalEvent.data, running: false }
        };

        try {
            await deleteEvent(originalEvent.bucket, originalEvent.id);
            await createEvent(originalEvent.bucket, stoppedEvent);
            showNotification(`Событие "${originalEvent.data.label || 'без названия'}" остановлено!`);
            resetEditPanel();
            onSaveCallback();
        } catch (error) {
            showNotification('Не удалось остановить событие. Проверьте консоль для деталей.');
            console.error('Failed to stop event:', error);
        }
    });

    splitButton.on("click", () => {
        const originalEvent = editPanel.property("originalEvent");
        if (!originalEvent) return;

        splitButton.property("disabled", true);
        editPanel.property("isSplitMode", true);
        renderEventEditPanel(originalEvent, window.d3.select("#edit-event-data-table"), true);

        window.d3.select("#edit-end-time-input").on("input", function() {
            const dependentInput = window.d3.select("#edit-start-time-2-input");
            dependentInput.property("value", this.value);
            dependentInput.node().dispatchEvent(new Event('input'));
        });
    });

    saveButton.on("click", async (e) => {
        e.preventDefault();
        const originalEvent = editPanel.property("originalEvent");
        if (!originalEvent) return alert("No event data to save.");

        const isSplitMode = editPanel.property("isSplitMode");

        let currentTransform;
        if (svg && zoomBehavior) {
            currentTransform = window.d3.zoomTransform(svg.node());
        }

        try {
            if (isSplitMode) {
                const title1 = window.d3.select("#edit-title-input").property("value");
                const startTime1 = new Date(window.d3.select("#edit-start-time-input").property("value"));
                const endTime1 = new Date(window.d3.select("#edit-end-time-input").property("value"));
                const duration1 = (endTime1.getTime() - startTime1.getTime()) / 1000;

                const title2 = window.d3.select("#edit-title-2-input").property("value");
                const startTime2 = new Date(window.d3.select("#edit-start-time-2-input").property("value"));
                const endTime2 = new Date(window.d3.select("#edit-end-time-2-input").property("value"));
                const duration2 = (endTime2.getTime() - startTime2.getTime()) / 1000;

                if (duration1 < 0 || duration2 < 0) return showNotification('End time cannot be before start time for either event.');

                const firstEvent = {
                    timestamp: startTime1.toISOString(),
                    duration: duration1,
                    data: { ...originalEvent.data, label: title1 }
                };

                const secondEvent = {
                    timestamp: startTime2.toISOString(),
                    duration: duration2,
                    data: { ...originalEvent.data, label: title2 }
                };

                await Promise.all([
                    createEvent(originalEvent.bucket, firstEvent),
                    createEvent(originalEvent.bucket, secondEvent)
                ]);
                showNotification('Both new events created successfully.');

            } else {
                const newTitle = window.d3.select("#edit-title-input").property("value");
                const newStartTime = new Date(window.d3.select("#edit-start-time-input").property("value"));
                const newEndTime = new Date(window.d3.select("#edit-end-time-input").property("value"));
                const newDuration = (newEndTime.getTime() - newStartTime.getTime()) / 1000;

                if (newDuration < 0) return showNotification('End time cannot be before start time.');

                const newEvent = {
                    timestamp: newStartTime.toISOString(),
                    duration: newDuration,
                    data: { ...originalEvent.data, label: newTitle }
                };

                await createEvent(originalEvent.bucket, newEvent);
            }

            await deleteEvent(originalEvent.bucket, originalEvent.id);

            showNotification('Event updated successfully!');
            resetEditPanel();
            await onSaveCallback();

            if (currentTransform && svg && zoomBehavior) {
                svg.call(zoomBehavior.transform, currentTransform);
            }

        } catch (error) {
            console.error('Failed to update event:', error);
            showNotification('Failed to update event. Please check console for details.');
        }
    });
}
