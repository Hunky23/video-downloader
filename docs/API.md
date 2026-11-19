# API — контракт Extension ↔ Daemon

Транспорт: Extension → bridge (Native Messaging, stdio) → daemon (Windows Named Pipe).
Протокол: JSON-объекты, один объект = одно сообщение.

Extension использует `browser.runtime.connectNative()` (двойное соединение), а не `sendNativeMessage()`, потому что:
- можно закрыть соединение по таймауту простоя;
- можно получать **незапрошенные** сообщения от daemon (например `progress`).

---

## Extension → Daemon

### `meta`

Запрос метаданных видео (до начала загрузки).

```json
{
  "type": "meta",
  "videoId": 42,
  "link": "https://youtube.com/...",
  "cookies": "vid=...; session=...",
  "userAgent": "Mozilla/5.0 ..."
}
```

| Поле        | Тип    | Описание                                      |
|-------------|--------|-----------------------------------------------|
| `videoId`   | int    | Локальный ID (генерируется extension)         |
| `link`      | string | URL страницы с видео                          |
| `cookies`   | string | Cookies для URL (для YouTube без `ST-*`)      |
| `userAgent` | string | User-Agent браузера                           |

---

### `start`

Начать загрузку.

```json
{
  "type": "start",
  "videoId": 42,
  "link": "https://youtube.com/...",
  "quality": "1080p",
  "language": "Русский",
  "cookies": "vid=...; session=...",
  "userAgent": "Mozilla/5.0 ...",
  "saveTo": "default",
  "reconvert": false
}
```

| Поле        | Тип    | Описание                                     |
|-------------|--------|----------------------------------------------|
| `videoId`   | int    | Локальный ID                                 |
| `link`      | string | URL страницы с видео                         |
| `quality`   | string | Желаемое качество (например `"1080p"`)       |
| `language`  | string | Желаемый язык аудио/субтитров                |
| `cookies`   | string | Cookie-заголовок (`key=val; ...`)            |
| `userAgent` | string | User-Agent для HTTP-запросов                 |
| `saveTo`    | string | Папка сохранения (`"default"` = стандартная) |
| `reconvert` | bool   | Перекодировать в MP4 даже если исходник MP4  |

---

### `pause`

```json
{ "type": "pause", "downloadId": 1 }
```

### `resume`

```json
{ "type": "resume", "downloadId": 1 }
```

### `delete`

```json
{ "type": "delete", "downloadId": 1 }
```

---

### `list`

Запрос списка всех загрузок.

```json
{ "type": "list" }
```

---

### `open_folder`

Открыть проводник в папке загрузки.

```json
{ "type": "open_folder", "downloadId": 1 }
```

---

## Daemon → Extension

### `meta`

Ответ на запрос метаданных.

```json
{
  "type": "meta",
  "videoId": 42,
  "name": "Название видео",
  "duration": "12:34",
  "resolution": ["1080p", "720p", "480p"],
  "language": ["Русский", "English"],
  "preview": "data:image/jpeg;base64,..."
}
```

| Поле         | Тип      | Описание                             |
|--------------|----------|--------------------------------------|
| `videoId`    | int      | ID из запроса                        |
| `name`       | string   | Название видео                       |
| `duration`   | string   | Длительность (`"HH:MM"` / `"M:SS"`)  |
| `resolution` | string[] | Доступные разрешения                 |
| `language`   | string[] | Доступные языки                      |
| `preview`    | string   | Base64-превью (data URL)             |

---

### `started`

Загрузка начата.

```json
{ "type": "started", "videoId": 42, "downloadId": 1 }
```

| Поле         | Тип | Описание                                |
|--------------|-----|-----------------------------------------|
| `videoId`    | int | ID видео (из запроса `start`)           |
| `downloadId` | int | ID загрузки (назначается daemon)        |

---

### `paused`

```json
{ "type": "paused", "downloadId": 1 }
```

### `deleted`

```json
{ "type": "deleted", "downloadId": 1 }
```

---

### `list`

Ответ на запрос списка.

```json
{
  "type": "list",
  "downloads": [
    {
      "downloadId": 1,
      "videoId": 42,
      "name": "Название",
      "state": "paused",
      "percent": 45.2,
      "quality": "1080p",
      "language": "Русский"
    }
  ]
}
```

| Поле (`downloads[]`) | Тип    | Описание                                       |
|----------------------|--------|------------------------------------------------|
| `downloadId`         | int    | ID загрузки                                    |
| `videoId`            | int    | ID видео                                       |
| `name`               | string | Название                                       |
| `state`              | string | `"downloading"` \| `"paused"` \| `"completed"` |
| `percent`            | float  | Прогресс 0–100                                 |
| `quality`            | string | Выбранное качество                             |
| `language`           | string | Выбранный язык                                 |

---

### `progress`

Периодическое обновление прогресса.

```json
{ "type": "progress", "downloadId": 1, "percent": 73.5, "speed": "5.2 MB/s" }
```

| Поле         | Тип    | Описание                    |
|--------------|--------|-----------------------------|
| `downloadId` | int    | ID загрузки                 |
| `percent`    | float  | Прогресс 0–100              |
| `speed`      | string | Скорость (человекочитаемая) |

---

### `completed`

Загрузка завершена успешно.

```json
{ "type": "completed", "downloadId": 1 }
```

---

### `error`

Ошибка (до или во время загрузки).

```json
{ "type": "error", "videoId": 42, "downloadId": null, "message": "Видео не найдено" }
```

| Поле         | Type      | Описание                                  |
|--------------|-----------|-------------------------------------------|
| `videoId`    | int       | ID видео                                  |
| `downloadId` | int\|null | ID загрузки (null, если ошибка до старта) |
| `message`    | string    | Описание ошибки                           |

---

## Идентификаторы

| ID           | Генератор  | Назначение                              |
|--------------|------------|-----------------------------------------|
| `videoId`    | Extension  | Идентифицирует «видео» в сессии         |
| `downloadId` | Daemon     | Идентифицирует конкретную задачу        |

---

## Состояния загрузки

```
  start → started → progress* → completed
                │
                ├──► paused ◄─► resume
                │
                ├──► error
                │
                └──► deleted
```

`delete` допустим из любого состояния (downloading, paused, completed).