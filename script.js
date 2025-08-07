// URL вашего локального API
const apiUrl = 'http://localhost:5600/api/0/buckets/aw-stopwatch/events?limit=1000';

// Constants for selectors and configuration
const SVG_SELECTOR = "#timeline-svg";
const TIMELINE_CONTAINER_SELECTOR = ".timeline-container";
const INFO_PANEL_SELECTOR = "#event-info-panel";
const EVENT_DATA_SELECTOR = "#event-data-table";
const EVENT_SEGMENT_CLASS = "event-segment";
const Y_SCALE_DOMAIN = 'events';
const DRAG_CURSOR_GRABBING = "grabbing";
const DRAG_CURSOR_GRAB = "grab";

/**
 * Fetches event data from the API.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of event objects.
 */
async function fetchEvents() {
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const events = await response.json();

        // Преобразуем timestamp в объекты Date
        const processedEvents = events.map(d => ({
            ...d,
            timestamp: new Date(d.timestamp)
        }));

        if (processedEvents.length === 0) {
            console.warn("API вернуло пустой список событий.");
        }

        return processedEvents;

    } catch (error) {
        console.error("Не удалось получить данные:", error);
        return [];
    }
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

    const yScale = d3.scalePoint()
        .domain([Y_SCALE_DOMAIN])
        .range([height / 2, height / 2]);

    const xAxis = d3.axisBottom(xScale);
    const xAxisGroup = g.append("g")
        .attr("transform", `translate(0, ${height - 20})`)
        .call(xAxis);

    return { svg, g, xScale, yScale, xAxisGroup, timeExtent }; // Return timeExtent
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
function formatDuration(seconds, includeSeconds = true) {
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var remainingSeconds = Math.floor(seconds % 60);

    var result = "";
    if (hours > 0) result += hours + "ч ";
    if (minutes > 0) result += minutes + "м ";
    if (includeSeconds) result += remainingSeconds + "с";

    return result.trim();
}

function renderEventTable(eventData, container) {
    container.html(""); // Clear previous content

    var table = container.append("table").attr("class", "event-attributes-table");
    var tbody = table.append("tbody");

    // Add basic event info
    tbody.append("tr").html(`<td>ID:</td><td>${eventData.id}</td>`);
    tbody.append("tr").html(`<td>Время:</td><td>${eventData.timestamp.toLocaleString()}</td>`);

    var displayedDuration;
    if (eventData.duration > 900) { // 15 minutes = 900 seconds
        displayedDuration = formatDuration(eventData.duration, false);
    } else {
        displayedDuration = formatDuration(eventData.duration);
    }
    tbody.append("tr").html(`<td>Длительность:</td><td><span title="${eventData.duration.toFixed(2)} с.">${displayedDuration}</span></td>`);

    // Add data attributes
    if (eventData.data) {
        for (var key in eventData.data) {
            if (eventData.data.hasOwnProperty(key)) {
                var value = eventData.data[key];
                // Handle nested objects or arrays
                if (typeof value === 'object' && value !== null) {
                    value = JSON.stringify(value, null, 2); // Pretty print nested objects
                }
                tbody.append("tr").html(`<td>${key}:</td><td>${value}</td>`);
            }
        }
    }
}

function setupInfoPanelDrag(infoPanel) {
    var isDragging = false;
    var initialMouseX, initialMouseY;
    var initialPanelTop, initialPanelRight;

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
 * @param {d3.Selection} dataPre - The D3 selection for the pre element to display data.
 * @returns {d3.Selection} The D3 selection for the rendered event segments.
 */
function renderEventPoints(events, xScale, yScale, g, infoPanel, dataPre) {
    const BAR_HEIGHT = 10;

    const segments = g.selectAll(EVENT_SEGMENT_CLASS)
        .data(events)
        .enter().append("rect")
        .attr("class", EVENT_SEGMENT_CLASS)
        .attr("x", d => xScale(d.timestamp))
        .attr("y", yScale(Y_SCALE_DOMAIN) - BAR_HEIGHT / 2)
        .attr("width", d => {
            const startTime = d.timestamp.getTime();
            const endTime = startTime + d.duration * 1000;
            return xScale(new Date(endTime)) - xScale(d.timestamp);
        })
        .attr("height", BAR_HEIGHT)
        .on("mouseover", (event, d) => {
            infoPanel.style("display", "block");

            renderEventTable(d, dataPre);
        });
    return segments;
}

/**
 * Sets up the event listener for the Escape key to hide the info panel.
 * @param {d3.Selection} infoPanel - The D3 selection for the info panel.
 */
function setupEscapeListener(infoPanel) {
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            infoPanel.style('display', 'none');
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
 * @param {d3.Selection} segments - The D3 selection for the event segments.
 * @param {Array<Date>} timeExtent - The initial time extent of the data.
 * @param {number} width - The width of the SVG container.
 * @returns {d3.ZoomBehavior<SVGSVGElement>} The D3 zoom behavior.
 */
function setupZoom(svg, xScale, xAxisGroup, segments, timeExtent, width) {
    const initialXScaleForExtent = d3.scaleTime()
        .domain(timeExtent)
        .range([0, width]);

    const zoom = d3.zoom()
        .scaleExtent([1, 100])
        // .translateExtent([[initialXScaleForExtent(timeExtent[0]), 0], [initialXScaleForExtent(timeExtent[1]), 0]])
        .on("zoom", (event) => {
            const newXScale = event.transform.rescaleX(xScale);
            xAxisGroup.call(d3.axisBottom(newXScale));
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

    const { svg, g, xScale, yScale, xAxisGroup, timeExtent } = setupChart(events, width, height);
    const infoPanel = d3.select(INFO_PANEL_SELECTOR);
    const dataPre = d3.select(EVENT_DATA_SELECTOR);

    const segments = renderEventPoints(events, xScale, yScale, g, infoPanel, dataPre);

    const zoomBehavior = setupZoom(svg, xScale, xAxisGroup, segments, timeExtent, width);

    const zoomLastHourButton = d3.select("#zoom-last-hour");
    const zoomLastDayButton = d3.select("#zoom-last-day");
    const zoomToMorningButton = d3.select("#zoom-to-morning");

    zoomLastHourButton.on("click", () => {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        zoomToRange(oneHourAgo, now, svg, xScale, xAxisGroup, segments, width, zoomBehavior);
    });

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
    setupEscapeListener(infoPanel);
});
