import { formatAbsoluteTime, formatRelativeTime, generateRelativeTimeTicks, toLocalISO, formatDuration, isColorDark } from './utils.js';
import { getColorForEvent } from './colorRules.js';
import { svg, g, xScale, yScale, width, height } from './timeline.js'; // Импорт общих переменных из timeline.js

const BAR_HEIGHT = 30;
const EVENT_SEGMENT_CLASS = "event-segment-group";
const EVENT_LABEL_CLASS = "event-label";

/**
 * Gets the appropriate label for an event based on its data, split into two lines.
 * @param {Object} d - The event data object.
 * @returns {Array<string>} An array containing two strings for the label.
 */
function getEventLabel(d) {
    const durationStr = formatDuration(d.duration, false);

    if (d.bucket.startsWith('aw-stopwatch')) {
        const label = d.data.label || '';
        const lastColonIndex = label.lastIndexOf(':');
        if (lastColonIndex > -1 && lastColonIndex < label.length - 1) {
            const beforeColon = label.substring(0, lastColonIndex).trim();
            const afterColon = label.substring(lastColonIndex + 1).trim();
            return [beforeColon, `${afterColon} ${durationStr}`];
        }
        return [label, durationStr];
    }
    if (d.bucket.startsWith('aw-watcher-afk_')) {
        return ['', durationStr];
    }
    if (d.bucket.startsWith('aw-watcher-window')) {
        return [`${d.data.app} ${durationStr}`, d.data.title];
    }
    return ['', ''];
}

/**
 * Renders the event segments on the timeline and sets up mouseover events.
 * @param {Array<Object>} events - The array of event data.
 * @param {d3.Selection} infoPanel - The D3 selection for the info panel.
 * @param {d3.Selection} editPanel - The D3 selection for the edit panel.
 * @param {d3.Selection} dataPre - The D3 selection for the pre element to display data.
 * @param {function} renderEventTableCallback - Callback to render event info table.
 * @param {function} renderEventEditPanelCallback - Callback to render event edit panel.
 * @param {function} panAndZoomToEventCallback - Callback to pan and zoom to an event.
 * @param {function} getColorRulesCallback - Callback to get color rules.
 * @returns {d3.Selection} The D3 selection for the rendered event segments.
 */
export function renderEventPoints(events, infoPanel, editPanel, dataPre, renderEventTableCallback, renderEventEditPanelCallback, panAndZoomToEventCallback, getColorRulesCallback) {
    const segments = g.selectAll(`.${EVENT_SEGMENT_CLASS}`)
        .data(events)
        .enter().append("g")
        .attr("id", d => `event-${d.id}`)
        .attr("class", d => {
            let classes = `${EVENT_SEGMENT_CLASS}`;
            if (d.bucket.startsWith('aw-watcher-afk_')) {
                classes += ' afk-bucket-event';
            }
            if (d.data.running === true) {
                classes += ' running-event';
            }
            return classes;
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

            panAndZoomToEventCallback(d); // Используем переданный колбэк

            if (d.bucket.startsWith('aw-stopwatch')) {
                editPanel.style("display", "block");
                editPanel.property("isSplitMode", false);
                renderEventEditPanelCallback(d, window.d3.select("#edit-event-data-table"), editPanel.property("isSplitMode"));
                editPanel.property("originalEvent", d);
            }
        });

    // Define clip-paths for each event
    const defs = svg.select('defs');
    defs.selectAll(".clip-path").remove(); // Clear old clip-paths
    defs.selectAll(".clip-path")
        .data(events)
        .enter()
        .append("clipPath")
        .attr("class", "clip-path")
        .attr("id", d => `clip-${d.id}`)
        .append("rect")
        .attr("width", d => {
            const startTime = d.timestamp.getTime();
            const endTime = startTime + d.duration * 1000;
            return Math.max(0, xScale(new Date(endTime)) - xScale(d.timestamp));
        })
        .attr("height", BAR_HEIGHT);


    segments.each(function(d) {
        const group = window.d3.select(this);
        group.selectAll(".event-body, .event-label").remove(); // Clear existing rects and labels

        const customColor = getColorForEvent(d, getColorRulesCallback()); // Используем переданный колбэк

        if (d.bucket.startsWith('aw-stopwatch') && d.activitySegments) {
            // Stopwatch events with segments
            group.selectAll(".event-segment-rect")
                .data(d.activitySegments)
                .enter()
                .append("rect")
                .attr("class", segment => `event-segment-rect event-body ${segment.status}`)
                .attr("x", segment => xScale(segment.startTimestamp) - xScale(d.timestamp))
                .attr("y", 0)
                .attr("width", segment => Math.max(0, xScale(new Date(segment.startTimestamp.getTime() + segment.duration * 1000)) - xScale(segment.startTimestamp)))
                .attr("height", BAR_HEIGHT)
                .style("fill", customColor ? customColor : null); // Apply custom color
        } else {
            // AFK events and other events without segments
            let rectClass = 'event-body';
            let fillColor = customColor; // Use custom color if it exists

            if (!customColor) { // If there is no custom color, use standard classes
                if (d.bucket.startsWith('aw-watcher-afk_')) {
                    rectClass += d.data.status === 'afk' ? ' afk-event' : ' non-afk-event';
                } else {
                    rectClass += ' default-event';
                }
            }

            group.append("rect")
                .attr("class", rectClass)
                .attr("x", 0)
                .attr("y", 0)
                .attr("width", d => {
                    const startTime = d.timestamp.getTime();
                    const endTime = startTime + d.duration * 1000;
                    return Math.max(0, xScale(new Date(endTime)) - xScale(d.timestamp));
                })
                .attr("height", BAR_HEIGHT)
                .style("fill", fillColor ? fillColor : null); // Apply custom color
        }

        // Add text label
        const [line1, line2] = getEventLabel(d);
        if (line1 || line2) {
            const textLabel = group.append("text")
                .attr("class", EVENT_LABEL_CLASS)
                .attr("clip-path", `url(#clip-${d.id})`)
                .attr("x", 4) // Padding from the left edge
                .attr("y", BAR_HEIGHT / 2 - 5) // Adjust y for two lines
                .style("fill", customColor && isColorDark(customColor) ? "white" : "black"); // Apply contrasting text color

            textLabel.append("tspan")
                .text(line1);

            textLabel.append("tspan")
                .attr("x", 4) // Reset x position for the second line
                .attr("dy", "1.2em") // Move down for the second line
                .text(line2);
        }
    });

    return segments;
}
