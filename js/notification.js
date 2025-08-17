/**
 * @fileoverview Модуль для отображения неинтрузивных уведомлений.
 * @module notification
 */

const NOTIFICATION_CONTAINER_SELECTOR = "#notification-container";

/**
 * Отображает неинтрузивное уведомление в углу экрана.
 * @param {string} message - Сообщение для отображения в уведомлении.
 * @param {number} duration - Продолжительность в миллисекундах, в течение которой уведомление должно быть видно.
 */
export function showNotification(message, duration = 3000) {
    const container = window.d3.select(NOTIFICATION_CONTAINER_SELECTOR);
    if (container.empty()) {
        console.error("Notification container not found.");
        return;
    }

    const notification = container.append("div")
        .attr("class", "notification-item")
        .text(message);

    setTimeout(() => {
        notification.remove();
    }, duration);
}
