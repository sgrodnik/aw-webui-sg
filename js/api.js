import { setAfkBucketId, getAfkBucketId } from './state.js';
import { showNotification } from './notification.js';

const API_BASE_URL = 'http://localhost:5600';

/**
 * Универсальная функция для выполнения API-запросов с глобальной обработкой ошибок.
 * @param {string} url - URL для запроса.
 * @param {Object} options - Опции для fetch-запроса.
 * @returns {Promise<Response>} Promise, который разрешается в объект Response.
 * @throws {Error} Если запрос не удался или вернул ошибку HTTP.
 */
async function apiFetch(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorText = `HTTP error: ${response.status} for ${url}`;
            showNotification(`API Error: ${errorText}`, 5000);
            throw new Error(errorText);
        }
        return response;
    } catch (error) {
        const errorMessage = `Network error or API error: ${error.message}`;
        showNotification(`API Error: ${errorMessage}`, 5000);
        console.error(errorMessage, error);
        throw error;
    }
}

/**
 * Fetches the count of events for a specific bucket.
 * @param {string} bucketName - The name of the bucket.
 * @returns {Promise<number>} A promise that resolves to the number of events.
 */
export async function fetchEventCountForBucket(bucketName) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/api/0/buckets/${bucketName}/events/count`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Failed to fetch event count for bucket ${bucketName}:`, error);
        return 0;
    }
}

/**
 * Fetches all available buckets from the Activity Watch API, including their event counts.
 * @returns {Promise<Array<{id: string, count: number}>>} A promise that resolves to an array of bucket objects with id and event count.
 */
export async function fetchBuckets() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/api/0/buckets/`);
        const bucketsData = await response.json();
        const bucketIds = Object.keys(bucketsData);

        const afkBucket = bucketIds.find(id => id.startsWith('aw-watcher-afk'));
        if (afkBucket) {
            setAfkBucketId(afkBucket);
        }

        const bucketsWithCountsPromises = bucketIds.map(async (bucketId) => {
            const count = await fetchEventCountForBucket(bucketId);
            return { id: bucketId, count: count };
        });

        return Promise.all(bucketsWithCountsPromises);
    } catch (error) {
        console.error("Failed to fetch buckets:", error);
        return [];
    }
}

/**
 * Fetches event data for a specific bucket.
 * @param {string} bucketName - The name of the bucket.
 * @param {Date} [startDate] - Optional start date for filtering events.
 * @param {Date} [endDate] - Optional end date for filtering events.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of event objects for the bucket.
 */
export async function fetchEventsForBucket(bucketName, startDate, endDate) {
    let url = `${API_BASE_URL}/api/0/buckets/${bucketName}/events?limit=1000`;
    if (startDate) {
        url += `&start=${startDate.toISOString()}`;
    }
    if (endDate) {
        url += `&end=${endDate.toISOString()}`;
    }
    try {
        const response = await apiFetch(url);
        const events = await response.json();

        const processedEvents = events.map(d => {
            if (d.data.running === true) {
                const now = new Date();
                const eventTimestamp = new Date(d.timestamp);
                d.duration = (now - eventTimestamp) / 1000;
            }
            return {
                ...d,
                bucket: bucketName,
                timestamp: new Date(d.timestamp)
            };
        });
        return processedEvents;
    } catch (error) {
        console.error(`Failed to fetch data for bucket ${bucketName}:`, error);
        return [];
    }
}

/**
 * Fetches event data from the API for all relevant buckets.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of event objects from all buckets.
 */
export async function fetchAllEvents() {
    const buckets = await fetchBuckets();
    if (buckets.length === 0) {
        console.warn("No buckets found.");
        return [];
    }

    const relevantBucketIds = buckets.map(b => b.id);

    if (relevantBucketIds.length === 0) {
        console.warn("No buckets found after filtering (if any).");
        return [];
    }

    const eventPromises = relevantBucketIds.map(bucketName => fetchEventsForBucket(bucketName));
    const allEvents = await Promise.all(eventPromises);

    const flattenedEvents = allEvents.flat();

    if (flattenedEvents.length === 0) {
        console.warn("API returned an empty list of events for relevant buckets.");
    }

    return flattenedEvents;
}

export async function deleteEvent(bucket, id) {
    try {
        await apiFetch(`${API_BASE_URL}/api/0/buckets/${bucket}/events/${id}`, { method: 'DELETE' });
        console.log(`Event ${id} deleted successfully.`);
        return true;
    } catch (error) {
        console.error(`Failed to delete event ${id}:`, error);
        throw error;
    }
}

export async function createEvent(bucket, eventData) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/api/0/buckets/${bucket}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
        });
        console.log('New event created successfully:', await response.json());
        return true;
    } catch (error) {
        console.error('Failed to create event:', error);
        throw error;
    }
}
