import { getAfkBucketId } from './state.js';

/**
 * Processes stopwatch and AFK events to generate activity segments.
 * Each stopwatch event is split into segments based on overlapping AFK events.
 * @param {Array<Object>} stopwatchEvents - An array of stopwatch events.
 * @param {Array<Object>} afkEvents - An array of AFK events.
 * @returns {Array<Object>} The array of stopwatch events, with an `activitySegments` property added to each.
 */
export function calculateActivitySegments(stopwatchEvents, afkEvents) {
    const afkBucketId = getAfkBucketId();
    return stopwatchEvents.map(swEvent => {
        const swStart = swEvent.timestamp.getTime();
        let swEnd = swStart + swEvent.duration * 1000;

        // For running events, the end time is now
        if (swEvent.data.running === true) {
            swEnd = new Date().getTime();
        }

        // Find all AFK events that overlap with the current stopwatch event
        const overlappingAfk = afkEvents.filter(afk => {
            const afkStart = afk.timestamp.getTime();
            const afkEnd = afkStart + afk.duration * 1000;
            return afkStart < swEnd && afkEnd > swStart;
        });

        // Create a set of all relevant timestamps (split points)
        const splitPoints = new Set([swStart, swEnd]);
        overlappingAfk.forEach(afk => {
            const afkStart = afk.timestamp.getTime();
            const afkEnd = afkStart + afk.duration * 1000;
            if (afkStart > swStart && afkStart < swEnd) {
                splitPoints.add(afkStart);
            }
            if (afkEnd > swStart && afkEnd < swEnd) {
                splitPoints.add(afkEnd);
            }
        });

        const sortedSplitPoints = Array.from(splitPoints).sort((a, b) => a - b);

        const segments = [];
        for (let i = 0; i < sortedSplitPoints.length - 1; i++) {
            const segmentStart = sortedSplitPoints[i];
            const segmentEnd = sortedSplitPoints[i + 1];

            if (segmentEnd <= segmentStart) continue;

            const segmentMidpoint = segmentStart + (segmentEnd - segmentStart) / 2;

            // Find the last AFK event that covers the midpoint of the segment
            const coveringAfk = overlappingAfk
                .filter(afk => {
                    const afkStart = afk.timestamp.getTime();
                    const afkEnd = afkStart + afk.duration * 1000;
                    return segmentMidpoint >= afkStart && segmentMidpoint < afkEnd;
                })
                .sort((a, b) => b.timestamp - a.timestamp)[0];

            let status = 'not-afk'; // Default status if no AFK event covers the segment
            if (coveringAfk) {
                status = coveringAfk.data.status; // 'afk' or 'not-afk'
            }

            segments.push({
                startTimestamp: new Date(segmentStart),
                duration: (segmentEnd - segmentStart) / 1000,
                status: status,
            });
        }

        // Merge consecutive segments with the same status
        const mergedSegments = [];
        if (segments.length > 0) {
            let currentSegment = { ...segments[0] };

            for (let i = 1; i < segments.length; i++) {
                const nextSegment = segments[i];
                if (nextSegment.status === currentSegment.status) {
                    // Extend current segment
                    currentSegment.duration += nextSegment.duration;
                } else {
                    // Push the completed segment and start a new one
                    mergedSegments.push(currentSegment);
                    currentSegment = { ...nextSegment };
                }
            }
            mergedSegments.push(currentSegment); // Push the last segment
        }

        swEvent.activitySegments = mergedSegments;
        return swEvent;
    });
}
