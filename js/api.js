const API_BASE_URL = 'http://localhost:5600';

/**
 * Fetches all available buckets from the Activity Watch API.
 * @returns {Promise<Array<string>>} A promise that resolves to an array of bucket names.
 */
export async function fetchBuckets() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/0/buckets/`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const buckets = await response.json();
        // The response is an object where keys are bucket IDs. We only need the keys.
        return Object.keys(buckets);
    } catch (error) {
        console.error("Failed to fetch buckets:", error);
        return [];
    }
}

/**
 * Fetches event data for a specific bucket.
 * @param {string} bucketName - The name of the bucket.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of event objects for the bucket.
 */
export async function fetchEventsForBucket(bucketName) {
    const url = `${API_BASE_URL}/api/0/buckets/${bucketName}/events?limit=1000`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for bucket ${bucketName}`);
        }
        const events = await response.json();

        // Process events: add bucket name and convert timestamp
        const processedEvents = events.map(d => {
            // Find and update the current running event
            if (d.data.running === true && d.duration === 0) {
                const now = new Date();
                const eventTimestamp = new Date(d.timestamp);
                d.duration = (now - eventTimestamp) / 1000; // Duration in seconds
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

    const relevantBuckets = buckets; // Use all fetched buckets

    if (relevantBuckets.length === 0) {
        console.warn("No buckets found after filtering (if any).");
        return [];
    }

    // Fetch events for all relevant buckets in parallel
    const eventPromises = relevantBuckets.map(bucketName => fetchEventsForBucket(bucketName));
    const allEvents = await Promise.all(eventPromises);

    // Flatten the array of arrays into a single array of events
    const flattenedEvents = allEvents.flat();

    if (flattenedEvents.length === 0) {
        console.warn("API returned an empty list of events for relevant buckets.");
    }

    return flattenedEvents;
}

export async function deleteEvent(bucket, id) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/0/buckets/${bucket}/events/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        console.log(`Event ${id} deleted successfully.`);
        return true;
    } catch (error) {
        console.error(`Failed to delete event ${id}:`, error);
        throw error;
    }
}

export async function createEvent(bucket, eventData) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/0/buckets/${bucket}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
        });
        if (!response.ok) throw new Error(`HTTP error creating event! status: ${response.status}`);
        console.log('New event created successfully:', await response.json());
        return true;
    } catch (error) {
        console.error('Failed to create event:', error);
        throw error;
    }
}
