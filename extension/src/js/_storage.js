// _storage.js — обёртка над browser.storage.session.
// Ключ: 'videoList'. Кроссбраузерное: Firefox / Chrome.

const browser = globalThis.browser ?? globalThis.chrome;
const KEY = 'videoList';

/**
 * Добавить видео в список. Если ссылка уже есть — дописать tabId.
 * @param {{tabId: number, link: string}} params
 */
export async function addVideo({ tabId, link }) {
    const obj = await browser.storage.session.get(KEY);
    const data = obj[KEY] ?? { nextVideoId: 1, videos: [] };

    const existing = data.videos.find((v) => v.link === link);
    if (existing) {
        if (!existing.tabID.includes(tabId)) {
            existing.tabID.push(tabId);
            await browser.storage.session.set({ [KEY]: data });
        }
        return existing;
    }

    const video = { id: data.nextVideoId++, tabID: [tabId], link, meta: null, hlsVariants: [] };
    data.videos.push(video);
    await browser.storage.session.set({ [KEY]: data });
    return video;
}

/**
 * Удалить привязку tabId. Если табов больше нет — удалить видео целиком.
 * @param {number} id
 * @param {number} tabId
 */
export async function removeVideo(id, tabId) {
    const obj = await browser.storage.session.get(KEY);
    const data = obj[KEY] ?? { nextVideoId: 1, videos: [] };
    const idx = data.videos.findIndex((v) => v.id === id);
    if (idx === -1) return;

    const tabIdx = data.videos[idx].tabID.indexOf(tabId);
    if (tabIdx === -1) return;

    data.videos[idx].tabID.splice(tabIdx, 1);
    if (data.videos[idx].tabID.length === 0) {
        data.videos.splice(idx, 1);
    }
    await browser.storage.session.set({ [KEY]: data });
}

/**
 * Все видео, привязанные к вкладке.
 * @param {number} tabId
 */
export async function getVideosByTabId(tabId) {
    const obj = await browser.storage.session.get(KEY);
    const data = obj[KEY] ?? { nextVideoId: 1, videos: [] };
    return data.videos.filter((v) => v.tabID.includes(tabId));
}

/**
 * Обновить поля видео (Object.assign).
 * @param {number} id
 * @param {object} patch
 */
export async function updateVideo(id, patch) {
    const obj = await browser.storage.session.get(KEY);
    const data = obj[KEY] ?? { nextVideoId: 1, videos: [] };
    const video = data.videos.find((v) => v.id === id);
    if (!video) return;

    Object.assign(video, patch);
    await browser.storage.session.set({ [KEY]: data });
}

/**
 * Проверить, является ли URL известным HLS-вариантом (упоминается в hlsVariants любого видео).
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function isKnownVariant(url) {
    const obj = await browser.storage.session.get(KEY);
    const data = obj[KEY] ?? { nextVideoId: 1, videos: [] };
    return data.videos.some((v) => v.hlsVariants?.includes(url));
}