import { formatAbsoluteTime, formatRelativeTime, generateRelativeTimeTicks, toLocalISO } from './utils.js';
import { getActiveTimeInput } from './ui.js';

const SVG_SELECTOR = "#timeline-svg";
const TIMELINE_CONTAINER_SELECTOR = ".timeline-container";
const EVENT_SEGMENT_CLASS = "event-segment-group";
const BAR_HEIGHT = 10;
const POINT_SIZE = 1;
const HOVER_LINE_CLASS = "hover-line";
const HOVER_TOOLTIP_CLASS = "hover-tooltip";
const TOOLTIP_OFFSET_Y = 25;

export let svg, g, xScale, yScale, xAxisGroup, xAxisTopGroup, timeExtent, zoomBehavior;
export let width, height;
let hoverLine, hoverTooltip;

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
        .range([height - 50, 50])
        .padding(0.5);

    const xAxis = window.d3.axisBottom(xScale)
        .tickFormat(d => formatAbsoluteTime(d, xScale.domain()));
    xAxisGroup = g.append("g")
        .attr("class", "x-axis-bottom")
        .attr("transform", `translate(0, ${height - 20})`)
        .call(xAxis);

    const xAxisTop = window.d3.axisTop(xScale)
        .tickValues(generateRelativeTimeTicks(xScale, width))
        .tickFormat(d => formatRelativeTime(d));
    xAxisTopGroup = g.append("g")
        .attr("class", "x-axis-top")
        .attr("transform", `translate(0, 20)`)
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
        .attr("id", d => `event-${d.id}`)
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
            window.d3.select(`#latest-events-table tbody tr[data-event-id="${d.id}"]`).classed("highlighted", true);
        })
        .on("mouseout", (event, d) => {
            window.d3.select(`#latest-events-table tbody tr[data-event-id="${d.id}"]`).classed("highlighted", false);
        })
        .on("click", (event, d) => {
            if (editPanel.style("display") === "block" && editPanel.property("isSplitMode")) {
                return;
            }

            panAndZoomToEvent(d);

            if (d.bucket.startsWith('aw-stopwatch')) {
                editPanel.style("display", "block");
                editPanel.property("isSplitMode", false);
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
    if (!hoverLine) {
        hoverLine = svg.append("line")
            .attr("class", HOVER_LINE_CLASS)
            .attr("y1", 0)
            .attr("y2", height)
            .attr("stroke", "red")
            .attr("stroke-width", 1)
            .attr("pointer-events", "none")
            .style("display", "none");
    }

    if (!hoverTooltip) {
        hoverTooltip = svg.append("text")
            .attr("class", HOVER_TOOLTIP_CLASS)
            .attr("text-anchor", "middle")
            .attr("fill", "black")
            .attr("font-size", "12px")
            .attr("pointer-events", "none")
            .style("display", "none");
    }

    svg.on("mousemove", (event) => {
        const activeInput = getActiveTimeInput();
        if (editPanel.style("display") === "block" && activeInput) {
            const [xCoord] = window.d3.pointer(event);
            const currentXScale = window.d3.zoomTransform(svg.node()).rescaleX(xScale);
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
            const currentXScale = window.d3.zoomTransform(svg.node()).rescaleX(xScale);
            const clickedTime = currentXScale.invert(xCoord);
            activeInput.value = toLocalISO(clickedTime);

            activeInput.dispatchEvent(new Event('input', { bubbles: true }));

            hoverLine.style("display", "none");
            hoverTooltip.style("display", "none");
        }
    });

    svg.on("mouseleave", () => {
        hoverLine.style("display", "none");
        hoverTooltip.style("display", "none");
    });
}

/**
 * Pans and zooms the timeline to focus on a specific event, with adjusted zoom levels.
 * If the event is already reasonably sized on screen, it only pans.
 * Otherwise, it zooms so the event takes up roughly 10% of the timeline width.
 * @param {Object} d - The event data object.
 */
export function panAndZoomToEvent(d) {
    const eventStartTime = d.timestamp;
    const eventDurationMs = d.duration * 1000;

    const currentTransform = window.d3.zoomTransform(svg.node());
    const currentXScale = currentTransform.rescaleX(xScale);

    if (eventDurationMs <= 0) {
        const eventCenterPixels = currentXScale(eventStartTime);
        const timelineCenterPixels = width / 2;
        const dx = timelineCenterPixels - eventCenterPixels;

        svg.transition().duration(750).call(zoomBehavior.translateBy, dx, 0);
        return;
    }

    const eventEndTime = new Date(eventStartTime.getTime() + eventDurationMs);
    const eventPixelWidth = currentXScale(eventEndTime) - currentXScale(eventStartTime);

    const timelineWidth = width;
    const minPixelWidth = 50;
    const maxPixelWidth = timelineWidth * 0.9;

    if (eventPixelWidth >= minPixelWidth && eventPixelWidth <= maxPixelWidth) {
        const eventCenterTime = new Date(eventStartTime.getTime() + eventDurationMs / 2);
        const eventCenterPixels = currentXScale(eventCenterTime);
        const timelineCenterPixels = timelineWidth / 2;
        const dx = timelineCenterPixels - eventCenterPixels;

        const newTransform = window.d3.zoomIdentity
            .translate(currentTransform.x + dx, currentTransform.y)
            .scale(currentTransform.k);

        svg.transition().duration(750).call(zoomBehavior.transform, newTransform);

    } else {
        const desiredVisibleDurationMs = eventDurationMs / 0.1;
        const eventCenterTime = new Date(eventStartTime.getTime() + eventDurationMs / 2);

        const newStartTime = new Date(eventCenterTime.getTime() - desiredVisibleDurationMs / 2);
        const newEndTime = new Date(eventCenterTime.getTime() + desiredVisibleDurationMs / 2);

        zoomToRange(newStartTime, newEndTime);
    }
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
            if (event.type === 'wheel') {
                return true;
            }
            if (editPanel.style("display") === "block") {
                return false;
            }
            return !event.button;
        })
        .on("zoom", (event) => {
            const newXScale = event.transform.rescaleX(xScale);
            xAxisGroup.call(window.d3.axisBottom(newXScale).tickFormat(d => formatAbsoluteTime(d, newXScale.domain())));
            xAxisTopGroup.call(window.d3.axisTop(newXScale)
                .tickValues(generateRelativeTimeTicks(newXScale, width))
                .tickFormat(d => formatRelativeTime(d)));

            const segments = g.selectAll(`.${EVENT_SEGMENT_CLASS}`);

            segments.attr("transform", d => `translate(${newXScale(d.timestamp)}, ${yScale(d.bucket) - BAR_HEIGHT / 2})`);
            segments.select(".event-body")
                .attr("width", d => {
                    const startTime = d.timestamp.getTime();
                    const endTime = startTime + d.duration * 1000;
                    return newXScale(new Date(endTime)) - newXScale(d.timestamp);
                });
            segments.select(".event-end-point")
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
        hoverLine.attr("y2", height);
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
export async function redrawTimeline(allEvents, visibleBuckets, infoPanel, editPanel, dataPre, renderEventTableCallback, renderEventEditPanelCallback, renderLatestEventsTableCallback, zoomToEventCallback) {
    const filteredEvents = allEvents.filter(event => visibleBuckets.includes(event.bucket));

    g.selectAll("*").remove();

    setupChart(filteredEvents, width, height);

    resetHoverElements();

    renderEventPoints(filteredEvents, infoPanel, editPanel, dataPre, renderEventTableCallback, renderEventEditPanelCallback);

    setupZoom();

    renderLatestEventsTableCallback(filteredEvents, window.d3.select("#latest-events-table"), zoomToEventCallback);

    const currentTransform = window.d3.zoomTransform(svg.node());
    if (currentTransform && currentTransform.k !== 1) {
        svg.call(zoomBehavior.transform, currentTransform);
    }
}
