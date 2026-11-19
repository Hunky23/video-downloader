# TODO — Extension

## _storage.js
- [x] Реализовать обёртку над `browser.storage.session` (addVideo, removeVideo, getVideosByTabId, updateVideo)
- [x] Поле `hlsVariants` в записи видео (массив URL, хранит варианты из master playlist)
- [x] Функция `isKnownVariant(url)` — проверяет, не является ли URL вариантом известного master

## _daemon.js
- [x] Обёртка над `browser.runtime.connectNative('ru.hunky.video_downloader')`
- [x] Lazy-подключение, auto-reconnect при разрыве
- [x] Request/Response: `fetchMeta`, `startDownload`, `pauseDownload`, `deleteDownload`, `listDownloads`
- [x] Fire-and-forget: `resumeDownload`, `openFolder`
- [x] События: `onEvent` / `offEvent` (progress, completed, error)
- [x] Таймаут 30с на запрос/ответ
- [x] Концеренс-лимит: не более 4 параллельных request/response (очередь)

## background.js
- [x] `webRequest.onHeadersReceived`:
    - YouTube: `webNavigation.onCommitted` → `watch?v=`, `/shorts/` → `addVideo({tabId, link})`
    - MP4/WebM: `Content-Type` = `video/mp4|webm|ogg` OR URL ends with `.mp4|.webm|.ogv` + type `media|xmlHttpRequest`
    - M3U8: `Content-Type` = `application/vnd.apple.mpegurl|x-mpegurl` OR URL ends with `.m3u8`:
        - `isKnownVariant(url)` → skip
        - `fetch(url)` → если содержит `#EXT-X-STREAM-INF` → извлечь URI → записать в `hlsVariants` записи
        - `addVideo({tabId, link})`
    - MPD: `Content-Type` = `application/dash+xml` OR URL ends with `.mpd` → `addVideo({tabId, link})`
- [x] `runtime.onMessage` → `fetchMeta` от popup → запрос к daemon → `updateVideo(id, { meta })` → вернуть meta popup

## popup.js
- [x] При открытии: `getVideosByTabId(tabId)` → рендер (empty / loader / карточка)
- [x] Для видео без meta: `sendMessage({type: 'fetchMeta'})` → ответ → `updateVideo` → re-render
- [x] Условный рендер `.main-content-item__options`: скрыть блок если оба массива пусты; скрыть отдельный `<select>` если его массив пуст
- [x] Event delegation: `.remove-video-trigger` → `removeVideo(id, tabId)` + re-render
- [x] Event delegation: `.title-edit-trigger` → toggle readonly на input
- [x] Settings: `browser.storage.sync` — load на init, save на `change` (checkbox → boolean)