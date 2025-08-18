import { toLocalISO, formatDuration } from './utils.js';
import { getActiveTimeInput } from './eventForm.js';
import { svg, xScale, zoomBehavior, width, height } from './timeline.js'; // Импорт общих переменных из timeline.js

const HOVER_LINE_CLASS = "hover-line";
const HOVER_TOOLTIP_CLASS = "hover-tooltip";
const TOOLTIP_OFFSET_Y = 35;

let hoverLine, hoverTooltip;

/**
 * Sets up the hover interaction for the timeline, including a vertical line and tooltip.
 * @param {d3.Selection} editPanel - The D3 selection for the edit panel.
 */
export function setupTimelineHoverInteraction(editPanel) {
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

            let tooltipText = toLocalISO(hoveredTime);
            let secondLineText = "";

            const originalEvent = editPanel.property("originalEvent");
            const isSplitMode = editPanel.property("isSplitMode");

            if (originalEvent) {
                const origDur = originalEvent.duration;

                // Get current values from inputs, default to original event times if inputs are not yet rendered or active
                // Use .empty() to check if the selection is empty (element not found)
                let currentStartTime = new Date(window.d3.select("#edit-start-time-input").empty()
                    ? originalEvent.timestamp
                    : window.d3.select("#edit-start-time-input").property("value"));
                let currentEndTime = new Date(window.d3.select("#edit-end-time-input").empty()
                    ? new Date(originalEvent.timestamp.getTime() + originalEvent.duration * 1000)
                    : window.d3.select("#edit-end-time-input").property("value"));
                let currentStartTime2 = new Date(window.d3.select("#edit-start-time-2-input").empty()
                    ? new Date(originalEvent.timestamp.getTime() + originalEvent.duration * 500)
                    : window.d3.select("#edit-start-time-2-input").property("value"));
                let currentEndTime2 = new Date(window.d3.select("#edit-end-time-2-input").empty()
                    ? new Date(originalEvent.timestamp.getTime() + originalEvent.duration * 1000)
                    : window.d3.select("#edit-end-time-2-input").property("value"));

                const origNewDur1 = (currentEndTime.getTime() - currentStartTime.getTime()) / 1000;
                const origNewDur2 = (currentEndTime2.getTime() - currentStartTime2.getTime()) / 1000;

                // Update the relevant time based on active input, if activeInput is not null
                if (activeInput) {
                    if (activeInput.id === "edit-start-time-input") {
                        currentStartTime = hoveredTime;
                    } else if (activeInput.id === "edit-end-time-input") {
                        currentEndTime = hoveredTime;
                        currentStartTime2 = hoveredTime; // This is the key change for split mode
                    } else if (activeInput.id === "edit-start-time-2-input") {
                        currentStartTime2 = hoveredTime;
                    } else if (activeInput.id === "edit-end-time-2-input") {
                        currentEndTime2 = hoveredTime;
                    }
                }

                if (isSplitMode) {
                    const dur1 = (currentEndTime.getTime() - currentStartTime.getTime()) / 1000;
                    const dur2 = (currentEndTime2.getTime() - currentStartTime2.getTime()) / 1000;

                    if (!isNaN(dur1) && !isNaN(dur2)) {
                        if (activeInput.id === "edit-start-time-input") {
                            secondLineText = `${formatTooltipTime(dur1, origNewDur1)}`;
                        } else if (activeInput.id === "edit-end-time-input") {
                            secondLineText = `${formatTooltipTime(dur1, origNewDur1)} | ${formatTooltipTime(dur2, origNewDur2)}`;
                        } else if (activeInput.id === "edit-start-time-2-input" || activeInput.id === "edit-end-time-2-input") {
                            secondLineText = `${formatTooltipTime(dur2, origNewDur2)}`;
                        }
                    }
                } else {
                    const newDuration = (currentEndTime.getTime() - currentStartTime.getTime()) / 1000;

                    if (!isNaN(newDuration)) {
                        secondLineText = formatTooltipTime(newDuration, origDur);
                    }
                }
            }

            hoverTooltip.html(""); // Clear previous content
            hoverTooltip.append("tspan")
                .attr("x", xCoord)
                .attr("dy", "0em") // First line
                .text(tooltipText);

            if (secondLineText) {
                hoverTooltip.append("tspan")
                    .attr("x", xCoord)
                    .attr("dy", "1.2em") // Second line, offset by 1.2em
                    .text(secondLineText);
            }

            hoverTooltip.attr("y", TOOLTIP_OFFSET_Y).style("display", "block");
        } else {
            hoverLine.style("display", "none");
            hoverTooltip.style("display", "none");
        }

        function formatTooltipTime(newDuration, originalDuration) {
            const delta = newDuration - originalDuration;
            const orig = formatDuration(originalDuration);
            const operator = delta >= 0 ? "+" : "-";
            const d = formatDuration(Math.abs(delta));
            const newD = formatDuration(newDuration);
            return `${orig} ${operator} ${d} = ${newD}`;
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
        const eventCenterTime = new Date(eventStartTime.getTime() + desiredVisibleDurationMs / 2);

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
 * Resets the hover line and tooltip positions and visibility.
 * This should be called when the timeline is redrawn or zoomed.
 */
export function resetHoverElements() {
    if (hoverLine) {
        hoverLine.attr("y2", height);
        hoverLine.style("display", "none");
    }
    if (hoverTooltip) {
        hoverTooltip.style("display", "none");
    }
}
