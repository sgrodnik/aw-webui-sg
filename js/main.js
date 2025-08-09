
import { fetchBuckets, fetchEventsForBucket, fetchAllEvents } from './api.js';
import { setupChart, renderEventPoints, setupZoom, zoomToRange, redrawTimeline, svg, g, xScale, yScale, xAxisGroup, xAxisTopGroup, timeExtent, zoomBehavior, width, height } from './timeline.js';
import { renderEventTable, renderLatestEventsTable, setupPanelDragging, loadPanelPosition, setupEscapeListener, renderEventEditPanel, renderBucketFilterPanel, setupZoomControls, setupEditControls, getActiveTimeInput } from './ui.js';
import { setupTimelineHoverInteraction } from './timeline.js';

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
    const allBucketsWithCounts = await fetchBuckets(); // Now returns objects with id and count
    if (allBucketsWithCounts.length === 0) {
        document.body.innerHTML += "<p>No buckets found.</p>";
        return;
    }

    // Load visibleBuckets from localStorage, or initialize with all buckets
    const savedVisibleBuckets = localStorage.getItem("visibleBuckets");
    if (savedVisibleBuckets) {
        try {
            visibleBuckets = JSON.parse(savedVisibleBuckets);
            // Ensure allBuckets are still present in visibleBuckets if they were saved
            // This handles cases where new buckets might have been added since last session
            const allBucketIds = allBucketsWithCounts.map(b => b.id);
            visibleBuckets = visibleBuckets.filter(bucketId => allBucketIds.includes(bucketId));
        } catch (e) {
            console.error("Failed to parse visibleBuckets from localStorage, resetting.", e);
            visibleBuckets = allBucketsWithCounts.map(b => b.id);
        }
    } else {
        visibleBuckets = allBucketsWithCounts.map(b => b.id);
    }

    // Render bucket filter panel and set up its change handler
    const bucketFilterPanel = window.d3.select("#bucket-filter-panel");
    renderBucketFilterPanel(allBucketsWithCounts, async () => {
        // When filter changes, redraw the timeline
        await redrawTimeline(allEventsData, visibleBuckets, window.d3.select(INFO_PANEL_SELECTOR), window.d3.select(EDIT_PANEL_SELECTOR), window.d3.select(EVENT_DATA_SELECTOR), renderEventTable, renderEventEditPanel, renderLatestEventsTable);
        // Re-render bucket filter panel to update counts if needed (e.g., after event creation/deletion)
        const updatedBucketsWithCounts = await fetchBuckets();
        renderBucketFilterPanel(updatedBucketsWithCounts, async () => {
            await redrawTimeline(allEventsData, visibleBuckets, window.d3.select(INFO_PANEL_SELECTOR), window.d3.select(EDIT_PANEL_SELECTOR), window.d3.select(EVENT_DATA_SELECTOR), renderEventTable, renderEventEditPanel, renderLatestEventsTable);
        }, visibleBuckets);
    }, visibleBuckets);

    // Fetch initial events for all visible buckets
    allEventsData = await Promise.all(visibleBuckets.map(bucketId => fetchEventsForBucket(bucketId))).then(arrays => arrays.flat());

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

    // Setup timeline hover interaction for time input
    setupTimelineHoverInteraction(svg, editPanel); // No need to pass xScale here anymore

    // Initial zoom
    window.d3.select("#zoom-last-hour-option").dispatch('click');
}

document.addEventListener('DOMContentLoaded', main);
