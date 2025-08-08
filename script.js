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
const EVENT_SEGMENT_CLASS = "event-segment-group";
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
                // Find and update the current running event
                if (d.data.running === true && d.duration === 0) {
                    const now = new Date();
                    const eventTimestamp = new Date(d.timestamp);
                    d.duration = (now - eventTimestamp) / 1000; // Duration in seconds
                }
                return {
                    ...d,
                    bucket: bucketName,
                    timestamp: new Date(d.timestamp)
                };
            });
            allEvents.push(...processedEvents);

        } catch (error) {
            console.error(`Failed to fetch data for bucket ${bucketName}:`, error);
        }
    }

    if (allEvents.length === 0) {
        console.warn("API returned an empty list of events.");
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
        .padding(0.5);

    const xAxis = d3.axisBottom(xScale)
        .tickFormat(d => formatAbsoluteTime(d, xScale.domain())); // Pass visible domain to formatAbsoluteTime
    const xAxisGroup = g.append("g")
        .attr("class", "x-axis-bottom")
        .attr("transform", `translate(0, ${height - 20})`)
        .call(xAxis);

    const xAxisTop = d3.axisTop(xScale)
        .tickValues(generateRelativeTimeTicks(xScale, width)) // Use new function to generate ticks
        .tickFormat(d => formatRelativeTime(d)); // Use new function to format
    const xAxisTopGroup = g.append("g")
        .attr("class", "x-axis-top")
        .attr("transform", `translate(0, 20)`) // Place at the top
        .call(xAxisTop);

    return { svg, g, xScale, yScale, xAxisGroup, xAxisTopGroup, timeExtent };
}

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
    const visibleDurationMs = domain[1].getTime() - domain[0].getTime();

    let tickInterval;
    let tickStep;

    // Determine the appropriate tick interval based on the visible duration
    if (visibleDurationMs < 2 * 60 * 60 * 1000) { // Less than 2 hours
        tickInterval = d3.timeMinute;
        if (visibleDurationMs < 30 * 60 * 1000) tickStep = 1;
        else if (visibleDurationMs < 60 * 60 * 1000) tickStep = 5;
        else tickStep = 10;
    } else if (visibleDurationMs < 2 * 24 * 60 * 60 * 1000) { // Less than 2 days
        tickInterval = d3.timeHour;
        tickStep = 1;
        if (visibleDurationMs > 12 * 60 * 60 * 1000) tickStep = 3;
    } else { // More than 2 days
        tickInterval = d3.timeDay;
        tickStep = 1;
        if (visibleDurationMs > 7 * 24 * 60 * 60 * 1000) tickStep = 7;
    }

    const ticks = [];
    let currentTick = tickInterval.offset(now, 0);

    const nowMs = now.getTime();
    const currentTickMs = currentTick.getTime();
    const intervalMs = tickInterval.offset(now, tickStep).getTime() - nowMs;

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
 * Formats a date into a relative time string (e.g., "1m ago", "1h 1m ago").
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

const shortMonthNames = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/**
 * Formats a date into a 24-hour absolute time string, adapting based on the visible time range.
 * @param {Date} date - The date to format.
 * @param {Array<Date>} visibleDomain - The [startDate, endDate] of the currently visible timeline.
 * @returns {string} The formatted time string (e.g., "14:30", "08 авг").
 */
function formatAbsoluteTime(date, visibleDomain) {
    const visibleDurationMs = visibleDomain[1].getTime() - visibleDomain[0].getTime();
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    if (visibleDurationMs < twoDaysInMs) {
        // If zoomed in (less than 2 days visible), show only time
        return `${hours}:${minutes}`;
    } else {
        // If zoomed out (2 days or more visible), show day and short month
        const day = String(date.getDate()).padStart(2, '0');
        const month = shortMonthNames[date.getMonth()];
        return `${day} ${month}`;
    }
}

/**
 * Formats a Date object into a local ISO-like string (YYYY-MM-DD HH:MM:SS).
 * This is useful for input fields where a precise, human-readable, and parsable format is needed.
 * @param {Date} date - The Date object to format.
 * @returns {string} The formatted date-time string.
 */
function toLocalISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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

    tbody.append("tr").html(`<td>Bucket:</td><td>${eventData.bucket}</td>`);
    tbody.append("tr").html(`<td>ID:</td><td>${eventData.id}</td>`);
    tbody.append("tr").html(`<td>Time:</td><td>${eventData.timestamp.toLocaleString('ru-RU')}</td>`);

    let displayedDuration;
    if (eventData.duration > 900) { // 15 minutes = 900 seconds
        displayedDuration = formatDuration(eventData.duration, false);
    } else {
        displayedDuration = formatDuration(eventData.duration);
    }
    tbody.append("tr").html(`<td>Duration:</td><td><span title="${eventData.duration.toFixed(2)} s">${displayedDuration}</span></td>`);

    // Add data attributes
    if (eventData.data) {
        for (const key in eventData.data) {
            if (eventData.data.hasOwnProperty(key)) {
                let value = eventData.data[key];
                if (typeof value === 'object' && value !== null) {
                    value = JSON.stringify(value, null, 2); // Pretty print nested objects
                    tbody.append("tr").html(`<td>${key}:</td><td><pre>${value}</pre></td>`);
                } else {
                    tbody.append("tr").html(`<td>${key}:</td><td>${value}</td>`);
                }
            }
        }
    }
}

function renderLatestEventsTable(events, container) {
    container.select("tbody").html(""); // Clear previous content

    // Filter events to show only 'aw-stopwatch'
    const filteredEvents = events.filter(event => event.bucket === 'aw-stopwatch');

    // Sort filtered events by timestamp in descending order to get the latest
    const latestEvents = filteredEvents.sort((a, b) => b.timestamp - a.timestamp).slice(0, 15); // Get latest 10 events

    latestEvents.forEach(event => {
        const row = container.select("tbody").append("tr");
        row.append("td").text(event.timestamp.toLocaleString('ru-RU'));
        const status = event.data.running ? " ⏳" : "";
        row.append("td").text(formatDuration(event.duration) + status);
        row.append("td").text(`${event.data.label || event.data.status || "N/A"}`);
    });
}

function setupInfoPanelDrag(infoPanel) {
    let isDragging = false;
    let initialMouseX, initialMouseY;
    let initialPanelTop;
    let initialPanelLeft;
    let initialPanelRight;
    let isPositionedByLeft = false;

    infoPanel.on("mousedown", (event) => {
        // Prevent dragging if the click target is an input, button, or label
        const targetTagName = event.target.tagName;
        if (targetTagName === 'INPUT' || targetTagName === 'BUTTON' || targetTagName === 'LABEL') {
            return;
        }

        if (event.target === infoPanel.node() || infoPanel.node().contains(event.target)) {
            isDragging = true;
            initialMouseX = event.clientX;
            initialMouseY = event.clientY;
            const computedStyle = window.getComputedStyle(infoPanel.node());
            initialPanelTop = parseFloat(computedStyle.top);

            // Determine if the panel is positioned by 'left' or 'right'
            if (computedStyle.left !== 'auto' && parseFloat(computedStyle.left) !== 0) {
                initialPanelLeft = parseFloat(computedStyle.left);
                isPositionedByLeft = true;
            } else {
                initialPanelRight = parseFloat(computedStyle.right);
                isPositionedByLeft = false;
            }

            infoPanel.style("cursor", DRAG_CURSOR_GRABBING);
            event.preventDefault();
        }
    });

    document.addEventListener("mousemove", (event) => {
        if (!isDragging) return;

        const deltaX = event.clientX - initialMouseX;
        const deltaY = event.clientY - initialMouseY;

        infoPanel.style("top", (initialPanelTop + deltaY) + "px");

        if (isPositionedByLeft) {
            infoPanel.style("left", (initialPanelLeft + deltaX) + "px");
            infoPanel.style("right", "auto"); // Ensure right is not set
        } else {
            infoPanel.style("right", (initialPanelRight - deltaX) + "px");
            infoPanel.style("left", "auto"); // Ensure left is not set
        }
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
    const POINT_SIZE = 1;

    const segments = g.selectAll(`.${EVENT_SEGMENT_CLASS}`)
        .data(events)
        .enter().append("g")
        .attr("class", d => {
            let classes = [EVENT_SEGMENT_CLASS];
            if (d.data.running) {
                classes.push("running");
            }
            if (d.bucket === 'aw-watcher-afk_CPU17974') {
                if (d.data.status === 'afk') {
                    classes.push("afk-event");
                } else if (d.data.status === 'not-afk') {
                    classes.push("non-afk-event");
                }
            }
            return classes.join(" ");
        })
        .attr("transform", d => `translate(${xScale(d.timestamp)}, ${yScale(d.bucket) - BAR_HEIGHT / 2})`)
        .on("mouseover", (event, d) => {
            infoPanel.style("display", "block");
            renderEventTable(d, dataPre);
        })
        .on("click", (event, d) => {
            if (d.bucket === 'aw-stopwatch') {
                editPanel.style("display", "block");
                renderEventEditPanel(d, d3.select("#edit-event-data-table"));
                editPanel.property("originalEvent", d);
            }
        });

    segments.append("rect")
        .attr("class", "event-body")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", d => {
            const startTime = d.timestamp.getTime();
            const endTime = startTime + d.duration * 1000;
            return xScale(new Date(endTime)) - xScale(d.timestamp);
        })
        .attr("height", BAR_HEIGHT);

    segments.append("rect")
        .attr("class", "event-start-point")
        .attr("x", 0)
        .attr("y", -POINT_SIZE)
        .attr("width", POINT_SIZE)
        .attr("height", POINT_SIZE);

    segments.append("rect")
        .attr("class", "event-end-point")
        .attr("x", d => {
            const startTime = d.timestamp.getTime();
            const endTime = startTime + d.duration * 1000;
            return (xScale(new Date(endTime)) - xScale(d.timestamp)) - POINT_SIZE;
        })
        .attr("y", BAR_HEIGHT)
        .attr("width", POINT_SIZE)
        .attr("height", POINT_SIZE);

    return segments;
}

/**
 * Sets up the event listener for the Escape key to hide the info panel.
 * @param {d3.Selection} infoPanel - The D3 selection for the info panel.
 */
function setupEscapeListener(infoPanel, editPanel, zoomPanel) {
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (editPanel.style('display') === 'block') {
                editPanel.style('display', 'none');
            } else if (infoPanel.style('display') === 'block') {
                infoPanel.style('display', 'none');
            } else {
                // Toggle zoomPanel visibility
                zoomPanel.style('display', zoomPanel.style('display') === 'none' ? 'block' : 'none');
            }
        }
    });
}


/**
 * Zooms and pans the timeline to a specific date range.
 * @param {Date} startDate - The start date of the range.
 * @param {Date} endDate - The end date of the range.
 * @param {d3.Selection} svg - The D3 selection for the SVG element.
 * @param {d3.ScaleTime} originalXScale - The original D3 time scale.
 * @param {d3.ScalePoint} yScale - The D3 point scale for the y-axis. // Added yScale
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
 * @param {d3.ScalePoint} yScale - The D3 point scale for the y-axis. // Added yScale
 * @param {d3.Selection} xAxisGroup - The D3 selection for the x-axis group.
 * @param {d3.Selection} xAxisTopGroup - The D3 selection for the top x-axis group.
 * @param {d3.Selection} segments - The D3 selection for the event segments.
 * @param {Array<Date>} timeExtent - The initial time extent of the data.
 * @param {number} width - The width of the SVG container.
 * @returns {d3.ZoomBehavior<SVGSVGElement>} The D3 zoom behavior.
 */
function setupZoom(svg, xScale, yScale, xAxisGroup, xAxisTopGroup, segments, timeExtent, width) {
    const initialXScaleForExtent = d3.scaleTime()
        .domain(timeExtent)
        .range([0, width]);

    const zoom = d3.zoom()
        .scaleExtent([1, 5000])
        .on("zoom", (event) => {
            const newXScale = event.transform.rescaleX(xScale);
            xAxisGroup.call(d3.axisBottom(newXScale).tickFormat(d => formatAbsoluteTime(d, newXScale.domain())));
            xAxisTopGroup.call(d3.axisTop(newXScale)
                .tickValues(generateRelativeTimeTicks(newXScale, width))
                .tickFormat(d => formatRelativeTime(d)));

            segments.attr("transform", d => `translate(${newXScale(d.timestamp)}, ${yScale(d.bucket) - 10 / 2})`); // Update group transform
            segments.select(".event-body") // Update width of the main rect inside the group
                .attr("width", d => {
                    const startTime = d.timestamp.getTime();
                    const endTime = startTime + d.duration * 1000;
                    return newXScale(new Date(endTime)) - newXScale(d.timestamp);
                });
            segments.select(".event-end-point") // Update position of the end point
                .attr("x", d => {
                    const startTime = d.timestamp.getTime();
                    const endTime = startTime + d.duration * 1000;
                    return (newXScale(new Date(endTime)) - newXScale(d.timestamp)) - 1;
                });
        });

    svg.call(zoom);
    return zoom;
}

function renderEventEditPanel(eventData, container) {
    container.html("");

    const table = container.append("table").attr("class", "event-attributes-table");
    const tbody = table.append("tbody");

    tbody.append("tr").html(`<td>ID:</td><td><input type="text" value="${eventData.id}" readonly></td>`);
    tbody.append("tr").html(`<td>Bucket:</td><td><input type="text" value="${eventData.bucket}" readonly></td>`);
    tbody.append("tr").html(`<td>Title:</td><td><input type="text" id="edit-title-input" value="${eventData.data.label || ''}"></td>`);

    const startTime = eventData.timestamp;
    const endTime = new Date(startTime.getTime() + eventData.duration * 1000);

    tbody.append("tr").html(`<td>Start Time:</td><td><input type="text" id="edit-start-time-input" value="${toLocalISO(startTime)}"></td>`);
    tbody.append("tr").html(`<td>End Time:</td><td><input type="text" id="edit-end-time-input" value="${toLocalISO(endTime)}"></td>`);

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
}

// --- Main Application Setup ---
async function main() {
    const zoomPanel = d3.select("#zoom-panel");
    loadPanelPosition(zoomPanel, 'zoomPanelPosition');
    zoomPanel.style("visibility", "visible");

    let events = await fetchEvents();
    if (events.length === 0) {
        document.body.innerHTML += "<p>No data found.</p>";
        return;
    }

    const container = d3.select(TIMELINE_CONTAINER_SELECTOR);
    const width = container.node().clientWidth;
    const height = container.node().clientHeight;

    let { svg, g, xScale, yScale, xAxisGroup, xAxisTopGroup, timeExtent } = setupChart(events, width, height);
    const infoPanel = d3.select(INFO_PANEL_SELECTOR);
    const editPanel = d3.select(EDIT_PANEL_SELECTOR);
    const dataPre = d3.select(EVENT_DATA_SELECTOR);

    let segments = renderEventPoints(events, xScale, yScale, g, infoPanel, editPanel, dataPre);
    let zoomBehavior = setupZoom(svg, xScale, yScale, xAxisGroup, xAxisTopGroup, segments, timeExtent, width);

    const latestEventsTable = d3.select("#latest-events-table");
    renderLatestEventsTable(events, latestEventsTable);

    // --- UI Interactions Setup ---
    setupZoomControls(svg, xScale, xAxisGroup, segments, width, zoomBehavior);
    setupPanelDragging(infoPanel, editPanel, zoomPanel);
    setupEscapeListener(infoPanel, editPanel, zoomPanel);

    // --- Refresh Function ---
    const refreshDataAndRedraw = async () => {
        events = await fetchEvents();

        // Clear previous chart elements
        g.selectAll("*").remove();

        // Re-setup chart with new data
        const newChart = setupChart(events, width, height);
        xScale = newChart.xScale;
        yScale = newChart.yScale;
        xAxisGroup = newChart.xAxisGroup;
        xAxisTopGroup = newChart.xAxisTopGroup;
        timeExtent = newChart.timeExtent;
        g = newChart.g; // Re-assign g from the new setup

        // Re-render points and setup zoom
        segments = renderEventPoints(events, xScale, yScale, g, infoPanel, editPanel, dataPre);
        zoomBehavior = setupZoom(svg, xScale, yScale, xAxisGroup, xAxisTopGroup, segments, timeExtent, width);

        renderLatestEventsTable(events, latestEventsTable);

        // Re-apply the last zoom as an example
        d3.select("#zoom-last-hour-option").dispatch('click');
    };

    setupEditControls(editPanel, refreshDataAndRedraw);

    // Initial zoom
    d3.select("#zoom-last-hour-option").dispatch('click');
}

// --- Helper Functions ---

function loadPanelPosition(panel, storageKey) {
    const savedPosition = localStorage.getItem(storageKey);
    if (savedPosition) {
        const { top, left } = JSON.parse(savedPosition);
        panel.style("top", top).style("left", left);
    }
}

function savePanelPosition(panel, storageKey) {
    const computedStyle = window.getComputedStyle(panel.node());
    localStorage.setItem(storageKey, JSON.stringify({ top: computedStyle.top, left: computedStyle.left }));
}

function setupZoomControls(svg, xScale, xAxisGroup, segments, width, zoomBehavior) {
    const zoomConfigs = [
        { id: "last-hour", default: 1, unit: 'hours' },
        { id: "last-day", default: 1, unit: 'days' },
        { id: "to-morning", default: 8, unit: 'morning' }
    ];

    const inputs = {};

    zoomConfigs.forEach(config => {
        const input = d3.select(`#zoom-${config.id}-input`);
        inputs[config.id] = input;

        const savedValue = localStorage.getItem(`zoom-${config.id}-value`);
        input.property("value", savedValue || config.default);

        input.on("change", () => localStorage.setItem(`zoom-${config.id}-value`, input.property("value")));
        input.on("wheel", handleWheelScroll);

        d3.select(`#zoom-${config.id}-option`).on("click", () => {
            const value = parseInt(input.property("value"));
            let startTime, endTime = new Date();

            if (config.unit === 'hours') {
                if (isNaN(value) || value < 1 || value > 99) return alert("Please enter a number between 1 and 99 for hours.");
                startTime = new Date(endTime.getTime() - value * 60 * 60 * 1000);
            } else if (config.unit === 'days') {
                if (isNaN(value) || value < 1 || value > 99) return alert("Please enter a number between 1 and 99 for days.");
                startTime = new Date(endTime.getTime() - value * 24 * 60 * 60 * 1000);
            } else if (config.unit === 'morning') {
                const currentHour = endTime.getHours();
                if (isNaN(value) || value < 0 || value > currentHour) return alert(`Please enter a number between 0 and ${currentHour} for the morning hour.`);
                startTime = new Date(endTime.getFullYear(), endTime.getMonth(), endTime.getDate(), value, 0, 0, 0);
            }
            zoomToRange(startTime, endTime, svg, xScale, xAxisGroup, segments, width, zoomBehavior);
        });
    });

    function handleWheelScroll(event) {
        event.preventDefault();
        const input = d3.select(event.currentTarget);
        let value = parseInt(input.property("value"));
        const min = parseInt(input.attr("min"));
        const max = parseInt(input.attr("max"));

        if (event.deltaY < 0) value = Math.min(value + 1, max);
        else if (event.deltaY > 0) value = Math.max(value - 1, min);

        input.property("value", value);
        input.dispatch("change");
    }
}

function setupPanelDragging(...panels) {
    panels.forEach((panel, i) => {
        const storageKey = `${panel.attr('id')}Position`;
        loadPanelPosition(panel, storageKey);
        setupInfoPanelDrag(panel);
        panel.on("mouseup", () => savePanelPosition(panel, storageKey));
    });
}

function setupEditControls(editPanel, onSaveCallback) {
    d3.select("#edit-cancel-button").on("click", () => {
        editPanel.style("display", "none");
    });

    d3.select("#edit-delete-button").on("click", async () => {
        const originalEvent = editPanel.property("originalEvent");
        if (!originalEvent || !confirm(`Are you sure you want to delete event ${originalEvent.id}?`)) return;

        try {
            const response = await fetch(`http://localhost:5600/api/0/buckets/${originalEvent.bucket}/events/${originalEvent.id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            console.log(`Event ${originalEvent.id} deleted successfully.`);
            alert('Event deleted successfully!');
            onSaveCallback();
        } catch (error) {
            console.error(`Failed to delete event ${originalEvent.id}:`, error);
            alert('Failed to delete event. Please check console for details.');
        }
    });

    d3.select("#edit-save-button").on("click", async (e) => {
        e.preventDefault();
        const originalEvent = editPanel.property("originalEvent");
        if (!originalEvent) return alert("No event data to save.");

        const newTitle = d3.select("#edit-title-input").property("value");
        const newStartTime = new Date(d3.select("#edit-start-time-input").property("value"));
        const newEndTime = new Date(d3.select("#edit-end-time-input").property("value"));
        const newDuration = (newEndTime.getTime() - newStartTime.getTime()) / 1000;

        if (newDuration < 0) return alert('End time cannot be before start time.');

        const newEvent = {
            timestamp: newStartTime.toISOString(),
            duration: newDuration,
            data: { ...originalEvent.data, label: newTitle }
        };

        try {
            // Create the new event first
            const createResponse = await fetch(`http://localhost:5600/api/0/buckets/${originalEvent.bucket}/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newEvent)
            });
            if (!createResponse.ok) throw new Error(`HTTP error creating event! status: ${createResponse.status}`);
            console.log('New event created successfully:', await createResponse.json());

            // Then delete the old event
            const deleteResponse = await fetch(`http://localhost:5600/api/0/buckets/${originalEvent.bucket}/events/${originalEvent.id}`, {
                method: 'DELETE'
            });
            if (!deleteResponse.ok) {
                // Note: At this point, the new event is created but the old one failed to delete.
                // This is better than losing data. A more robust solution might involve a transaction or cleanup mechanism.
                throw new Error(`HTTP error deleting old event! status: ${deleteResponse.status}`);
            }
            console.log(`Old event ${originalEvent.id} deleted successfully.`);

            editPanel.style("display", "none");
            onSaveCallback();

        } catch (error) {
            console.error('Failed to update event:', error);
            alert('Failed to update event. Please check console for details.');
        }
    });
}

document.addEventListener('DOMContentLoaded', main);
