// URL вашего локального API
const apiUrl = 'http://localhost:5600/api/0/buckets/aw-stopwatch/events?limit=1000';

// Constants for selectors and configuration
const SVG_SELECTOR = "#timeline-svg";
const TIMELINE_CONTAINER_SELECTOR = ".timeline-container";
const INFO_PANEL_SELECTOR = "#event-info-panel";
const EVENT_DATA_SELECTOR = "#event-data";
const EVENT_POINT_CLASS = "event-point";
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
 * @returns {Object} An object containing D3 selections and scales.
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

    return { svg, g, xScale, yScale, xAxisGroup };
}

/**
 * Sets up drag-and-drop functionality for the info panel.
 * @param {d3.Selection} infoPanel - The D3 selection for the info panel.
 */
function setupInfoPanelDrag(infoPanel) {
    let isDragging = false;
    let initialMouseX, initialMouseY;
    let initialPanelTop, initialPanelRight;

    infoPanel.on("mousedown", (event) => {
        // Ensure the click is on the panel itself, not its content if it were to expand
        // Check if the target is the panel itself or a child of the panel
        if (event.target === infoPanel.node() || infoPanel.node().contains(event.target)) {
            isDragging = true;
            initialMouseX = event.clientX;
            initialMouseY = event.clientY;
            // Get current computed styles for top and right
            const computedStyle = window.getComputedStyle(infoPanel.node());
            initialPanelTop = parseFloat(computedStyle.top);
            initialPanelRight = parseFloat(computedStyle.right);
            infoPanel.style("cursor", DRAG_CURSOR_GRABBING);
            // Prevent default drag behavior if any
            event.preventDefault();
        }
    });

    document.addEventListener("mousemove", (event) => {
        if (!isDragging) return;

        const deltaX = event.clientX - initialMouseX;
        const deltaY = event.clientY - initialMouseY;

        infoPanel.style("top", (initialPanelTop + deltaY) + "px");
        infoPanel.style("right", (initialPanelRight - deltaX) + "px"); // Right decreases as mouse moves right
    });

    document.addEventListener("mouseup", () => {
        if (isDragging) {
            isDragging = false;
            infoPanel.style("cursor", DRAG_CURSOR_GRAB);
        }
    });
}

/**
 * Renders the event points on the timeline and sets up mouseover events.
 * @param {Array<Object>} events - The array of event data.
 * @param {d3.ScaleTime} xScale - The D3 time scale for the x-axis.
 * @param {d3.ScalePoint} yScale - The D3 point scale for the y-axis.
 * @param {d3.Selection} g - The D3 selection for the SVG group.
 * @param {d3.Selection} infoPanel - The D3 selection for the info panel.
 * @param {d3.Selection} dataPre - The D3 selection for the pre element to display data.
 * @returns {d3.Selection} The D3 selection for the rendered event points.
 */
function renderEventPoints(events, xScale, yScale, g, infoPanel, dataPre) {
    const points = g.selectAll(EVENT_POINT_CLASS)
        .data(events)
        .enter().append("circle")
        .attr("class", EVENT_POINT_CLASS)
        .attr("cx", d => xScale(d.timestamp))
        .attr("cy", yScale(Y_SCALE_DOMAIN))
        .attr("r", 3)
        .on("mouseover", (event, d) => {
            infoPanel.style("display", "block");

            const eventInfo = {
                id: d.id,
                timestamp: d.timestamp.toLocaleString(), // Преобразуем в читаемый формат
                duration: `${d.duration.toFixed(2)} с.`,
                data: d.data
            };
            dataPre.text(JSON.stringify(eventInfo, null, 2));
        });
    return points;
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
 * Sets up the D3 zoom behavior for the SVG.
 * @param {d3.Selection} svg - The D3 selection for the SVG element.
 * @param {d3.ScaleTime} xScale - The D3 time scale for the x-axis.
 * @param {d3.Selection} xAxisGroup - The D3 selection for the x-axis group.
 * @param {d3.Selection} points - The D3 selection for the event points.
 */
function setupZoom(svg, xScale, xAxisGroup, points) {
    const zoom = d3.zoom()
        .scaleExtent([1, 100])
        .translateExtent([[0, 0], [Infinity, 0]])
        .on("zoom", (event) => {
            const newXScale = event.transform.rescaleX(xScale);
            xAxisGroup.call(d3.axisBottom(newXScale));
            points.attr("cx", d => newXScale(d.timestamp));
        });
    svg.call(zoom);
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

    const { svg, g, xScale, yScale, xAxisGroup } = setupChart(events, width, height);
    const infoPanel = d3.select(INFO_PANEL_SELECTOR);
    const dataPre = d3.select(EVENT_DATA_SELECTOR);

    setupInfoPanelDrag(infoPanel);
    const points = renderEventPoints(events, xScale, yScale, g, infoPanel, dataPre);
    setupEscapeListener(infoPanel);
    setupZoom(svg, xScale, xAxisGroup, points);
});
