

/**
 * Generates an array of "smart" relative time ticks based on the current time scale and width.
 * The ticks are rounded to sensible intervals (minutes, hours, days) relative to 'now'.
 * @param {d3.ScaleTime} currentXScale - The current D3 time scale.
 * @param {number} width - The width of the SVG container.
 * @param {Date} now - The current reference date (defaults to current time).
 * @returns {Array<Date>} An array of Date objects representing the tick values.
 */
export function generateRelativeTimeTicks(currentXScale, width, now = new Date()) {
    const domain = currentXScale.domain();
    const visibleDurationMs = domain[1].getTime() - domain[0].getTime();

    let tickInterval;
    let tickStep;

    if (visibleDurationMs < 2 * 60 * 60 * 1000) {
        tickInterval = d3.timeMinute;
        if (visibleDurationMs < 30 * 60 * 1000) tickStep = 1;
        else if (visibleDurationMs < 60 * 60 * 1000) tickStep = 5;
        else tickStep = 10;
    } else if (visibleDurationMs < 2 * 24 * 60 * 60 * 1000) {
        tickInterval = d3.timeHour;
        tickStep = 1;
        if (visibleDurationMs > 12 * 60 * 60 * 1000) tickStep = 3;
    } else {
        tickInterval = d3.timeDay;
        tickStep = 1;
        if (visibleDurationMs > 7 * 24 * 60 * 60 * 1000) tickStep = 7;
    }

    const ticks = [];
    let currentTick = tickInterval.offset(now, 0);

    const nowMs = now.getTime();
    const currentTickMs = currentTick.getTime();
    const intervalMs = tickInterval.offset(now, tickStep).getTime() - nowMs;

    const offsetFromNow = (nowMs - currentTickMs) % intervalMs;
    currentTick = new Date(currentTickMs + offsetFromNow);

    while (currentTick.getTime() >= domain[0].getTime()) {
        ticks.unshift(currentTick);
        currentTick = tickInterval.offset(currentTick, -tickStep);
    }

    currentTick = tickInterval.offset(now, tickStep);
    while (currentTick.getTime() <= domain[1].getTime()) {
        ticks.push(currentTick);
        currentTick = tickInterval.offset(currentTick, tickStep);
    }

    return ticks;
}

/**
 * Formats a date into a relative time string (e.g., "1m ago", "1h 1m ago").
 * @param {Date} date - The date to format.
 * @param {Date} now - The current reference date (defaults to current time).
 * @returns {string} The relative time string.
 */
export function formatRelativeTime(date, now = new Date(), shortFormat = false) {
    const sec = Math.floor((now.getTime() - date.getTime()) / 1000);
    const sign = sec < 0 ? "-" : "";
    const seconds = Math.abs(sec);

    if (seconds < 60) return `${sign}${seconds}s `;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${sign}${minutes}m `;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        if (shortFormat) return `${sign}${hours}h `;
        return `${sign}${hours}h ${minutes % 60}m `.replaceAll(" 0m", "");
    }

    const days = Math.floor(minutes / (60 * 24));
    if (days < 30) {
        if (shortFormat) return `${sign}${days}d `;
        return `${sign}${days}d ${hours % 24}h `.replaceAll(" 0h", "");
    }

    const months = Math.floor(days / 30);
    if (months < 12) {
        if (shortFormat) return `${sign}${months}M `;
        return `${sign}${months}M ${days % 30}d `.replaceAll(" 0d", "");
    }

    const years = Math.floor(months / 12);
    if (shortFormat) return `${sign}${years}y `;
    return `${sign}${years}y ${months % 12}M `;
}

const shortMonthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Formats a date into a 24-hour absolute time string, adapting based on the visible time range.
 * @param {Date} date - The date to format.
 * @param {Array<Date>} visibleDomain - The [startDate, endDate] of the currently visible timeline.
 * @returns {string} The formatted time string (e.g., "14:30", "08 Aug").
 */
export function formatAbsoluteTime(date, visibleDomain) {
    const visibleDurationMs = visibleDomain[1].getTime() - visibleDomain[0].getTime();
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    if (visibleDurationMs < twoDaysInMs) {
        return `${hours}:${minutes}`;
    } else {
        const day = String(date.getDate()).padStart(2, '0');
        const month = shortMonthNames[date.getMonth()];
        return `${day} ${month}`;
    }
}

/**
 * Formats a Date object into a local ISO-like string (YYYY-MM-DD HH:MM:SS).
 * This is useful for input fields where a precise, human-readable, and parsable format is needed.
 * @param {Date} date - The Date object to format.
 * @returns {string} The formatted date-time string.
 */
export function toLocalISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Formats a Date object into a YYYY.MM.DD HH.MM string.
 * @param {Date} date - The Date object to format.
 * @returns {string} The formatted date-time string.
 */
export function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}.${month}.${day} ${hours}.${minutes}`;
}

export function formatDuration(seconds, includeSeconds = true) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
        const paddedM = String(m).padStart(2, '0');
        const paddedS = String(s).padStart(2, '0');
        return includeSeconds ? `${h}h ${paddedM}m ${paddedS}s` : `${h}h ${paddedM}m`;
    }
    if (m > 0) {
        const paddedS = String(s).padStart(2, '0');
        return includeSeconds ? `${m}m ${paddedS}s` : `${m}m`;
    }
    if (includeSeconds) {
        const paddedS = String(s).padStart(2, '0');
        return `${paddedS}s`;
    }
    return "";
}

/**
 * Formats a duration in seconds to decimal hours.
 * @param {number} duration - The duration in seconds.
 * @returns {string} The duration formatted as decimal hours.
 */
export function formatDurationToDecimalHours(duration) {
    const hours = duration / 3600;
    return `${hours.toFixed(1)}h`;
}

/**
 * Formats a Date object into a YYYY-MM-DD string.
 * @param {Date} date - The Date object to format.
 * @returns {string} The formatted date string (e.g., "2025-08-15").
 */
export function getFormattedDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Determines if a given HEX color is dark.
 * @param {string} hexColor - The color in HEX format (e.g., "#RRGGBB").
 * @returns {boolean} True if the color is dark, false otherwise.
 */
export function isColorDark(hexColor) {
    if (!hexColor) return false;
    const color = (hexColor.charAt(0) === '#') ? hexColor.substring(1, 7) : hexColor;
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);
    const uicolors = [r / 255, g / 255, b / 255];
    const c = uicolors.map((col) => {
        if (col <= 0.03928) {
            return col / 12.92;
        }
        return Math.pow((col + 0.055) / 1.055, 2.4);
    });
    const L = (0.2126 * c[0]) + (0.7152 * c[1]) + (0.0722 * c[2]);
    return L <= 0.179;
}

/**
 * Calculates hourly non-AFK activity data for a given day.
 * @param {Array<Object>} afkEvents - An array of AFK events.
 * @param {Date} date - The date for which to calculate hourly data.
 * @returns {Array<number>} An array of 24 numbers, where each number represents
 *                          the minutes of non-AFK activity for that hour (0-59),
 *                          capped at 60.
 */
export function getHourlyAfkData(afkEvents, date) {
    const hourlyData = Array(24).fill(0);
    const targetDateString = getFormattedDate(date);

    afkEvents.forEach(event => {
        const eventStart = new Date(event.timestamp);
        const eventEnd = new Date(event.timestamp.getTime() + event.duration * 1000);

        // Only consider events that overlap with the target date
        if (getFormattedDate(eventStart) === targetDateString || getFormattedDate(eventEnd) === targetDateString ||
            (eventStart < date && eventEnd > new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1))) {

            let currentMinute = new Date(eventStart);
            while (currentMinute < eventEnd) {
                if (getFormattedDate(currentMinute) === targetDateString) {
                    const hour = currentMinute.getHours();
                    // Only count if status is 'not-afk'
                    if (event.data.status === 'not-afk') {
                        hourlyData[hour] = Math.min(60, hourlyData[hour] + 1);
                    }
                }
                currentMinute.setMinutes(currentMinute.getMinutes() + 1);
                // Break if we cross into the next day to avoid infinite loops for long events
                if (currentMinute.getMinutes() === 0 && currentMinute.getSeconds() === 0 && getFormattedDate(currentMinute) !== targetDateString) {
                    break;
                }
            }
        }
    });

    return hourlyData;
}
