/**
 * @fileoverview Модуль для управления формой редактирования событий.
 * @module eventForm
 */

import { formatDuration, toLocalISO } from './utils.js';
import { deleteEvent, createEvent } from './api.js';
import { showNotification } from './notification.js'; // Импортируем showNotification

let activeTimeInput = null;

/**
 * Рендерит панель редактирования событий с полями ввода для атрибутов события.
 * @param {Object} eventData - Объект события для редактирования.
 * @param {d3.Selection} container - D3-выборка контейнера для рендеринга формы.
 * @param {boolean} isSplitMode - Находится ли панель в режиме разделения (для разделения события).
 */
export function renderEventEditPanel(eventData, container, isSplitMode = false) {
    container.html("");

    const table = container.append("table").attr("class", "event-attributes-table");
    const tbody = table.append("tbody");

    tbody.append("tr").html(`<td>ID:</td><td><input type="text" value="${eventData.id}" readonly></td>`);
    tbody.append("tr").html(`<td>Bucket:</td><td><input type="text" value="${eventData.bucket}" readonly></td>`);
    tbody.append("tr").html(`<td>Title:</td><td><input type="text" id="edit-title-input" value="${eventData.data.label || ''}"></td>`);
    tbody.append("tr").html(`<td>Duration:</td><td><input type="text" value="${formatDuration(eventData.duration) }" readonly></td>`);

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
 * Возвращает текущее активное поле ввода времени.
 * @returns {HTMLElement|null} Активный элемент ввода или null, если ни один не активен.
 */
export function getActiveTimeInput() {
    return activeTimeInput;
}

/**
 * Устанавливает элементы управления для панели редактирования событий (сохранить, отменить, разделить, удалить).
 * @param {d3.Selection} editPanel - D3-выборка панели редактирования.
 * @param {function} onSaveCallback - Функция обратного вызова, которая будет вызвана после успешного сохранения/удаления.
 * @param {d3.Selection} svg - D3-выборка элемента SVG (для преобразования масштабирования).
 * @param {d3.ZoomBehavior<SVGSVGElement>} zoomBehavior - Поведение масштабирования D3 (для преобразования масштабирования).
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
        stopButton.style("display", "none"); // Hide the "Stop" button on reset
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
            showNotification('Invalid event duration.');
            return;
        }

        const stoppedEvent = {
            timestamp: startTime.toISOString(),
            duration: duration,
            data: { ...originalEvent.data, running: false }
        };

        try {
            if (await createEvent(originalEvent.bucket, stoppedEvent)
            && await deleteEvent(originalEvent.bucket, originalEvent.id)) {
                showNotification(`Event "${originalEvent.data.label || 'untitled'}" stopped successfully!`);
                resetEditPanel();
                onSaveCallback();
            }
        } catch (error) {
            showNotification('Failed to stop event. Check console for details.');
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
                firstEvent.data.running = false;

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
