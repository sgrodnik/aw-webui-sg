
import { fetchBuckets, fetchEventsForBucket, createEvent } from './api.js';
import { setupChart, setupZoom, redrawTimeline, svg, g, xScale, yScale, xAxisGroup, xAxisTopGroup, timeExtent, zoomBehavior, width, height } from './timeline.js';
import { renderEventPoints } from './timelineRenderer.js';
import { panAndZoomToEvent, zoomToRange } from './timelineInteraction.js';
import { renderEventTable, renderLatestEventsTable, setupZoomControls } from './ui.js';
import { setupTimelineHoverInteraction } from './timelineInteraction.js';
import { calculateActivitySegments } from './events.js';
import { generateTaskReport } from './report.js';
import { loadColorRules, saveColorRules } from './colorRules.js';
import { initCalendar, renderCalendar } from './calendar.js';
import { getAppState, setAllEventsData, setVisibleBuckets, setColorRules, setAfkBucketId, getAllEventsData, getVisibleBuckets, getColorRules, getAfkBucketId } from './state.js';
import { showNotification } from './notification.js';
import { setupPanelDragging, loadPanelPosition, renderReportPanel, renderColorRulesPanel, setupEscapeListener, renderBucketFilterPanel } from './panelManager.js';
import { renderEventEditPanel, setupEditControls } from './eventForm.js';

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

async function loadAndProcessEvents(buckets) {
    const allEvents = await Promise.all(buckets.map(bucketId => fetchEventsForBucket(bucketId))).then(arrays => arrays.flat());

    const stopwatchEvents = allEvents.filter(e => e.bucket.startsWith('aw-stopwatch'));
    const afkEvents = allEvents.filter(e => e.bucket === getAfkBucketId());

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

    const newEventLabelInput = window.d3.select(NEW_EVENT_LABEL_INPUT_SELECTOR);
    if (newEventLabelInput.empty()) {
        console.warn("main: new-event-label-input not found");
    }

    const container = window.d3.select(TIMELINE_CONTAINER_SELECTOR);
    const chartWidth = container.node().clientWidth;
    const chartHeight = container.node().clientHeight;

    const allBucketsWithCounts = await fetchBuckets();
    if (allBucketsWithCounts.length === 0) {
        document.body.innerHTML += "<p>No buckets found.</p>";
        return;
    }

    const afkBucket = allBucketsWithCounts.find(b => b.id.startsWith('aw-watcher-afk'));
    if (afkBucket) {
        setAfkBucketId(afkBucket.id);
    }

    setColorRules(loadColorRules());

    const savedVisibleBuckets = localStorage.getItem("visibleBuckets");
    if (savedVisibleBuckets) {
        try {
            setVisibleBuckets(JSON.parse(savedVisibleBuckets));
            const allBucketIds = allBucketsWithCounts.map(b => b.id);
            setVisibleBuckets(getVisibleBuckets().filter(bucketId => allBucketIds.includes(bucketId)));
        } catch (e) {
            console.error("Failed to parse visibleBuckets from localStorage, resetting.", e);
            setVisibleBuckets(allBucketsWithCounts.map(b => b.id));
        }
    } else {
        setVisibleBuckets(allBucketsWithCounts.map(b => b.id));
    }

    const bucketFilterPanel = window.d3.select("#bucket-filter-panel");
    renderBucketFilterPanel(allBucketsWithCounts, async () => {
        setAllEventsData(await loadAndProcessEvents(getVisibleBuckets()));
        await redrawTimeline(getAllEventsData(), getVisibleBuckets(), window.d3.select(INFO_PANEL_SELECTOR), window.d3.select(EDIT_PANEL_SELECTOR), window.d3.select(EVENT_DATA_SELECTOR), renderEventTable, renderEventEditPanel, renderLatestEventsTable, panAndZoomToEvent, newEventLabelInput);
        const updatedBucketsWithCounts = await fetchBuckets();
        renderBucketFilterPanel(updatedBucketsWithCounts, async () => {
            setAllEventsData(await loadAndProcessEvents(getVisibleBuckets()));
            await redrawTimeline(getAllEventsData(), getVisibleBuckets(), window.d3.select(INFO_PANEL_SELECTOR), window.d3.select(EDIT_PANEL_SELECTOR), window.d3.select(EVENT_DATA_SELECTOR), renderEventTable, renderEventEditPanel, renderLatestEventsTable, panAndZoomToEvent, newEventLabelInput);
        }, getVisibleBuckets());
    }, getVisibleBuckets());

    setAllEventsData(await loadAndProcessEvents(getVisibleBuckets()));

    if (getAllEventsData().length === 0) {
        document.body.innerHTML += "<p>No data found for initial buckets.</p>";
        return;
    }

    setupChart(getAllEventsData(), chartWidth, chartHeight);

    const infoPanel = window.d3.select(INFO_PANEL_SELECTOR);
    const editPanel = window.d3.select(EDIT_PANEL_SELECTOR);
    const dataPre = window.d3.select(EVENT_DATA_SELECTOR);
    const colorRulesPanel = window.d3.select(COLOR_RULES_PANEL_SELECTOR);
    const colorRulesTextarea = window.d3.select(COLOR_RULES_TEXTAREA_SELECTOR);

    renderEventPoints(getAllEventsData(), infoPanel, editPanel, dataPre, renderEventTable, renderEventEditPanel, panAndZoomToEvent, getColorRules);
    setupZoom();

    const latestEventsTable = window.d3.select("#latest-events-table");
    if (!latestEventsTable.empty()) {
        renderLatestEventsTable(getAllEventsData(), latestEventsTable, panAndZoomToEvent, newEventLabelInput);
    } else {
        console.warn("main: latest-events-table not found");
    }

    const calendarPanel = window.d3.select(CALENDAR_PANEL_SELECTOR);

    setupZoomControls(svg, zoomToRange);
    const reportPanel = window.d3.select(REPORT_PANEL_SELECTOR);
    setupPanelDragging(infoPanel, editPanel, zoomPanel, window.d3.select("#bucket-filter-panel"), reportPanel, colorRulesPanel, calendarPanel);
    setupEscapeListener(infoPanel, editPanel, zoomPanel, reportPanel, colorRulesPanel, calendarPanel);
    setupEditControls(editPanel, async () => {
        setAllEventsData(await loadAndProcessEvents(getVisibleBuckets()));
        await redrawTimeline(getAllEventsData(), getVisibleBuckets(), infoPanel, editPanel, dataPre, renderEventTable, renderEventEditPanel, renderLatestEventsTable, panAndZoomToEvent, newEventLabelInput);
    }, svg, zoomBehavior);

    setupTimelineHoverInteraction(editPanel);

    window.d3.select("#zoom-last-hour-option").dispatch('click');

    window.d3.select(COLOR_RULES_BUTTON_SELECTOR).on("click", () => {
        renderColorRulesPanel(getColorRules(), colorRulesPanel, colorRulesTextarea);
    });

    window.d3.select(SAVE_COLOR_RULES_BUTTON_SELECTOR).on("click", async () => {
        const rulesText = colorRulesTextarea.property("value");
        saveColorRules(rulesText);
        setColorRules(loadColorRules()); // Reload parsed rules
        showNotification("Color rules saved!");
        colorRulesPanel.style("display", "none");
        setAllEventsData(await loadAndProcessEvents(getVisibleBuckets()));
        await redrawTimeline(getAllEventsData(), getVisibleBuckets(), infoPanel, editPanel, dataPre, renderEventTable, renderEventEditPanel, renderLatestEventsTable, panAndZoomToEvent, newEventLabelInput);
        renderCalendar();
    });

    window.d3.select(CREATE_EVENT_BUTTON_SELECTOR).on("click", async () => {
        const labelInput = window.d3.select(NEW_EVENT_LABEL_INPUT_SELECTOR);
        const label = labelInput.property("value").trim();

        if (!label) {
            showNotification("Please enter an event name.");
            return;
        }

        // Prepare data for new event
        const now = new Date();
        const newEventData = {
            id: null, // New event, no ID yet
            bucket: "aw-stopwatch",
            timestamp: now,
            duration: 0,
            data: {
                running: true,
                label: label
            }
        };

        // Show edit panel for new event
        const editPanel = window.d3.select(EDIT_PANEL_SELECTOR);
        editPanel.property("originalEvent", newEventData);
        editPanel.property("isNewEvent", true);
        renderEventEditPanel(newEventData, window.d3.select("#edit-event-data-table"), false);
        editPanel.style("display", "block");

        // Clear input field
        labelInput.property("value", "");
    });

    window.d3.select(GENERATE_REPORT_BUTTON_SELECTOR).on("click", () => {
        const reportData = generateTaskReport(getAllEventsData());
        renderReportPanel(reportData, reportPanel, window.d3.select(REPORT_CONTENT_SELECTOR));
    });

    window.d3.select(OPEN_CALENDAR_BUTTON_SELECTOR).on("click", () => {
        if (calendarPanel.style("display") === "none")
            initCalendar();
        calendarPanel.style("display", calendarPanel.style("display") === "none" ? "block" : "none");
    });
}

document.addEventListener('DOMContentLoaded', main);
