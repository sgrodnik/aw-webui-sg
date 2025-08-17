import { getColorRules, setColorRules } from './state.js';

const COLOR_RULES_STORAGE_KEY = "colorRules";

/**
 * Loads coloring rules from localStorage.
 * @returns {Array<{regex: RegExp, color: string}>} An array of rule objects.
 */
export function loadColorRules() {
    const rulesString = localStorage.getItem(COLOR_RULES_STORAGE_KEY);
    if (!rulesString) {
        return [];
    }
    try {
        const parsedRules = rulesString.split('\n').map(line => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return null;

            const parts = trimmedLine.split(/\s+/);
            if (parts.length < 2) return null;

            const color = parts[parts.length - 1];
            const regexString = parts.slice(0, -1).join(' ');

            try {
                return { regex: new RegExp(regexString, 'i'), color: color };
            } catch (e) {
                console.warn(`Invalid regex in rule: "${regexString}"`, e);
                return null;
            }
        }).filter(rule => rule !== null);
        return parsedRules;
    } catch (e) {
        console.error("Failed to parse color rules from localStorage:", e);
        return [];
    }
}

/**
 * Saves coloring rules to localStorage.
 * @param {string} rulesText - Text with rules, separated by newlines.
 */
export function saveColorRules(rulesText) {
    localStorage.setItem(COLOR_RULES_STORAGE_KEY, rulesText);
    setColorRules(loadColorRules()); // Update state after saving
}

/**
 * Determines the color for an event based on the given rules.
 * @param {Object} eventData - The event object.
 * @param {Array<{regex: RegExp, color: string}>} rules - An array of rule objects.
 * @returns {string|null} HEX color if a match is found, otherwise null.
 */
export function getColorForEvent(eventData, rules) {
    let eventDescription = '';
    if (eventData.bucket.startsWith('aw-stopwatch')) {
        eventDescription = eventData.data.label || '';
    } else if (eventData.bucket.startsWith('aw-watcher-window')) {
        eventDescription = `${eventData.data.app} ${eventData.data.title}`;
    }

    for (let rule of rules) {
        if (rule.regex.test(eventDescription)) {
            return rule.color;
        }
    }
    return null;
}
