let currentMonth;
let currentYear;
let activitySlotMap = new Map(); // Map to store activity label to its assigned slot index

export function getCurrentMonth() {
    return currentMonth;
}

export function setCurrentMonth(month) {
    currentMonth = month;
}

export function getCurrentYear() {
    return currentYear;
}

export function setCurrentYear(year) {
    currentYear = year;
}

export function getActivitySlotMap() {
    return activitySlotMap;
}

export function setActivitySlotMap(map) {
    activitySlotMap = map;
}

export function clearActivitySlotMap() {
    activitySlotMap.clear();
}
