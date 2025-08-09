import { formatAbsoluteTime, formatRelativeTime, generateRelativeTimeTicks, toLocalISO } from './utils.js';
import { getActiveTimeInput } from './ui.js'; // Import the function to get the active input

// Constants for selectors and configuration
const SVG_SELECTOR = "#timeline-svg";
const TIMELINE_CONTAINER_SELECTOR = ".timeline-container";
const EVENT_SEGMENT_CLASS = "event-segment-group";
const BAR_HEIGHT = 10;
const POINT_SIZE = 1;
const HOVER_LINE_CLASS = "hover-line";
const HOVER_TOOLTIP_CLASS = "hover-tooltip";
const TOOLTIP_OFFSET_Y = 25; // Offset for the tooltip from the top axis

// Global variables for chart elements and data
export let svg, g, xScale, yScale, xAxisGroup, xAxisTopGroup, timeExtent, zoomBehavior;
export let width, height; // Store width and height globally
let hoverLine, hoverTooltip; // Elements for hover interaction

/**
 * Sets up the D3 chart elements, scales, and axes.
 * @param {Array<Object>} events - The array of event data.
 * @param {number} chartWidth - The width of the SVG container.
 * @param {number} chartHeight - The height of the SVG container.
 * @returns {Object} An object containing D3 selections, scales, and initial time extent.
 */
export function setupChart(events, chartWidth, chartHeight) {
    width = chartWidth;
    height = chartHeight;

    svg = window.d3.select(SVG_SELECTOR);
    const container = window.d3.select(TIMELINE_CONTAINER_SELECTOR);

    svg.attr("width", width).attr("height", height);

    g = svg.append("g");

    timeExtent = d3.extent(events, d => d.timestamp);
    xScale = d3.scaleTime()
        .domain(timeExtent)
        .range([0, width]);

    const uniqueBuckets = [...new Set(events.map(d => d.bucket))].sort();
    yScale = d3.scalePoint()
        .domain(uniqueBuckets)
        .range([height - 50, 50]) // Adjust range to give space for labels and axes
        .padding(0.5);

    const xAxis = window.d3.axisBottom(xScale)
        .tickFormat(d => formatAbsoluteTime(d, xScale.domain())); // Pass visible domain to formatAbsoluteTime
    xAxisGroup = g.append("g")
        .attr("class", "x-axis-bottom")
        .attr("transform", `translate(0, ${height - 20})`)
        .call(xAxis);

    const xAxisTop = window.d3.axisTop(xScale)
        .tickValues(generateRelativeTimeTicks(xScale, width)) // Use new function to generate ticks
        .tickFormat(d => formatRelativeTime(d)); // Use new function to format
    xAxisTopGroup = g.append("g")
        .attr("class", "x-axis-top")
        .attr("transform", `translate(0, 20)`) // Place at the top
        .call(xAxisTop);

    return { svg, g, xScale, yScale, xAxisGroup, xAxisTopGroup, timeExtent };
}

/**
 * Renders the event segments on the timeline and sets up mouseover events.
 * @param {Array<Object>} events - The array of event data.
 * @param {d3.Selection} infoPanel - The D3 selection for the info panel.
 * @param {d3.Selection} editPanel - The D3 selection for the edit panel.
 * @param {d3.Selection} dataPre - The D3 selection for the pre element to display data.
 * @returns {d3.Selection} The D3 selection for the rendered event segments.
 */
export function renderEventPoints(events, infoPanel, editPanel, dataPre, renderEventTableCallback, renderEventEditPanelCallback) {
    const segments = g.selectAll(`.${EVENT_SEGMENT_CLASS}`)
        .data(events)
        .enter().append("g")
        .attr("class", d => {
            let classes = [EVENT_SEGMENT_CLASS];
            if (d.data.running) {
                classes.push("running");
            }
            // FIX: Use startsWith for dynamic bucket names
            if (d.bucket.startsWith('aw-watcher-afk_')) {
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
            renderEventTableCallback(d, dataPre);
        })
        .on("click", (event, d) => {
            if (d.bucket === 'aw-stopwatch') {
                editPanel.style("display", "block");
                editPanel.property("isSplitMode", false); // Initialize split mode flag
                renderEventEditPanelCallback(d, window.d3.select("#edit-event-data-table"), editPanel.property("isSplitMode"));
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
 * Sets up the hover interaction for the timeline, including a vertical line and tooltip.
 * @param {d3.Selection} svg - The D3 selection for the SVG element.
 * @param {d3.Selection} editPanel - The D3 selection for the edit panel.
 */
export function setupTimelineHoverInteraction(svg, editPanel) {
    // Create the hover line and tooltip elements if they don't exist
    if (!hoverLine) {
        hoverLine = svg.append("line")
            .attr("class", HOVER_LINE_CLASS)
            .attr("y1", 0)
            .attr("y2", height)
            .attr("stroke", "red")
            .attr("stroke-width", 1)
            .attr("pointer-events", "none")
            .style("display", "none"); // Hidden by default
    }

    if (!hoverTooltip) {
        hoverTooltip = svg.append("text")
            .attr("class", HOVER_TOOLTIP_CLASS)
            .attr("text-anchor", "middle")
            .attr("fill", "black")
            .attr("font-size", "12px")
            .attr("pointer-events", "none")
            .style("display", "none"); // Hidden by default
    }

    svg.on("mousemove", (event) => {
        const activeInput = getActiveTimeInput();
        if (editPanel.style("display") === "block" && activeInput) {
            const [xCoord] = window.d3.pointer(event);
            const currentXScale = window.d3.zoomTransform(svg.node()).rescaleX(xScale); // Get current scaled X-axis
            const hoveredTime = currentXScale.invert(xCoord);

            hoverLine.attr("x1", xCoord).attr("x2", xCoord).style("display", "block");
            hoverTooltip.attr("x", xCoord).attr("y", TOOLTIP_OFFSET_Y).text(toLocalISO(hoveredTime)).style("display", "block");
        } else {
            hoverLine.style("display", "none");
            hoverTooltip.style("display", "none");
        }
    });

    svg.on("click", (event) => {
        const activeInput = getActiveTimeInput();
        if (editPanel.style("display") === "block" && activeInput) {
            const [xCoord] = window.d3.pointer(event);
            const currentXScale = window.d3.zoomTransform(svg.node()).rescaleX(xScale); // Get current scaled X-axis
            const clickedTime = currentXScale.invert(xCoord);
            activeInput.value = toLocalISO(clickedTime);

            // Manually dispatch an 'input' event to trigger the save button state check in ui.js
            activeInput.dispatchEvent(new Event('input', { bubbles: true }));

            hoverLine.style("display", "none");
            hoverTooltip.style("display", "none");
        }
    });

    // Hide hover elements when mouse leaves SVG
    svg.on("mouseleave", () => {
        hoverLine.style("display", "none");
        hoverTooltip.style("display", "none");
    });
}

/**
 * Zooms and pans the timeline to a specific date range.
 * @param {Date} startDate - The start date of the range.
 * @param {Date} endDate - The end date of the range.
 */
export function zoomToRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const rangeWidth = xScale(end) - xScale(start);
    if (rangeWidth <= 0) {
        console.warn("Invalid date range for zoom.");
        return;
    }
    const k = width / rangeWidth;

    const x = -xScale(start);

    const newTransform = window.d3.zoomIdentity.scale(k).translate(x, 0);

    svg.transition().duration(750).call(zoomBehavior.transform, newTransform);
}


/**
 * Sets up the D3 zoom behavior for the SVG.
 */
export function setupZoom() {
    const initialXScaleForExtent = window.d3.scaleTime()
        .domain(timeExtent)
        .range([0, width]);

    zoomBehavior = window.d3.zoom()
        .scaleExtent([1, 5000])
        .filter((event) => {
            const editPanel = window.d3.select("#event-edit-panel");
            // Allow wheel events for zooming anytime.
            if (event.type === 'wheel') {
                return true;
            }
            // If the edit panel is open, block other mouse events to allow time selection.
            if (editPanel.style("display") === "block") {
                return false;
            }
            // Otherwise, allow default zoom drag behavior (no right-click).
            return !event.button;
        })
        .on("zoom", (event) => {
            const newXScale = event.transform.rescaleX(xScale);
            xAxisGroup.call(window.d3.axisBottom(newXScale).tickFormat(d => formatAbsoluteTime(d, newXScale.domain())));
            xAxisTopGroup.call(window.d3.axisTop(newXScale)
                .tickValues(generateRelativeTimeTicks(newXScale, width))
                .tickFormat(d => formatRelativeTime(d)));

            // Re-select segments to ensure they are updated after data changes
            const segments = g.selectAll(`.${EVENT_SEGMENT_CLASS}`);

            segments.attr("transform", d => `translate(${newXScale(d.timestamp)}, ${yScale(d.bucket) - BAR_HEIGHT / 2})`); // Update group transform
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
                    return (newXScale(new Date(endTime)) - newXScale(d.timestamp)) - POINT_SIZE;
                });
        });

    svg.call(zoomBehavior);
    return zoomBehavior;
}

/**
 * Resets the hover line and tooltip positions and visibility.
 * This should be called when the timeline is redrawn or zoomed.
 */
function resetHoverElements() {
    if (hoverLine) {
        hoverLine.attr("y2", height); // Update height in case of resize
        hoverLine.style("display", "none");
    }
    if (hoverTooltip) {
        hoverTooltip.style("display", "none");
    }
}

/**
 * Redraws the timeline based on the currently visible buckets.
 * @param {Array<Object>} allEvents - The complete array of all fetched events.
 * @param {Array<string>} visibleBuckets - Array of bucket names that should be visible.
 * @param {d3.Selection} infoPanel - The D3 selection for the info panel.
 * @param {d3.Selection} editPanel - The D3 selection for the edit panel.
 * @param {d3.Selection} dataPre - The D3 selection for the pre element to display data.
 * @param {function} renderEventTableCallback - Callback to render event info table.
 * @param {function} renderEventEditPanelCallback - Callback to render event edit panel.
 * @param {function} renderLatestEventsTableCallback - Callback to render latest events table.
 */
export async function redrawTimeline(allEvents, visibleBuckets, infoPanel, editPanel, dataPre, renderEventTableCallback, renderEventEditPanelCallback, renderLatestEventsTableCallback) {
    // Filter events based on currently visible buckets
    const filteredEvents = allEvents.filter(event => visibleBuckets.includes(event.bucket));

    // Clear previous chart elements
    g.selectAll("*").remove();

    // Re-setup chart with new data (especially for time extent and unique buckets)
    // We need to re-calculate scales based on the *filtered* events to ensure correct rendering
    setupChart(filteredEvents, width, height);

    // Reset hover elements after chart redraw
    resetHoverElements();

    // Re-render points and setup zoom
    let segments = renderEventPoints(filteredEvents, infoPanel, editPanel, dataPre, renderEventTableCallback, renderEventEditPanelCallback);
    // Re-assign click and mouseover handlers with correct callbacks
    segments.on("mouseover", (event, d) => {
        infoPanel.style("display", "block");
        renderEventTableCallback(d, dataPre);
    })
    .on("click", (event, d) => {
        if (d.bucket === 'aw-stopwatch') {
            editPanel.style("display", "block");
            editPanel.property("isSplitMode", false); // Initialize split mode flag
            renderEventEditPanelCallback(d, window.d3.select("#edit-event-data-table"), editPanel.property("isSplitMode"));
            editPanel.property("originalEvent", d);
        }
    });

    setupZoom(); // Re-setup zoom to apply to new segments

    // Update latest events table
    renderLatestEventsTableCallback(filteredEvents, window.d3.select("#latest-events-table"));

    // Restore zoom/pan state if possible
    const currentTransform = window.d3.zoomTransform(svg.node());
    if (currentTransform && currentTransform.k !== 1) {
        svg.call(zoomBehavior.transform, currentTransform);
    }
}
