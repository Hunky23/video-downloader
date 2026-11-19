// popup.js
import { getVideosByTabId, removeVideo, updateVideo } from './_storage.js';

const browser = globalThis.browser ?? globalThis.chrome;

let videos = [];
let tabId = null;

// ─── Render ─────────────────────────────────────────────────────────────────

function render() {
    const container = document.querySelector('.main-content');

    if (videos.length === 0) {
        container.innerHTML = '<p class="main-content__empty">Здесь пока нет видео</p>';
        return;
    }

    const items = videos.map((video) => video.meta ? renderVideo(video) : renderLoader(video)).join('');
    container.innerHTML = `<div class="main-content__list">${items}</div>`;
}

function renderLoader(video) {
    return `<div class="main-content__item main-content-item main-content-item__loader" data-id="${video.id}"></div>`;
}

function renderVideo(video) {
    const { meta } = video;
    const resolutions = meta.resolution ?? [];
    const languages = meta.language ?? [];
    const hasOptions = resolutions.length > 0 || languages.length > 0;

    let optionsHtml = '';
    if (hasOptions) {
        let inner = '';
        if (resolutions.length > 0) {
            inner += `<select class="main-content-item__resolutions">` +
                resolutions.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('') +
                `</select>`;
        }
        if (languages.length > 0) {
            inner += `<select class="main-content-item__language">` +
                languages.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('') +
                `</select>`;
        }
        optionsHtml = `<div class="main-content-item__options">${inner}</div>`;
    }

    return `<div class="main-content__item main-content-item" data-id="${video.id}">
        <div class="main-content-item__preview-wrapper">
            <img class="main-content-item__preview" src="${meta.preview ?? ''}" alt="">
            <div class="main-content-item__duration">${esc(meta.duration ?? '')}</div>
        </div>
        <div class="main-content-item__info">
            <label class="main-content-item__title-wrapper">
                <a class="main-content-item__title-edit title-edit-trigger"></a>
                <input class="main-content-item__title" name="name" value="${esc(meta.name ?? '')}" placeholder="Название видео" autocomplete="off" readonly>
            </label>
            ${optionsHtml}
            <div class="main-content-item__controls">
                <progress class="main-content-item__progress hidden" value="0" max="100"></progress>
                <a class="main-content-item__start start-download-trigger"></a>
                <a class="main-content-item__pause hidden pause-download-trigger"></a>
            </div>
        </div>
        <a class="main-content-item__remove-wrapper remove-video-trigger">
            <div class="main-content-item__remove"></div>
        </a>
    </div>`;
}

function esc(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Meta fetch ─────────────────────────────────────────────────────────────

function requestMeta(video) {
    browser.runtime.sendMessage({ type: 'fetchMeta', videoId: video.id, link: video.link })
        .then(async (meta) => {
            if (!meta || !meta.name) return;
            await updateVideo(video.id, { meta });
            const v = videos.find(v => v.id === video.id);
            if (v) {
                v.meta = meta;
                render();
            }
        })
        .catch((e) => {
            console.error('[popup] fetchMeta failed:', e);
        });
}

// ─── Events ─────────────────────────────────────────────────────────────────

document.querySelector('.main-content').addEventListener('click', async (e) => {
    const removeEl = e.target.closest('.remove-video-trigger');
    if (removeEl) {
        const item = removeEl.closest('[data-id]');
        const id = Number(item.dataset.id);
        await removeVideo(id, tabId);
        videos = videos.filter(v => v.id !== id);
        render();
        return;
    }

    const editEl = e.target.closest('.title-edit-trigger');
    if (editEl) {
        const wrapper = editEl.closest('.main-content-item__title-wrapper');
        const input = wrapper.querySelector('input');
        const isEditing = wrapper.classList.toggle('editing');
        input.readOnly = !isEditing;
        if (isEditing) {
            input.focus();
            input.select();
        }
    }
});

// ─── Settings ───────────────────────────────────────────────────────────────

document.querySelector('.setting-open-trigger').addEventListener('click', () => {
    document.querySelector('.settings').classList.add('active');
});

document.querySelector('.setting-close-trigger').addEventListener('click', () => {
    document.querySelector('.settings').classList.remove('active');
});

document.querySelector('form.settings-form').addEventListener('change', async (event) => {
    const form = event.currentTarget;
    const settings = {};
    form.querySelectorAll('input').forEach(input => {
        if (input.type === 'checkbox') {
            settings[input.name] = input.checked;
        } else {
            settings[input.name] = input.value;
        }
    });
    await browser.storage.sync.set({ settings });
});

(async () => {
    const { settings = {} } = await browser.storage.sync.get('settings');
    document.querySelectorAll('form.settings-form input').forEach((input) => {
        const value = settings[input.name];
        if (input.type === 'checkbox') {
            input.checked = value === true;
        } else {
            input.value = value ?? '';
        }
    });
})();

// ─── Init ───────────────────────────────────────────────────────────────────

(async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    tabId = tab.id;
    videos = await getVideosByTabId(tabId);
    render();

    for (const video of videos) {
        if (!video.meta) {
            requestMeta(video);
        }
    }
})();