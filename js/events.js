import { getAfkBucketId } from './state.js';
import { normalizeTitle, formatDuration } from './utils.js';

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

/**
 * Groups window watcher events into continuous app sequences.
 * Events are grouped by app, considering them continuous if the app doesn't change,
 * regardless of time gaps. Overlapping events are handled by taking the longest one
 * and logging a warning.
 * @param {Array<Object>} events - An array of all events.
 * @returns {Array<Object>} An array of grouped window watcher events.
 */
export function groupWindowWatcherEvents(events) {
    // Фильтруем события только для окон и сортируем по времени
    const windowEvents = events.filter(e => e.bucket.startsWith('aw-watcher-window')).sort((a, b) => a.timestamp - b.timestamp);
    const groups = [];

    if (windowEvents.length === 0) return groups;

    // const eventCount = group.events.length;
    // const uniqueApps = new Set(group.events.map(e => e.data.app)).size;
    // const id = group.isDirty ? `${index}-${eventCount}-${uniqueApps}` : `${index}-${eventCount}`;

    // Инициализируем первую группу с первым событием
    let currentGroup = {
        app: windowEvents[0].data.app,
        startTime: windowEvents[0].timestamp,
        totalDuration: windowEvents[0].duration,
        titleDurations: new Map([[normalizeTitle(windowEvents[0].data.title), windowEvents[0].duration]]),
        events: [windowEvents[0]],
        endTime: new Date(windowEvents[0].timestamp.getTime() + windowEvents[0].duration * 1000)
    };

    for (const event of windowEvents) {
        // Вычисляем время начала и конца текущего события
        const eventStart = event.timestamp;
        const eventEnd = new Date(event.timestamp.getTime() + event.duration * 1000);

        if (event.data.app === currentGroup.app) {
            // Проверяем пересечение с последним событием в группе
            const lastEvent = currentGroup.events[currentGroup.events.length - 1];
            if (lastEvent) {
                const lastEnd = new Date(lastEvent.timestamp.getTime() + lastEvent.duration * 1000);
                if (eventStart < lastEnd) {
                    console.warn(`Overlapping window events for app ${event.data.app}: ${lastEvent.timestamp} - ${lastEnd} overlaps with ${eventStart} - ${eventEnd}`);
                    // Берем более длительное событие
                    if (event.duration > lastEvent.duration) {
                        // Заменяем последнее событие
                        currentGroup.totalDuration -= lastEvent.duration;
                        currentGroup.totalDuration += event.duration;
                        currentGroup.events[currentGroup.events.length - 1] = event;
                        currentGroup.endTime = eventEnd;
                    }
                    continue;
                }
            }

            // Добавляем событие в текущую группу
            currentGroup.events.push(event);
            currentGroup.totalDuration += event.duration;
            currentGroup.endTime = eventEnd;

            // Обновляем длительности по заголовкам
            const title = normalizeTitle(event.data.title);
            currentGroup.titleDurations.set(title, (currentGroup.titleDurations.get(title) || 0) + event.duration);
        } else {
            // Начинаем новую группу
            groups.push(currentGroup);
            currentGroup = {
                app: event.data.app,
                startTime: event.timestamp,
                totalDuration: event.duration,
                titleDurations: new Map([[normalizeTitle(event.data.title), event.duration]]),
                events: [event],
                endTime: eventEnd
            };
        }
    }

    groups.push(currentGroup); // Добавляем последнюю группу

    // Фильтруем группы с более чем 1 событием
    const cleanGroups = groups.filter(group => group.events.length > 1);
    const usedEvents = new Set();
    cleanGroups.forEach(group => group.events.forEach(event => usedEvents.add(event)));
    const notUsedInGrouping = windowEvents.filter(event => !usedEvents.has(event));

    // Вычисляем глобальный timeline
    const minTime = windowEvents[0].timestamp.getTime();
    const maxTime = windowEvents[windowEvents.length - 1].timestamp.getTime() + windowEvents[windowEvents.length - 1].duration * 1000;

    // Вычисляем holes
    const holes = [];
    if (cleanGroups.length > 0) {
        // Первый hole
        if (minTime < cleanGroups[0].startTime.getTime()) {
            holes.push({ start: minTime, end: cleanGroups[0].startTime.getTime() });
        }
        // Между группами
        for (let i = 0; i < cleanGroups.length - 1; i++) {
            const endPrev = cleanGroups[i].endTime.getTime();
            const startNext = cleanGroups[i + 1].startTime.getTime();
            if (endPrev < startNext) {
                holes.push({ start: endPrev, end: startNext });
            }
        }
        // Последний hole
        const lastEnd = cleanGroups[cleanGroups.length - 1].endTime.getTime();
        if (lastEnd < maxTime) {
            holes.push({ start: lastEnd, end: maxTime });
        }
    } else {
        // Если нет чистых групп, один большой hole
        holes.push({ start: minTime, end: maxTime });
    }

    // Группируем грязные группы
    const dirtyGroups = [];
    for (const hole of holes) {
        const holeEvents = notUsedInGrouping.filter(e => {
            const eStart = e.timestamp.getTime();
            const eEnd = eStart + e.duration * 1000;
            return eStart < hole.end && eEnd > hole.start;
        }).sort((a, b) => a.timestamp - b.timestamp);

        if (holeEvents.length === 0) continue;

        // Группируем holeEvents аналогично чистым, но без app
        let currentDirty = {
            app: '',
            startTime: holeEvents[0].timestamp,
            totalDuration: holeEvents[0].duration,
            titleDurations: new Map([[normalizeTitle(holeEvents[0].data.title), holeEvents[0].duration]]),
            events: [holeEvents[0]],
            endTime: new Date(hole.end)
        };

        for (const event of holeEvents.slice(1)) {
            const eventStart = event.timestamp;
            const eventEnd = new Date(event.timestamp.getTime() + event.duration * 1000);

            // Проверяем пересечение с последним событием
            const lastEvent = currentDirty.events[currentDirty.events.length - 1];
            if (lastEvent) {
                const lastEnd = new Date(lastEvent.timestamp.getTime() + lastEvent.duration * 1000);
                if (eventStart < lastEnd) {
                    console.warn(`Overlapping dirty events: ${lastEvent.timestamp} - ${lastEnd} overlaps with ${eventStart} - ${eventEnd}`);
                    // Берем более длительное событие
                    if (event.duration > lastEvent.duration) {
                        currentDirty.events[currentDirty.events.length - 1] = event;
                    }
                    continue;
                }
            }

            // Добавляем событие в текущую грязную группу
            currentDirty.events.push(event);

            // Обновляем длительности по заголовкам
            const title = normalizeTitle(event.data.title);
            currentDirty.titleDurations.set(title, (currentDirty.titleDurations.get(title) || 0) + event.duration);
        }

        // Вычисляем totalDuration от начала до конца
        currentDirty.totalDuration = (currentDirty.endTime.getTime() - currentDirty.startTime.getTime()) / 1000;

        const uniqueApps = new Set(currentDirty.events.map(e => e.data.app)).size;
        currentDirty.uniqueApps = uniqueApps;

        // Устанавливаем app как составное имя с длительностями, отсортированное по убыванию
        const appDurations = new Map();
        currentDirty.events.forEach(e => {
            const app = e.data.app;
            appDurations.set(app, (appDurations.get(app) || 0) + e.duration);
        });
        currentDirty.app = Array.from(appDurations.entries()).sort((a, b) => b[1] - a[1]).map(([app, dur]) => `${formatDuration(dur)} ${app.replace('.exe', '')}`).join('<br>');

        // Добавляем если >1 событие
        if (currentDirty.events.length > 1) {
            dirtyGroups.push(currentDirty);
        }
    }

    const allGroups = [...cleanGroups, ...dirtyGroups];
    allGroups.forEach((group, idx) => {
        const newNumber = idx + 1;
        if (group.uniqueApps) {
            group.id = `group-${newNumber}-${group.events.length}-${group.uniqueApps}`;
        } else {
            group.id = `group-${newNumber}-${group.events.length}`;
        }
    });

    return allGroups;
}
