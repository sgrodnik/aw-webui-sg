import { formatAbsoluteTime, formatRelativeTime, generateRelativeTimeTicks } from './utils.js';
import { getAllEventsData, getVisibleBuckets, getColorRules } from './state.js';
import { renderLatestEventsTable } from './ui.js';
import { renderEventPoints } from './timelineRenderer.js';
import { setupTimelineHoverInteraction, panAndZoomToEvent, zoomToRange, resetHoverElements } from './timelineInteraction.js';

const SVG_SELECTOR = "#timeline-svg";
const TIMELINE_CONTAINER_SELECTOR = ".timeline-container";

export let svg, g, xScale, yScale, xAxisGroup, xAxisTopGroup, timeExtent, zoomBehavior;
export let width, height;

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

    // Add a defs section for clipPaths
    svg.append('defs');

    return { svg, g, xScale, yScale, xAxisGroup, xAxisTopGroup, timeExtent };
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

            const segments = g.selectAll(".event-segment-group");

            segments.attr("transform", d => `translate(${newXScale(d.timestamp)}, ${yScale(d.bucket) - 30 / 2})`);
            g.selectAll(".event-segment-group").each(function(d) {
                const group = window.d3.select(this);
                group.attr("transform", `translate(${newXScale(d.timestamp)}, ${yScale(d.bucket) - 30 / 2})`);

                let totalWidth = 0;

                if (d.bucket.startsWith('aw-stopwatch') && d.activitySegments) {
                    group.selectAll(".event-segment-rect")
                        .attr("x", segment => newXScale(segment.startTimestamp) - newXScale(d.timestamp))
                        .attr("width", segment => {
                            const width = Math.max(0, newXScale(new Date(segment.startTimestamp.getTime() + segment.duration * 1000)) - newXScale(segment.startTimestamp));
                            totalWidth += width;
                            return width;
                        });
                } else {
                    const width = Math.max(0, newXScale(new Date(d.timestamp.getTime() + d.duration * 1000)) - newXScale(d.timestamp));
                    group.select(".event-body").attr("width", width);
                    totalWidth = width;
                }

                // Update clip path
                svg.select(`#clip-${d.id} rect`).attr("width", totalWidth);

                // Hide label if the event is too small
                group.select(".event-label").style("display", totalWidth < 20 ? "none" : "inline");
            });
        });

    svg.call(zoomBehavior);
    return zoomBehavior;
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
 * @param {function} zoomToEventCallback - Callback to zoom/pan the timeline to a specific event.
 * @param {d3.Selection} newEventLabelInput - The D3 selection for the new event label input field.
 */
export async function redrawTimeline(allEvents, visibleBuckets, infoPanel, editPanel, dataPre, renderEventTableCallback, renderEventEditPanelCallback, zoomToEventCallback, newEventLabelInput) {
    const filteredEvents = allEvents.filter(event => visibleBuckets.includes(event.bucket));

    g.selectAll("*").remove();

    setupChart(filteredEvents, width, height);

    resetHoverElements();
    setupTimelineHoverInteraction(editPanel);

    renderEventPoints(filteredEvents, infoPanel, editPanel, dataPre, renderEventTableCallback, renderEventEditPanelCallback, panAndZoomToEvent, getColorRules);

    setupZoom();

    const latestEventsTable = window.d3.select("#latest-events-table");
    if (!latestEventsTable.empty()) {
        renderLatestEventsTable(filteredEvents, latestEventsTable, zoomToEventCallback, newEventLabelInput);
    } else {
        console.warn("redrawTimeline: latest-events-table not found");
    }

    const currentTransform = window.d3.zoomTransform(svg.node());
    if (currentTransform && currentTransform.k !== 1) {
        svg.call(zoomBehavior.transform, currentTransform);
    }
}
