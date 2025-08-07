const bucketUrls = {
    'aw-stopwatch': 'http://localhost:5600/api/0/buckets/aw-stopwatch/events?limit=1000',
    'aw-watcher-window_CPU17974': 'http://localhost:5600/api/0/buckets/aw-watcher-window_CPU17974/events?limit=1000',
    'aw-watcher-afk_CPU17974': 'http://localhost:5600/api/0/buckets/aw-watcher-afk_CPU17974/events?limit=1000'
};

// Constants for selectors and configuration
const SVG_SELECTOR = "#timeline-svg";
const TIMELINE_CONTAINER_SELECTOR = ".timeline-container";
const INFO_PANEL_SELECTOR = "#event-info-panel";
const EDIT_PANEL_SELECTOR = "#event-edit-panel";
const EVENT_DATA_SELECTOR = "#event-data-table";
const EVENT_SEGMENT_CLASS = "event-segment";
const DRAG_CURSOR_GRABBING = "grabbing";
const DRAG_CURSOR_GRAB = "grab";

/**
 * Fetches event data from the API for multiple buckets.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of event objects from all buckets.
 */
async function fetchEvents() {
    const allEvents = [];
    for (const bucketName in bucketUrls) {
        if (!bucketUrls.hasOwnProperty(bucketName)) continue;
        const url = bucketUrls[bucketName];
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} for bucket ${bucketName}`);
            }
            const events = await response.json();

            // Add bucket name to each event and process
            const processedEvents = events.map(d => {
                // Ищем и обновляем текущее событие
                if (d.data.running === true && d.duration === 0) {
                    const now = new Date();
                    const eventTimestamp = new Date(d.timestamp);
                    d.duration = (now - eventTimestamp) / 1000; // Длительность в секундах
                }
                return {
                    ...d,
                    bucket: bucketName,
                    timestamp: new Date(d.timestamp)
                };
            });
            allEvents.push(...processedEvents);

        } catch (error) {
            console.error(`Не удалось получить данные для бакета ${bucketName}:`, error);
        }
    }

    if (allEvents.length === 0) {
        console.warn("API вернуло пустой список событий.");
    }

    return allEvents;
}

/**
 * Sets up the D3 chart elements, scales, and axes.
 * @param {Array<Object>} events - The array of event data.
 * @param {number} width - The width of the SVG container.
 * @param {number} height - The height of the SVG container.
 * @returns {Object} An object containing D3 selections, scales, and initial time extent.
 */
function setupChart(events, width, height) {
    const svg = d3.select(SVG_SELECTOR);
    const container = d3.select(TIMELINE_CONTAINER_SELECTOR);

    svg.attr("width", width).attr("height", height);

    const g = svg.append("g");

    const timeExtent = d3.extent(events, d => d.timestamp);
    const xScale = d3.scaleTime()
        .domain(timeExtent)
        .range([0, width]);

    const uniqueBuckets = [...new Set(events.map(d => d.bucket))].sort();
    const yScale = d3.scalePoint()
        .domain(uniqueBuckets)
        .range([height - 50, 50]) // Adjust range to give space for labels and axes
        .padding(0.5); // Add some padding between bands

    const xAxis = d3.axisBottom(xScale);
    const xAxisGroup = g.append("g")
        .attr("class", "x-axis-bottom")
        .attr("transform", `translate(0, ${height - 20})`)
        .call(xAxis);

    const xAxisTop = d3.axisTop(xScale)
        .tickValues(generateRelativeTimeTicks(xScale, width)) // Используем новую функцию для генерации тиков
        .tickFormat(d => formatRelativeTime(d)); // Используем новую функцию для форматирования
    const xAxisTopGroup = g.append("g")
        .attr("class", "x-axis-top")
        .attr("transform", `translate(0, 20)`) // Размещаем сверху
        .call(xAxisTop);

    return { svg, g, xScale, yScale, xAxisGroup, xAxisTopGroup, timeExtent }; // Return timeExtent
}

/**
 * Sets up drag-and-drop functionality for the info panel.
 * @param {d3.Selection} infoPanel - The D3 selection for the info panel.
 */
/**
 * Renders event data as a table inside the specified container.
 * @param {Object} eventData - The event object containing data to display.
 * @param {d3.Selection} container - The D3 selection for the container to render the table into.
 */
/**
 * Formats a date into a relative time string (e.g., "1 мин назад", "1 час 1 мин назад").
 * @param {Date} date - The date to format.
 * @param {Date} now - The current reference date (defaults to current time).
 * @returns {string} The relative time string.
 */
/**
 * Generates an array of "smart" relative time ticks based on the current time scale and width.
 * The ticks are rounded to sensible intervals (minutes, hours, days) relative to 'now'.
 * @param {d3.ScaleTime} currentXScale - The current D3 time scale.
 * @param {number} width - The width of the SVG container.
 * @param {Date} now - The current reference date (defaults to current time).
 * @returns {Array<Date>} An array of Date objects representing the tick values.
 */
function generateRelativeTimeTicks(currentXScale, width, now = new Date()) {
    const domain = currentXScale.domain();
    const visibleDurationMs = domain[1].getTime() - domain[0].getTime(); // Duration of the visible range in milliseconds

    let tickInterval;
    let tickStep;

    // Determine the appropriate tick interval based on the visible duration
    if (visibleDurationMs < 2 * 60 * 60 * 1000) { // Less than 2 hours
        tickInterval = d3.timeMinute;
        tickStep = 5; // 5-minute intervals
        if (visibleDurationMs < 30 * 60 * 1000) tickStep = 1; // 1-minute intervals for very short durations
        else if (visibleDurationMs < 60 * 60 * 1000) tickStep = 5; // 5-minute intervals for less than an hour
        else tickStep = 10; // 10-minute intervals for up to 2 hours
    } else if (visibleDurationMs < 2 * 24 * 60 * 60 * 1000) { // Less than 2 days
        tickInterval = d3.timeHour;
        tickStep = 1; // 1-hour intervals
        if (visibleDurationMs > 12 * 60 * 60 * 1000) tickStep = 3; // 3-hour intervals for longer durations
    } else { // More than 2 days
        tickInterval = d3.timeDay;
        tickStep = 1; // 1-day intervals
        if (visibleDurationMs > 7 * 24 * 60 * 60 * 1000) tickStep = 7; // 7-day intervals for longer durations
    }

    // Generate ticks relative to 'now'
    const ticks = [];
    let currentTick = tickInterval.offset(now, 0); // Start at 'now' or nearest interval

    // Adjust currentTick to be a multiple of tickStep relative to 'now'
    const nowMs = now.getTime();
    const currentTickMs = currentTick.getTime();
    const intervalMs = tickInterval.offset(now, tickStep).getTime() - nowMs; // Duration of one step

    // Calculate the offset from 'now' to the nearest 'round' tick
    const offsetFromNow = (nowMs - currentTickMs) % intervalMs;
    currentTick = new Date(currentTickMs + offsetFromNow);

    // Generate ticks backwards from 'now'
    while (currentTick.getTime() >= domain[0].getTime()) {
        ticks.unshift(currentTick);
        currentTick = tickInterval.offset(currentTick, -tickStep);
    }

    // Generate ticks forwards from 'now'
    currentTick = tickInterval.offset(now, tickStep);
    while (currentTick.getTime() <= domain[1].getTime()) {
        ticks.push(currentTick);
        currentTick = tickInterval.offset(currentTick, tickStep);
    }

    return ticks;
}

/**
 * Formats a date into a relative time string (e.g., "1 мин назад", "1 час 1 мин назад").
 * @param {Date} date - The date to format.
 * @param {Date} now - The current reference date (defaults to current time).
 * @returns {string} The relative time string.
 */
function formatRelativeTime(date, now = new Date()) {
    const sec = Math.floor((now.getTime() - date.getTime()) / 1000);
    const sign = sec < 0 ? "-" : "";
    const seconds = Math.abs(sec);

    if (seconds < 60) return `${sign}${seconds}с `;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${sign}${minutes}м `;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${sign}${hours}ч ${minutes % 60}м `.replaceAll(" 0м", "");

    const days = Math.floor(minutes / (60 * 24));
    if (days < 30) return `${sign}${days}д ${hours % 24}ч `.replaceAll(" 0ч", "");

    const months = Math.floor(days / 30);
    if (months < 12) return `${sign}${months}М ${days % 30}д `.replaceAll(" 0д", "");

    const years = Math.floor(months / 12);
    return `${sign}${years}г ${months % 12}М `;
}

function formatDuration(seconds, includeSeconds = true) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    let result = "";
    if (hours > 0) result += hours + "ч ";
    if (minutes > 0) result += minutes + "м ";
    if (includeSeconds) result += remainingSeconds + "с";

    return result.trim();
}

function renderEventTable(eventData, container) {
    container.html(""); // Clear previous content

    const table = container.append("table").attr("class", "event-attributes-table");
    const tbody = table.append("tbody");

    // Add basic event info
    tbody.append("tr").html(`<td>Бакет:</td><td>${eventData.bucket}</td>`); // Add bucket name
    tbody.append("tr").html(`<td>ID:</td><td>${eventData.id}</td>`);
    tbody.append("tr").html(`<td>Время:</td><td>${eventData.timestamp.toLocaleString()}</td>`);

    let displayedDuration;
    if (eventData.duration > 900) { // 15 minutes = 900 seconds
        displayedDuration = formatDuration(eventData.duration, false);
    } else {
        displayedDuration = formatDuration(eventData.duration);
    }
    tbody.append("tr").html(`<td>Длительность:</td><td><span title="${eventData.duration.toFixed(2)} с.">${displayedDuration}</span></td>`);

    // Add data attributes
    if (eventData.data) {
        for (const key in eventData.data) {
            if (eventData.data.hasOwnProperty(key)) {
                let value = eventData.data[key];
                // Handle nested objects or arrays
                if (typeof value === 'object' && value !== null) {
                    value = JSON.stringify(value, null, 2); // Pretty print nested objects
                }
                tbody.append("tr").html(`<td>${key}:</td><td>${value}</td>`);
            }
        }
    }
}

function renderLatestEventsTable(events, container) {
    container.select("tbody").html(""); // Clear previous content

    // Filter events to show only 'aw-stopwatch'
    const filteredEvents = events.filter(event => event.bucket === 'aw-stopwatch');

    // Sort filtered events by timestamp in descending order to get the latest
    const latestEvents = filteredEvents.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10); // Get latest 10 events

    latestEvents.forEach(event => {
        const row = container.select("tbody").append("tr");
        row.append("td").text(event.timestamp.toLocaleString());
        const status = event.data.running ? " ⏳" : "";
        row.append("td").text(formatDuration(event.duration) + status);
        row.append("td").text(`${event.bucket}: ${event.data.label || event.data.status || "N/A"}`); // Display bucket and relevant data
    });
}

function setupInfoPanelDrag(infoPanel) {
    let isDragging = false;
    let initialMouseX, initialMouseY;
    let initialPanelTop, initialPanelRight;

    infoPanel.on("mousedown", (event) => {
        if (event.target === infoPanel.node() || infoPanel.node().contains(event.target)) {
            isDragging = true;
            initialMouseX = event.clientX;
            initialMouseY = event.clientY;
            const computedStyle = window.getComputedStyle(infoPanel.node());
            initialPanelTop = parseFloat(computedStyle.top);
            initialPanelRight = parseFloat(computedStyle.right);
            infoPanel.style("cursor", DRAG_CURSOR_GRABBING);
            event.preventDefault();
        }
    });

    document.addEventListener("mousemove", (event) => {
        if (!isDragging) return;

        const deltaX = event.clientX - initialMouseX;
        const deltaY = event.clientY - initialMouseY;

        infoPanel.style("top", (initialPanelTop + deltaY) + "px");
        infoPanel.style("right", (initialPanelRight - deltaX) + "px");
    });

    document.addEventListener("mouseup", () => {
        if (isDragging) {
            isDragging = false;
            infoPanel.style("cursor", DRAG_CURSOR_GRAB);
        }
    });
}

/**
 * Renders the event segments on the timeline and sets up mouseover events.
 * @param {Array<Object>} events - The array of event data.
 * @param {d3.ScaleTime} xScale - The D3 time scale for the x-axis.
 * @param {d3.ScalePoint} yScale - The D3 point scale for the y-axis.
 * @param {d3.Selection} g - The D3 selection for the SVG group.
 * @param {d3.Selection} infoPanel - The D3 selection for the info panel.
 * @param {d3.Selection} editPanel - The D3 selection for the edit panel.
 * @param {d3.Selection} dataPre - The D3 selection for the pre element to display data.
 * @returns {d3.Selection} The D3 selection for the rendered event segments.
 */
function renderEventPoints(events, xScale, yScale, g, infoPanel, editPanel, dataPre) {
    const BAR_HEIGHT = 10;

    const segments = g.selectAll(EVENT_SEGMENT_CLASS)
        .data(events)
        .enter().append("rect")
        .attr("class", d => d.data.running ? `${EVENT_SEGMENT_CLASS} running` : EVENT_SEGMENT_CLASS)
        .attr("x", d => xScale(d.timestamp))
        .attr("y", d => yScale(d.bucket) - BAR_HEIGHT / 2) // Use bucket for Y position
        .attr("width", d => {
            const startTime = d.timestamp.getTime();
            const endTime = startTime + d.duration * 1000;
            return xScale(new Date(endTime)) - xScale(d.timestamp);
        })
        .attr("height", BAR_HEIGHT)
        .on("mouseover", (event, d) => {
            infoPanel.style("display", "block");
            renderEventTable(d, dataPre);
        })
        .on("click", (event, d) => {
            if (d.bucket === 'aw-stopwatch') {
                editPanel.style("display", "block"); // Show edit panel

                d3.select("#edit-event-id").property("value", d.id);
                d3.select("#edit-title").property("value", d.data.label || '');

                const startTime = d.timestamp;
                const endTime = new Date(startTime.getTime() + d.duration * 1000);

                const formatDateTimeLocal = (date) => {
                    const year = date.getFullYear();
                    const month = (date.getMonth() + 1).toString().padStart(2, '0');
                    const day = date.getDate().toString().padStart(2, '0');
                    const hours = date.getHours().toString().padStart(2, '0');
                    const minutes = date.getMinutes().toString().padStart(2, '0');
                    return `${year}-${month}-${day}T${hours}:${minutes}`;
                };

                d3.select("#edit-start-time").property("value", formatDateTimeLocal(startTime));
                d3.select("#edit-end-time").property("value", formatDateTimeLocal(endTime));

                // Store original event data for saving
                editPanel.property("originalEvent", d);
            }
        });
    return segments;
}

/**
 * Sets up the event listener for the Escape key to hide the info panel.
 * @param {d3.Selection} infoPanel - The D3 selection for the info panel.
 */
function setupEscapeListener(infoPanel, editPanel) {
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            infoPanel.style('display', 'none');
            editPanel.style('display', 'none');
        }
    });
}


/**
 * Zooms and pans the timeline to a specific date range.
 * @param {Date} startDate - The start date of the range.
 * @param {Date} endDate - The end date of the range.
 * @param {d3.Selection} svg - The D3 selection for the SVG element.
 * @param {d3.ScaleTime} originalXScale - The original D3 time scale.
 * @param {d3.Selection} xAxisGroup - The D3 selection for the x-axis group.
 * @param {d3.Selection} segments - The D3 selection for the event segments.
 * @param {number} width - The width of the SVG container.
 * @param {d3.ZoomBehavior<SVGSVGElement>} zoomBehavior - The D3 zoom behavior.
 */
function zoomToRange(startDate, endDate, svg, originalXScale, xAxisGroup, segments, width, zoomBehavior) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const rangeWidth = originalXScale(end) - originalXScale(start);
    if (rangeWidth <= 0) {
        console.warn("Invalid date range for zoom.");
        return;
    }
    const k = width / rangeWidth;

    const x = -originalXScale(start);

    const newTransform = d3.zoomIdentity.scale(k).translate(x, 0);

    svg.transition().duration(750).call(zoomBehavior.transform, newTransform);
}


/**
 * Sets up the D3 zoom behavior for the SVG.
 * @param {d3.Selection} svg - The D3 selection for the SVG element.
 * @param {d3.ScaleTime} xScale - The D3 time scale for the x-axis.
 * @param {d3.Selection} xAxisGroup - The D3 selection for the x-axis group.
 * @param {d3.Selection} xAxisTopGroup - The D3 selection for the top x-axis group.
 * @param {d3.Selection} segments - The D3 selection for the event segments.
 * @param {Array<Date>} timeExtent - The initial time extent of the data.
 * @param {number} width - The width of the SVG container.
 * @returns {d3.ZoomBehavior<SVGSVGElement>} The D3 zoom behavior.
 */
function setupZoom(svg, xScale, xAxisGroup, xAxisTopGroup, segments, timeExtent, width) {
    const initialXScaleForExtent = d3.scaleTime()
        .domain(timeExtent)
        .range([0, width]);

    const zoom = d3.zoom()
        .scaleExtent([1, 100])
        // .translateExtent([[initialXScaleForExtent(timeExtent[0]), 0], [initialXScaleForExtent(timeExtent[1]), 0]])
        .on("zoom", (event) => {
            const newXScale = event.transform.rescaleX(xScale);
            xAxisGroup.call(d3.axisBottom(newXScale));
            xAxisTopGroup.call(d3.axisTop(newXScale)
                .tickValues(generateRelativeTimeTicks(newXScale, width)) // Обновляем тики верхней оси
                .tickFormat(d => formatRelativeTime(d))); // Обновляем верхнюю ось
            segments.attr("x", d => newXScale(d.timestamp))
                  .attr("width", d => {
                      const startTime = d.timestamp.getTime();
                      const endTime = startTime + d.duration * 1000;
                      return newXScale(new Date(endTime)) - newXScale(d.timestamp);
                  });
        });

    svg.call(zoom);
    return zoom;
}

document.addEventListener('DOMContentLoaded', async () => {
    const events = await fetchEvents();
    if (events.length === 0) {
        document.body.innerHTML += "<p>Данные не найдены.</p>";
        return;
    }

    const container = d3.select(TIMELINE_CONTAINER_SELECTOR);
    const width = container.node().clientWidth;
    const height = container.node().clientHeight;

    const { svg, g, xScale, yScale, xAxisGroup, xAxisTopGroup, timeExtent } = setupChart(events, width, height);
    const infoPanel = d3.select(INFO_PANEL_SELECTOR);
    const editPanel = d3.select(EDIT_PANEL_SELECTOR);
    const dataPre = d3.select(EVENT_DATA_SELECTOR);

    const segments = renderEventPoints(events, xScale, yScale, g, infoPanel, editPanel, dataPre);

    const zoomBehavior = setupZoom(svg, xScale, xAxisGroup, xAxisTopGroup, segments, timeExtent, width);

    const zoomLastHourButton = d3.select("#zoom-last-hour");
    const zoomLastDayButton = d3.select("#zoom-last-day");
    const zoomToMorningButton = d3.select("#zoom-to-morning");

    // Функция для масштабирования до последнего часа
    function zoomToLastHour() {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        zoomToRange(oneHourAgo, now, svg, xScale, xAxisGroup, segments, width, zoomBehavior);
    }

    zoomLastHourButton.on("click", zoomToLastHour);

    zoomLastDayButton.on("click", () => {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        zoomToRange(oneDayAgo, now, svg, xScale, xAxisGroup, segments, width, zoomBehavior);
    });

    zoomToMorningButton.on("click", () => {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        zoomToRange(startOfDay, now, svg, xScale, xAxisGroup, segments, width, zoomBehavior);
    });

    setupInfoPanelDrag(infoPanel);
    setupInfoPanelDrag(editPanel); // Make edit panel draggable
    setupEscapeListener(infoPanel, editPanel);

    // Handle edit panel buttons
    d3.select("#edit-cancel-button").on("click", () => {
        editPanel.style("display", "none");
    });

    d3.select("#edit-save-button").on("click", async (e) => {
        e.preventDefault();

        const originalEvent = editPanel.property("originalEvent");
        if (!originalEvent) {
            alert("No event data to save.");
            return;
        }

        const newTitle = d3.select("#edit-title").property("value");
        const newStartTime = new Date(d3.select("#edit-start-time").property("value"));
        const newEndTime = new Date(d3.select("#edit-end-time").property("value"));
        const newDuration = (newEndTime.getTime() - newStartTime.getTime()) / 1000;

        if (newDuration < 0) {
            alert('End time cannot be before start time.');
            return;
        }

        // Delete the old event
        try {
            const deleteResponse = await fetch(`http://localhost:5600/api/0/buckets/${originalEvent.bucket}/events/${originalEvent.id}`, {
                method: 'DELETE'
            });
            if (!deleteResponse.ok) {
                throw new Error(`HTTP error! status: ${deleteResponse.status}`);
            }
            console.log(`Event ${originalEvent.id} deleted successfully.`);
        } catch (error) {
            console.error(`Failed to delete event ${originalEvent.id}:`, error);
            alert('Failed to delete original event. Please check console for details.');
            return;
        }

        // Create a new event
        const newEvent = {
            timestamp: newStartTime.toISOString(),
            duration: newDuration,
            data: {
                ...originalEvent.data, // Keep existing data
                label: newTitle, // Update label
                original_event: originalEvent // Store original event as backup
            }
        };

        try {
            const createResponse = await fetch(`http://localhost:5600/api/0/buckets/${originalEvent.bucket}/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newEvent)
            });
            if (!createResponse.ok) {
                throw new Error(`HTTP error! status: ${createResponse.status}`);
            }
            console.log('New event created successfully:', await createResponse.json());
            alert('Event updated successfully!');
            location.reload(); // Refresh the page
        } catch (error) {
            console.error('Failed to create new event:', error);
            alert('Failed to create new event. Please check console for details.');
        }
    });

    // Render the latest events table
    const latestEventsTable = d3.select("#latest-events-table");
    renderLatestEventsTable(events, latestEventsTable);

    // Автоматически масштабировать до последнего часа при загрузке
    zoomToLastHour();
});
