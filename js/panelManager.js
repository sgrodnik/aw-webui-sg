/**
 * @fileoverview Модуль для управления панелями (перетаскивание, сохранение позиции, скрытие по Escape).
 * @module panelManager
 */

const DRAG_CURSOR_GRABBING = "grabbing";
const DRAG_CURSOR_GRAB = "grab";

/**
 * Устанавливает функциональность перетаскивания для данной панели.
 * @param {d3.Selection} panel - D3-выборка панели, которую нужно сделать перетаскиваемой.
 */
function setupPanelDrag(panel) {
    let isDragging = false;
    let initialMouseX, initialMouseY;
    let initialPanelTop;
    let initialPanelLeft;
    let initialPanelRight;
    let isPositionedByLeft = false;

    panel.on("mousedown", (event) => {
        const targetTagName = event.target.tagName;
        if (targetTagName === 'INPUT' || targetTagName === 'BUTTON' || targetTagName === 'LABEL' || targetTagName === 'TEXTAREA' || window.d3.select(event.target).classed('calendar-resize-handle')) {
            return;
        }

        if (event.target === panel.node() || panel.node().contains(event.target)) {
            isDragging = true;
            initialMouseX = event.clientX;
            initialMouseY = event.clientY;
            const computedStyle = window.getComputedStyle(panel.node());
            initialPanelTop = parseFloat(computedStyle.top);

            if (computedStyle.left !== 'auto' && parseFloat(computedStyle.left) !== 0) {
                initialPanelLeft = parseFloat(computedStyle.left);
                isPositionedByLeft = true;
            } else {
                initialPanelRight = parseFloat(computedStyle.right);
                isPositionedByLeft = false;
            }

            panel.style("cursor", DRAG_CURSOR_GRABBING);
            event.preventDefault();
        }
    });

    document.addEventListener("mousemove", (event) => {
        if (!isDragging) return;

        const deltaX = event.clientX - initialMouseX;
        const deltaY = event.clientY - initialMouseY;

        panel.style("top", (initialPanelTop + deltaY) + "px");

        if (isPositionedByLeft) {
            panel.style("left", (initialPanelLeft + deltaX) + "px");
            panel.style("right", "auto");
        } else {
            panel.style("right", (initialPanelRight - deltaX) + "px");
            panel.style("left", "auto");
        }
    });

    document.addEventListener("mouseup", () => {
        if (isDragging) {
            isDragging = false;
            panel.style("cursor", DRAG_CURSOR_GRAB);
        }
    });
}

function setupPanelResize(panel, resizeHandle, storageKey) {
    let isResizing = false;
    let initialMouseX;
    let initialPanelWidth;

    resizeHandle.on("mousedown", (event) => {
        isResizing = true;
        initialMouseX = event.clientX;
        initialPanelWidth = panel.node().offsetWidth;
        panel.style("cursor", DRAG_CURSOR_GRABBING);
        event.preventDefault();
    });

    document.addEventListener("mousemove", (event) => {
        if (!isResizing) return;

        const deltaX = event.clientX - initialMouseX;
        const newWidth = initialPanelWidth + deltaX;

        const minWidth = parseFloat(panel.style("min-width")) || 0;
        panel.style("width", Math.max(newWidth, minWidth) + "px");
    });

    document.addEventListener("mouseup", () => {
        if (isResizing) {
            isResizing = false;
            panel.style("cursor", DRAG_CURSOR_GRAB);
            savePanelWidth(panel, storageKey);
        }
    });
}

/**
 * Устанавливает функциональность перетаскивания для нескольких панелей и сохраняет их позиции.
 * @param {...d3.Selection} panels - D3-выборки панелей, которые нужно сделать перетаскиваемыми.
 */
export function setupPanelDragging(...panels) {
    panels.forEach((panel) => {
        const storageKey = `${panel.attr('id')}Position`;
        loadPanelPosition(panel, storageKey);
        setupPanelDrag(panel);
        panel.on("mouseup", () => savePanelPosition(panel, storageKey));
    });
}

/**
 * Загружает сохраненную позицию панели из локального хранилища.
 * @param {d3.Selection} panel - D3-выборка панели.
 * @param {string} storageKey - Ключ, используемый для хранения позиции в локальном хранилище.
 */
export function loadPanelPosition(panel, storageKey) {
    const savedPosition = localStorage.getItem(storageKey);
    if (savedPosition) {
        const { top, left } = JSON.parse(savedPosition);
        panel.style("top", top);
        if (panel.attr('id') !== 'calendar-panel') {
            panel.style("left", left);
        }
    }
}

export function loadPanelWidth(panel, storageKey) {
    const savedWidth = localStorage.getItem(storageKey);
    if (savedWidth) {
        panel.style("width", savedWidth);
    }
}

export function savePanelWidth(panel, storageKey) {
    localStorage.setItem(storageKey, panel.style("width"));
}

/**
 * Сохраняет текущую позицию панели в локальное хранилище.
 * @param {d3.Selection} panel - D3-выборка панели.
 * @param {string} storageKey - Ключ для хранения позиции в локальном хранилище.
 */
export function savePanelPosition(panel, storageKey) {
    const computedStyle = window.getComputedStyle(panel.node());
    if (panel.attr('id') === 'calendar-panel') {
        localStorage.setItem(storageKey, JSON.stringify({ top: computedStyle.top, left: 'auto' }));
    } else {
        localStorage.setItem(storageKey, JSON.stringify({ top: computedStyle.top, left: computedStyle.left }));
    }
}

/**
 * Рендерит панель отчета о задачах.
 * @param {Array<Object>} reportData - Массив объектов отчета о задачах.
 * @param {d3.Selection} panelContainer - D3-выборка контейнера панели отчета.
 * @param {d3.Selection} contentContainer - D3-выборка области содержимого внутри панели отчета.
 */
export function renderReportPanel(reportData, panelContainer, contentContainer) {
    contentContainer.html(""); // Очистить предыдущее содержимое

    if (reportData.length === 0) {
        contentContainer.append("p").text("Нет данных для отчета.");
        return;
    }

    reportData.forEach(task => {
        const taskItem = contentContainer.append("div").attr("class", "task-report-item");
        taskItem.append("h3").text(task.label);
        taskItem.append("span").attr("class", "duration").text(task.totalCleanTimeFormatted);
        if (task.dailyBreakdown.length > 0) {
            taskItem.append("span").attr("class", "daily-breakdown").text(`(${task.dailyBreakdown.join(', ')})`);
        }
    });

    panelContainer.style("display", "block");
}

/**
 * Рендерит панель правил раскраски.
 * @param {Array<Object>} colorRules - Массив объектов правил раскраски.
 * @param {d3.Selection} panelContainer - D3-выборка контейнера панели.
 * @param {d3.Selection} textarea - D3-выборка текстового поля.
 */
export function renderColorRulesPanel(colorRules, panelContainer, textarea) {
    const rulesText = colorRules.map(rule => `${rule.regex.source} ${rule.color}`).join('\n');
    textarea.property("value", rulesText);
    panelContainer.style("display", "block");
}

/**
 * Устанавливает слушатель событий для клавиши Escape, чтобы скрывать панели.
 * @param {d3.Selection} infoPanel - D3-выборка информационной панели.
 * @param {d3.Selection} editPanel - D3-выборка панели редактирования.
 * @param {d3.Selection} zoomPanel - D3-выборка панели масштабирования.
 * @param {d3.Selection} reportPanel - D3-выборка панели отчета.
 * @param {d3.Selection} colorRulesPanel - D3-выборка панели правил раскраски.
 * @param {d3.Selection} calendarPanel - D3-выборка панели календаря.
 */
export function setupEscapeListener(infoPanel, editPanel, zoomPanel, reportPanel, colorRulesPanel, calendarPanel, calendarResizeHandle) {
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (editPanel.style('display') === 'block') {
                editPanel.style('display', 'none');
            } else if (infoPanel.style('display') === 'block') {
                infoPanel.style('display', 'none');
            } else if (reportPanel.style('display') === 'block') {
                reportPanel.style('display', 'none');
            } else if (colorRulesPanel.style('display') === 'block') {
                colorRulesPanel.style('display', 'none');
            } else if (calendarPanel.style('display') === 'block') {
                calendarPanel.style('display', 'none');
            }
            else {
                zoomPanel.style('display', zoomPanel.style('display') === 'none' ? 'flex' : 'none');
            }
        }
    });
}

export function setupCalendarResize(calendarPanel, calendarResizeHandle) {
    const storageKey = `${calendarPanel.attr('id')}Width`;
    loadPanelWidth(calendarPanel, storageKey);
    setupPanelResize(calendarPanel, calendarResizeHandle, storageKey);
}

/**
 * Рендерит панель фильтрации корзин с флажками для каждой корзины.
 * @param {Array<{id: string, count: number}>} buckets - Массив объектов корзин с ID и количеством событий.
 * @param {function} onFilterChange - Функция обратного вызова, которая будет вызвана при изменении фильтра.
 * @param {Array<string>} visibleBuckets - Массив текущих видимых корзин (только ID).
 */
export function renderBucketFilterPanel(buckets, onFilterChange, visibleBuckets) {
    const bucketList = window.d3.select("#bucket-list");
    bucketList.html("");

    buckets.forEach(bucket => {
        if (!bucket || !bucket.id) {
            console.warn("Skipping undefined or malformed bucket:", bucket);
            return;
        }
        const label = bucketList.append("label");
        label.append("input")
            .attr("type", "checkbox")
            .attr("value", bucket.id)
            .attr("checked", visibleBuckets.includes(bucket.id) ? true : null)
            .on("change", function() {
                const bucketId = d3.select(this).attr("value");
                if (this.checked) {
                    if (!visibleBuckets.includes(bucketId)) {
                        visibleBuckets.push(bucketId);
                    }
                } else {
                    const index = visibleBuckets.indexOf(bucketId);
                    if (index > -1) {
                        visibleBuckets.splice(index, 1);
                    }
                }
                onFilterChange();
                localStorage.setItem("visibleBuckets", JSON.stringify(visibleBuckets));
            });
        label.append("span").text(`${bucket.id} (${bucket.count})`);
    });

    window.d3.select("#bucket-filter-panel").style("display", "block");
    setupPanelDragging(window.d3.select("#bucket-filter-panel"));
}
