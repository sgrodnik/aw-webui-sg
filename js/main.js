
import { fetchBuckets, fetchEventsForBucket, createEvent, afkBucketId } from './api.js';
import { setupChart, renderEventPoints, setupZoom, zoomToRange, redrawTimeline, panAndZoomToEvent, svg, g, xScale, yScale, xAxisGroup, xAxisTopGroup, timeExtent, zoomBehavior, width, height } from './timeline.js';
import { renderEventTable, renderLatestEventsTable, setupPanelDragging, loadPanelPosition, setupEscapeListener, renderEventEditPanel, renderBucketFilterPanel, setupZoomControls, setupEditControls, getActiveTimeInput, showNotification, renderReportPanel, renderColorRulesPanel } from './ui.js';
import { setupTimelineHoverInteraction } from './timeline.js';
import { calculateActivitySegments } from './events.js';
import { generateTaskReport } from './report.js';
import { loadColorRules, saveColorRules, getColorForEvent } from './colorRules.js';
import { initCalendar, renderCalendar } from './calendar.js';

const TIMELINE_CONTAINER_SELECTOR = ".timeline-container";
const INFO_PANEL_SELECTOR = "#event-info-panel";
const EDIT_PANEL_SELECTOR = "#event-edit-panel";
const EVENT_DATA_SELECTOR = "#event-data-table";
const NEW_EVENT_LABEL_INPUT_SELECTOR = "#new-event-label-input";
const CREATE_EVENT_BUTTON_SELECTOR = "#create-event-button";
const GENERATE_REPORT_BUTTON_SELECTOR = "#generate-report-button";
const REPORT_PANEL_SELECTOR = "#report-panel";
const REPORT_CONTENT_SELECTOR = "#report-content";
const COLOR_RULES_BUTTON_SELECTOR = "#color-rules-button";
const COLOR_RULES_PANEL_SELECTOR = "#color-rules-panel";
const COLOR_RULES_TEXTAREA_SELECTOR = "#color-rules-textarea";
const SAVE_COLOR_RULES_BUTTON_SELECTOR = "#save-color-rules-button";
const OPEN_CALENDAR_BUTTON_SELECTOR = "#open-calendar-button";
const CALENDAR_PANEL_SELECTOR = "#calendar-panel";

let allEventsData = [];
let visibleBuckets = [];
let colorRules = [];

async function loadAndProcessEvents(buckets) {
    const allEvents = await Promise.all(buckets.map(bucketId => fetchEventsForBucket(bucketId))).then(arrays => arrays.flat());

    const stopwatchEvents = allEvents.filter(e => e.bucket.startsWith('aw-stopwatch'));
    const afkEvents = allEvents.filter(e => e.bucket === afkBucketId);

    const processedEvents = calculateActivitySegments(stopwatchEvents, afkEvents);

    // Return all events, but with stopwatch events now containing segments
    return allEvents.map(event => {
        const processed = processedEvents.find(p => p.id === event.id);
        return processed ? processed : event;
    });
}

async function main() {
    const zoomPanel = window.d3.select("#zoom-panel");
    loadPanelPosition(zoomPanel, 'zoomPanelPosition');
    zoomPanel.style("visibility", "visible");

    const calendarPanel = window.d3.select(CALENDAR_PANEL_SELECTOR);
    initCalendar();

    const newEventLabelInput = window.d3.select(NEW_EVENT_LABEL_INPUT_SELECTOR);

    const container = window.d3.select(TIMELINE_CONTAINER_SELECTOR);
    const chartWidth = container.node().clientWidth;
    const chartHeight = container.node().clientHeight;

    const allBucketsWithCounts = await fetchBuckets();
    if (allBucketsWithCounts.length === 0) {
        document.body.innerHTML += "<p>No buckets found.</p>";
        return;
    }

    const savedVisibleBuckets = localStorage.getItem("visibleBuckets");
    if (savedVisibleBuckets) {
        try {
            visibleBuckets = JSON.parse(savedVisibleBuckets);
            const allBucketIds = allBucketsWithCounts.map(b => b.id);
            visibleBuckets = visibleBuckets.filter(bucketId => allBucketIds.includes(bucketId));
        } catch (e) {
            console.error("Failed to parse visibleBuckets from localStorage, resetting.", e);
            visibleBuckets = allBucketsWithCounts.map(b => b.id);
        }
    } else {
        visibleBuckets = allBucketsWithCounts.map(b => b.id);
    }

    const bucketFilterPanel = window.d3.select("#bucket-filter-panel");
    renderBucketFilterPanel(allBucketsWithCounts, async () => {
        allEventsData = await loadAndProcessEvents(visibleBuckets);
        await redrawTimeline(allEventsData, visibleBuckets, window.d3.select(INFO_PANEL_SELECTOR), window.d3.select(EDIT_PANEL_SELECTOR), window.d3.select(EVENT_DATA_SELECTOR), renderEventTable, renderEventEditPanel, renderLatestEventsTable, panAndZoomToEvent, newEventLabelInput);
        const updatedBucketsWithCounts = await fetchBuckets();
        renderBucketFilterPanel(updatedBucketsWithCounts, async () => {
            allEventsData = await loadAndProcessEvents(visibleBuckets);
            await redrawTimeline(allEventsData, visibleBuckets, window.d3.select(INFO_PANEL_SELECTOR), window.d3.select(EDIT_PANEL_SELECTOR), window.d3.select(EVENT_DATA_SELECTOR), renderEventTable, renderEventEditPanel, renderLatestEventsTable, panAndZoomToEvent, newEventLabelInput);
        }, visibleBuckets);
    }, visibleBuckets);

    allEventsData = await loadAndProcessEvents(visibleBuckets);

    if (allEventsData.length === 0) {
        document.body.innerHTML += "<p>No data found for initial buckets.</p>";
        return;
    }

    colorRules = loadColorRules();

    setupChart(allEventsData, chartWidth, chartHeight);

    const infoPanel = window.d3.select(INFO_PANEL_SELECTOR);
    const editPanel = window.d3.select(EDIT_PANEL_SELECTOR);
    const dataPre = window.d3.select(EVENT_DATA_SELECTOR);
    const colorRulesPanel = window.d3.select(COLOR_RULES_PANEL_SELECTOR);
    const colorRulesTextarea = window.d3.select(COLOR_RULES_TEXTAREA_SELECTOR);

    renderEventPoints(allEventsData, infoPanel, editPanel, dataPre, renderEventTable, renderEventEditPanel, colorRules, getColorForEvent);
    setupZoom();

    const latestEventsTable = window.d3.select("#latest-events-table");
    renderLatestEventsTable(allEventsData, latestEventsTable, panAndZoomToEvent, newEventLabelInput);

    setupZoomControls(svg, zoomToRange);
    const reportPanel = window.d3.select(REPORT_PANEL_SELECTOR);
    setupPanelDragging(infoPanel, editPanel, zoomPanel, window.d3.select("#bucket-filter-panel"), reportPanel, colorRulesPanel, calendarPanel);
    setupEscapeListener(infoPanel, editPanel, zoomPanel, reportPanel, colorRulesPanel, calendarPanel);
    setupEditControls(editPanel, async () => {
        allEventsData = await loadAndProcessEvents(visibleBuckets);
        await redrawTimeline(allEventsData, visibleBuckets, infoPanel, editPanel, dataPre, renderEventTable, renderEventEditPanel, renderLatestEventsTable, panAndZoomToEvent, newEventLabelInput, colorRules, getColorForEvent);
    }, svg, zoomBehavior);

    setupTimelineHoverInteraction(svg, editPanel);

    window.d3.select("#zoom-last-hour-option").dispatch('click');

    window.d3.select(COLOR_RULES_BUTTON_SELECTOR).on("click", () => {
        renderColorRulesPanel(colorRules, colorRulesPanel, colorRulesTextarea);
    });

    window.d3.select(SAVE_COLOR_RULES_BUTTON_SELECTOR).on("click", async () => {
        const rulesText = colorRulesTextarea.property("value");
        saveColorRules(rulesText);
        colorRules = loadColorRules(); // Reload parsed rules
        showNotification("Color rules saved!");
        colorRulesPanel.style("display", "none");
        allEventsData = await loadAndProcessEvents(visibleBuckets);
        await redrawTimeline(allEventsData, visibleBuckets, infoPanel, editPanel, dataPre, renderEventTable, renderEventEditPanel, renderLatestEventsTable, panAndZoomToEvent, newEventLabelInput, colorRules, getColorForEvent);
        renderCalendar();
    });

    window.d3.select(CREATE_EVENT_BUTTON_SELECTOR).on("click", async () => {
        const labelInput = window.d3.select(NEW_EVENT_LABEL_INPUT_SELECTOR);
        const label = labelInput.property("value").trim();

        if (!label) {
            showNotification("Please enter an event name.");
            return;
        }

        const newEventData = {
            timestamp: new Date().toISOString(),
            duration: 0,
            data: {
                running: true,
                label: label
            }
        };

        try {
            await createEvent("aw-stopwatch", newEventData);
            showNotification(`Event "${label}" created successfully!`);
            labelInput.property("value", ""); // Clear input field
            // Update data and redraw timeline
            allEventsData = await loadAndProcessEvents(visibleBuckets);
            await redrawTimeline(allEventsData, visibleBuckets, infoPanel, editPanel, dataPre, renderEventTable, renderEventEditPanel, renderLatestEventsTable, panAndZoomToEvent, newEventLabelInput, colorRules, getColorForEvent);
        } catch (error) {
            showNotification("Failed to create event. Check console for details.");
            console.error("Failed to create new event:", error);
        }
    });

    window.d3.select(GENERATE_REPORT_BUTTON_SELECTOR).on("click", () => {
        const reportData = generateTaskReport(allEventsData);
        renderReportPanel(reportData, reportPanel, window.d3.select(REPORT_CONTENT_SELECTOR));
    });

    window.d3.select(OPEN_CALENDAR_BUTTON_SELECTOR).on("click", () => {
        calendarPanel.style("display", calendarPanel.style("display") === "none" ? "block" : "none");
    });
}

document.addEventListener('DOMContentLoaded', main);
