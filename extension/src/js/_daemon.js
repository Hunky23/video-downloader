// _daemon.js — обёртка над Native Messaging (browser.runtime.connectNative).
// Хост: ru.hunky.video_downloader (bridge.exe → daemon.exe).

const browser = globalThis.browser ?? globalThis.chrome;
const HOST_NAME = 'ru.hunky.video_downloader';
const REQUEST_TIMEOUT = 30_000;
const MAX_CONCURRENT = 4;

/** @type {import('w3c-web-extensions').Runtime.Port | null} */
let port = null;

/** @type {Map<string, {resolve: Function, reject: Function, timer: number}>} */
const pendingRequests = new Map();

/** @type {Map<string, Set<Function>>} */
const eventListeners = new Map();

/** Очередь запросов, ожидающих слота. */
const requestQueue = [];
let inFlight = 0;

// ── Internal ──────────────────────────────────────────────────────────────────

function ensureConnection() {
    if (port) return port;

    port = browser.runtime.connectNative(HOST_NAME);

    port.onMessage.addListener(handleMessage);
    port.onDisconnect.addListener(() => {
        for (const { reject, timer } of pendingRequests.values()) {
            clearTimeout(timer);
            reject(new Error('Соединение с daemon потеряно'));
        }
        pendingRequests.clear();
        inFlight = 0;

        for (const { reject } of requestQueue.splice(0)) {
            reject(new Error('Соединение с daemon потеряно'));
        }

        port = null;
    });

    return port;
}

function handleMessage(message) {
    const key = resolveResponseKey(message);
    if (key && pendingRequests.has(key)) {
        const { resolve, timer } = pendingRequests.get(key);
        pendingRequests.delete(key);
        clearTimeout(timer);
        inFlight--;
        resolve(message);
        processQueue();
        return;
    }

    const listeners = eventListeners.get(message.type);
    if (listeners) {
        for (const cb of listeners) {
            try { cb(message); } catch (e) { console.error('[daemon] event handler error:', e); }
        }
    }
}

function resolveResponseKey(msg) {
    switch (msg.type) {
        case 'meta':    return `meta:${msg.videoId}`;
        case 'started': return `start:${msg.videoId}`;
        case 'paused':  return `pause:${msg.downloadId}`;
        case 'deleted': return `delete:${msg.downloadId}`;
        case 'list':    return 'list';
        default:        return null;
    }
}

function send(message, key) {
    return new Promise((resolve, reject) => {
        requestQueue.push({ message, key, resolve, reject });
        processQueue();
    });
}

function processQueue() {
    while (inFlight < MAX_CONCURRENT && requestQueue.length > 0) {
        const { message, key, resolve, reject } = requestQueue.shift();
        inFlight++;

        const timer = setTimeout(() => {
            if (pendingRequests.has(key)) {
                pendingRequests.delete(key);
                inFlight--;
                reject(new Error(`Timeout: ${message.type}`));
                processQueue();
            }
        }, REQUEST_TIMEOUT);

        pendingRequests.set(key, { resolve, reject, timer });

        try {
            const p = ensureConnection();
            p.postMessage(message);
        } catch (e) {
            if (pendingRequests.has(key)) {
                pendingRequests.delete(key);
                clearTimeout(timer);
                inFlight--;
                reject(e);
                processQueue();
            }
        }
    }
}

function fireAndForget(message) {
    const p = ensureConnection();
    p.postMessage(message);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Запросить метаданные видео.
 * @param {object} params
 * @param {number} params.videoId
 * @param {string} params.link
 * @param {string} [params.cookies]
 * @param {string} [params.userAgent]
 * @returns {Promise<object>} { videoId, name, duration, resolution, language, preview }
 */
export function fetchMeta({ videoId, link, cookies, userAgent }) {
    return send({ type: 'meta', videoId, link, cookies, userAgent }, `meta:${videoId}`);
}

/**
 * Начать загрузку.
 * @param {object} params
 * @param {number} params.videoId
 * @param {string} params.link
 * @param {string} [params.quality]
 * @param {string} [params.language]
 * @param {string} [params.cookies]
 * @param {string} [params.userAgent]
 * @param {string} [params.saveTo='default']
 * @param {boolean} [params.reconvert=false]
 * @returns {Promise<{downloadId: number}>}
 */
export function startDownload({ videoId, link, quality, language, cookies, userAgent, saveTo = 'default', reconvert = false }) {
    return send(
        { type: 'start', videoId, link, quality, language, cookies, userAgent, saveTo, reconvert },
        `start:${videoId}`
    );
}

/**
 * Пауза загрузки.
 * @param {number} downloadId
 * @returns {Promise<void>}
 */
export function pauseDownload(downloadId) {
    return send({ type: 'pause', downloadId }, `pause:${downloadId}`).then(() => {});
}

/**
 * Возобновить загрузку (fire-and-forget; отслеживать по `progress`).
 * @param {number} downloadId
 */
export function resumeDownload(downloadId) {
    fireAndForget({ type: 'resume', downloadId });
}

/**
 * Удалить загрузку.
 * @param {number} downloadId
 * @returns {Promise<void>}
 */
export function deleteDownload(downloadId) {
    return send({ type: 'delete', downloadId }, `delete:${downloadId}`).then(() => {});
}

/**
 * Получить список всех загрузок.
 * @returns {Promise<{downloads: Array}>}
 */
export function listDownloads() {
    return send({ type: 'list' }, 'list');
}

/**
 * Открыть папку загрузки (fire-and-forget).
 * @param {number} downloadId
 */
export function openFolder(downloadId) {
    fireAndForget({ type: 'open_folder', downloadId });
}

/**
 * Подписаться на несанкционированные события от daemon.
 * @param {'progress'|'completed'|'error'} type
 * @param {Function} callback
 */
export function onEvent(type, callback) {
    if (!eventListeners.has(type)) eventListeners.set(type, new Set());
    eventListeners.get(type).add(callback);
}

/**
 * Отписаться от события.
 * @param {'progress'|'completed'|'error'} type
 * @param {Function} callback
 */
export function offEvent(type, callback) {
    const listeners = eventListeners.get(type);
    if (listeners) listeners.delete(callback);
}
