// background.js — снифер видео ссылок
import { addVideo, removeVideo, getVideosByTabId, updateVideo, isKnownVariant } from './_storage.js';
import { fetchMeta } from './_daemon.js';

const browser = globalThis.browser ?? globalThis.chrome;

// ─── YouTube ────────────────────────────────────────────────────────────────

function isYouTubeWatch(url) {
    try {
        const u = new URL(url);
        if (u.hostname !== 'www.youtube.com' && u.hostname !== 'youtube.com') return false;
        if (u.pathname === '/watch' && u.searchParams.has('v')) return true;
        if (u.pathname.startsWith('/shorts/')) return true;
        return false;
    } catch { return false; }
}
browser.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    if (!isYouTubeWatch(details.url)) return;
    addVideo({ tabId: details.tabId, link: details.url });
});

// ─── Video files (MP4 / M3U8 / MPD) ─────────────────────────────────────────

const VIDEO_MIME = /^video\/(mp4|webm|ogg)/i;
const HLS_MIME   = /^application\/(vnd\.apple\.mpegurl|x-mpegurl)/i;
const DASH_MIME  = /^application\/dash\+xml/i;

const VIDEO_EXT  = /\.(mp4|webm|ogv)(\?|#)/i;
const HLS_EXT    = /\.m3u8(\?|#)/i;
const DASH_EXT   = /\.mpd(\?|#)/i;

function getContentType(details) {
    const headers = details.responseHeaders ?? [];
    const ct = headers.find(h => h.name.toLowerCase() === 'content-type');
    return ct?.value ?? '';
}

// ─── HLS master parser ──────────────────────────────────────────────────────

function extractHlsVariants(text, baseUrl) {
    const variants = [];
    const lines = text.split('\n');
    let expectUri = false;

    for (const raw of lines) {
        const line = raw.trim();
        if (line.startsWith('#EXT-X-STREAM-INF')) {
            expectUri = true;
            continue;
        }
        if (expectUri) {
            if (!line.startsWith('#') && line.length > 0) {
                try {
                    variants.push(new URL(line, baseUrl).href);
                } catch {
                    variants.push(line);
                }
                expectUri = false;
            }
        }
    }
    return variants;
}

async function handleM3u8(url, tabId) {
    if (await isKnownVariant(url)) return;

    let variants = [];
    try {
        const resp = await fetch(url);
        const text = await resp.text();
        if (text.includes('#EXT-X-STREAM-INF')) {
            variants = extractHlsVariants(text, url);
        }
    } catch {
        // fetch не удался — сохраняем без вариантов
    }

    const video = await addVideo({ tabId, link: url });
    if (variants.length > 0) {
        await updateVideo(video.id, { hlsVariants: variants });
    }
}

// ─── webRequest listener ────────────────────────────────────────────────────

browser.webRequest.onHeadersReceived.addListener((details) => {
    if (details.tabId < 0) return;

    const { url, tabId, type } = details;
    const ct = getContentType(details);
    const reqTypes = ['media', 'xmlHttpRequest', 'object'];

    // MP4 / WebM / OGV
    if (VIDEO_MIME.test(ct) || (VIDEO_EXT.test(url) && reqTypes.includes(type))) {
        addVideo({ tabId, link: url });
        return;
    }

    // HLS (m3u8)
    if (HLS_MIME.test(ct) || (HLS_EXT.test(url) && reqTypes.includes(type))) {
        handleM3u8(url, tabId);
        return;
    }

    // DASH (mpd)
    if (DASH_MIME.test(ct) || (DASH_EXT.test(url) && reqTypes.includes(type))) {
        addVideo({ tabId, link: url });
        return;
    }
}, { urls: ['<all_urls>'] });

// ─── Cleanup: tab закрыт ────────────────────────────────────────────────────

browser.tabs.onRemoved.addListener(async (tabId) => {
    const videos = await getVideosByTabId(tabId);
    for (const v of videos) {
        await removeVideo(v.id, tabId);
    }
});

// ─── Messages from popup ────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'fetchMeta') {
        (async () => {
            const { videoId, link } = message;
            let cookies = await browser.cookies.getAll({ url: link });

            // YouTube — отбросить ST-*
            try {
                const hostname = new URL(link).hostname;
                if (hostname.includes('youtube.com')) {
                    cookies = cookies.filter(c => !c.name.startsWith('ST-'));
                }
            } catch { /* ignore */ }

            const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            const userAgent = navigator.userAgent;

            console.log('[bg] fetchMeta:', videoId, link);
            const meta = await fetchMeta({ videoId, link, cookies: cookieStr, userAgent });
            console.log('[bg] fetchMeta ok:', meta);
            sendResponse(meta);
        })().catch((e) => {
            console.error('[bg] fetchMeta failed:', e.message);
            sendResponse(null);
        });
        return true; // async response
    }
});
