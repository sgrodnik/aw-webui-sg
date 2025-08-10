
import { fetchBuckets, fetchEventsForBucket, fetchAllEvents } from './api.js';
import { setupChart, renderEventPoints, setupZoom, zoomToRange, redrawTimeline, panAndZoomToEvent, svg, g, xScale, yScale, xAxisGroup, xAxisTopGroup, timeExtent, zoomBehavior, width, height } from './timeline.js';
import { renderEventTable, renderLatestEventsTable, setupPanelDragging, loadPanelPosition, setupEscapeListener, renderEventEditPanel, renderBucketFilterPanel, setupZoomControls, setupEditControls, getActiveTimeInput } from './ui.js';
import { setupTimelineHoverInteraction } from './timeline.js';

const TIMELINE_CONTAINER_SELECTOR = ".timeline-container";
const INFO_PANEL_SELECTOR = "#event-info-panel";
const EDIT_PANEL_SELECTOR = "#event-edit-panel";
const EVENT_DATA_SELECTOR = "#event-data-table";

let allEventsData = [];
let visibleBuckets = [];

async function main() {
    const zoomPanel = window.d3.select("#zoom-panel");
    loadPanelPosition(zoomPanel, 'zoomPanelPosition');
    zoomPanel.style("visibility", "visible");

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
    await redrawTimeline(allEventsData, visibleBuckets, window.d3.select(INFO_PANEL_SELECTOR), window.d3.select(EDIT_PANEL_SELECTOR), window.d3.select(EVENT_DATA_SELECTOR), renderEventTable, renderEventEditPanel, renderLatestEventsTable, panAndZoomToEvent);
    const updatedBucketsWithCounts = await fetchBuckets();
    renderBucketFilterPanel(updatedBucketsWithCounts, async () => {
        await redrawTimeline(allEventsData, visibleBuckets, window.d3.select(INFO_PANEL_SELECTOR), window.d3.select(EDIT_PANEL_SELECTOR), window.d3.select(EVENT_DATA_SELECTOR), renderEventTable, renderEventEditPanel, renderLatestEventsTable, panAndZoomToEvent);
    }, visibleBuckets);
}, visibleBuckets);

    allEventsData = await Promise.all(visibleBuckets.map(bucketId => fetchEventsForBucket(bucketId))).then(arrays => arrays.flat());

    if (allEventsData.length === 0) {
        document.body.innerHTML += "<p>No data found for initial buckets.</p>";
        return;
    }

    setupChart(allEventsData, chartWidth, chartHeight);

    const infoPanel = window.d3.select(INFO_PANEL_SELECTOR);
    const editPanel = window.d3.select(EDIT_PANEL_SELECTOR);
    const dataPre = window.d3.select(EVENT_DATA_SELECTOR);

    renderEventPoints(allEventsData, infoPanel, editPanel, dataPre, renderEventTable, renderEventEditPanel);
    setupZoom();

const latestEventsTable = window.d3.select("#latest-events-table");
renderLatestEventsTable(allEventsData, latestEventsTable, panAndZoomToEvent);

setupZoomControls(svg, zoomToRange);
    setupPanelDragging(infoPanel, editPanel, zoomPanel, window.d3.select("#bucket-filter-panel"));
    setupEscapeListener(infoPanel, editPanel, zoomPanel);
setupEditControls(editPanel, async () => {
    allEventsData = await Promise.all(visibleBuckets.map(bucketName => fetchEventsForBucket(bucketName))).then(arrays => arrays.flat());
    await redrawTimeline(allEventsData, visibleBuckets, infoPanel, editPanel, dataPre, renderEventTable, renderEventEditPanel, renderLatestEventsTable, panAndZoomToEvent);
}, svg, zoomBehavior);

    setupTimelineHoverInteraction(svg, editPanel);

    window.d3.select("#zoom-last-hour-option").dispatch('click');
}

document.addEventListener('DOMContentLoaded', main);
