
import { fetchBuckets, fetchEventsForBucket, fetchAllEvents } from './api.js';
import { setupChart, renderEventPoints, setupZoom, zoomToRange, redrawTimeline, svg, g, xScale, yScale, xAxisGroup, xAxisTopGroup, timeExtent, zoomBehavior, width, height } from './timeline.js';
import { renderEventTable, renderLatestEventsTable, setupPanelDragging, loadPanelPosition, setupEscapeListener, renderEventEditPanel, renderBucketFilterPanel, setupZoomControls, setupEditControls } from './ui.js';

// Constants for selectors and configuration
const TIMELINE_CONTAINER_SELECTOR = ".timeline-container";
const INFO_PANEL_SELECTOR = "#event-info-panel";
const EDIT_PANEL_SELECTOR = "#event-edit-panel";
const EVENT_DATA_SELECTOR = "#event-data-table";

// Global variables for chart elements and data
let allEventsData = [];
let visibleBuckets = [];

// --- Main Application Setup ---
async function main() {
    const zoomPanel = window.d3.select("#zoom-panel");
    loadPanelPosition(zoomPanel, 'zoomPanelPosition');
    zoomPanel.style("visibility", "visible");

    const container = window.d3.select(TIMELINE_CONTAINER_SELECTOR);
    const chartWidth = container.node().clientWidth;
    const chartHeight = container.node().clientHeight;

    // Fetch all buckets first to initialize the filter panel
    const allBuckets = await fetchBuckets();
    if (allBuckets.length === 0) {
        document.body.innerHTML += "<p>No buckets found.</p>";
        return;
    }

    // Initialize visibleBuckets with all buckets (default state)
    visibleBuckets = [...allBuckets];

    // Render bucket filter panel and set up its change handler
    const bucketFilterPanel = window.d3.select("#bucket-filter-panel");
    renderBucketFilterPanel(allBuckets, async () => {
        // When filter changes, redraw the timeline
        await redrawTimeline(allEventsData, visibleBuckets, window.d3.select(INFO_PANEL_SELECTOR), window.d3.select(EDIT_PANEL_SELECTOR), window.d3.select(EVENT_DATA_SELECTOR), renderEventTable, renderEventEditPanel, renderLatestEventsTable);
    }, visibleBuckets);

    // Fetch initial events for all visible buckets
    allEventsData = await Promise.all(visibleBuckets.map(bucketName => fetchEventsForBucket(bucketName))).then(arrays => arrays.flat());

    if (allEventsData.length === 0) {
        document.body.innerHTML += "<p>No data found for initial buckets.</p>";
        return;
    }

    // Setup initial chart
    setupChart(allEventsData, chartWidth, chartHeight);

    const infoPanel = window.d3.select(INFO_PANEL_SELECTOR);
    const editPanel = window.d3.select(EDIT_PANEL_SELECTOR);
    const dataPre = window.d3.select(EVENT_DATA_SELECTOR);

    // Render event points and setup zoom
    renderEventPoints(allEventsData, infoPanel, editPanel, dataPre, renderEventTable, renderEventEditPanel);
    setupZoom();

    // Render latest events table
    const latestEventsTable = window.d3.select("#latest-events-table");
    renderLatestEventsTable(allEventsData, latestEventsTable);

    // --- UI Interactions Setup ---
    setupZoomControls(svg, zoomToRange);
    setupPanelDragging(infoPanel, editPanel, zoomPanel, window.d3.select("#bucket-filter-panel"));
    setupEscapeListener(infoPanel, editPanel, zoomPanel);
    setupEditControls(editPanel, async () => {
        // Re-fetch all events (including potential new ones from edits) and redraw
        allEventsData = await Promise.all(visibleBuckets.map(bucketName => fetchEventsForBucket(bucketName))).then(arrays => arrays.flat());
        await redrawTimeline(allEventsData, visibleBuckets, infoPanel, editPanel, dataPre, renderEventTable, renderEventEditPanel, renderLatestEventsTable);
    }, svg, zoomBehavior);

    // Initial zoom
    window.d3.select("#zoom-last-hour-option").dispatch('click');
}

document.addEventListener('DOMContentLoaded', main);
