/**
 * @fileoverview Модуль для централизованного управления состоянием приложения.
 * @module state
 */

/**
 * Объект, хранящий глобальное состояние приложения.
 * @private
 * @type {object}
 * @property {Array<Object>} allEventsData - Все загруженные данные о событиях.
 * @property {Array<string>} visibleBuckets - ID "корзин", которые в данный момент отображаются.
 * @property {Array<Object>} colorRules - Правила раскраски событий.
 * @property {string|null} afkBucketId - ID "корзины" для AFK-событий.
 */
let appState = {
    allEventsData: [],
    visibleBuckets: [],
    colorRules: [],
    afkBucketId: null,
};

/**
 * Возвращает текущее состояние приложения.
 * @returns {object} Объект состояния приложения.
 */
export function getAppState() {
    return appState;
}

/**
 * Устанавливает все данные о событиях.
 * @param {Array<Object>} data - Массив объектов событий.
 */
export function setAllEventsData(data) {
    appState.allEventsData = data;
}

/**
 * Возвращает все данные о событиях.
 * @returns {Array<Object>} Массив объектов событий.
 */
export function getAllEventsData() {
    return appState.allEventsData;
}

/**
 * Устанавливает список видимых "корзин".
 * @param {Array<string>} buckets - Массив ID видимых "корзин".
 */
export function setVisibleBuckets(buckets) {
    appState.visibleBuckets = buckets;
}

/**
 * Возвращает список видимых "корзин".
 * @returns {Array<string>} Массив ID видимых "корзин".
 */
export function getVisibleBuckets() {
    return appState.visibleBuckets;
}

/**
 * Устанавливает правила раскраски событий.
 * @param {Array<Object>} rules - Массив объектов правил раскраски.
 */
export function setColorRules(rules) {
    appState.colorRules = rules;
}

/**
 * Возвращает правила раскраски событий.
 * @returns {Array<Object>} Массив объектов правил раскраски.
 */
export function getColorRules() {
    return appState.colorRules;
}

/**
 * Устанавливает ID AFK-корзины.
 * @param {string|null} id - ID AFK-корзины.
 */
export function setAfkBucketId(id) {
    appState.afkBucketId = id;
}

/**
 * Возвращает ID AFK-корзины.
 * @returns {string|null} ID AFK-корзины.
 */
export function getAfkBucketId() {
    return appState.afkBucketId;
}
