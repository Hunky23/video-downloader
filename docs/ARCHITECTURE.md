# Архитектура

Video Downloader — инструмент для скачивания видео из браузера.
Состоит из кроссбраузерного расширения (Vanilla JS) и локального Go-бэкенда.
На этапе разработки целевой браузер — **Firefox**.

## Высокоуровневая схема

```
┌──────────────────────────────┐
│  Firefox Extension (MV3)     │
│  ┌───────────┐  ┌────────┐   │
│  │  popup.js │  │content │   │
│  └─────┬─────┘  └───┬────┘   │
│        │            │        │
│  ┌─────▼────────────▼─────┐  │
│  │   background.js (SW)   │  │
│  └────────────┬───────────┘  │
└───────────────┼──────────────┘
                │  Native Messaging (stdio JSON)
┌───────────────▼──────────────┐
│  bridge.exe  (Go)            │
│  ─────────────────────────── │
│  • Пасс-тру → daemon         │
│  • Запуск daemon (detached)  │
└───────────────┬──────────────┘
                │  Windows Named Pipe (\\.\pipe\...)
┌───────────────▼──────────────┐
│  daemon.exe  (Go)            │
│  ─────────────────────────── │
│  • Скачивание видео          │
│  • Управление очередью       │
│  • Хранилище (файлы / БД)    │
└──────────────────────────────┘
```

## Компоненты

### Extension (кроссбраузерный, Manifest V3; dev-цель — Firefox)

| Файл            | Роль                                                           |
|-----------------|----------------------------------------------------------------|
| `background.js` | Перехват ссылок YouTube, сбор .mp4/.m3u8/.mpd через webRequest |
| `content.js`    | Заглушка, назначение пока не определено                        |
| `popup.js`      | UI: очередь загрузок, настройки                                |
| `_storage.js`   | Обёртка над `browser.storage`                                  |
| `_daemon.js`    | Обёртка над Native Messaging (bridge → daemon)                 |

**Разрешения:** `webNavigation`, `storage`, `tabs`, `cookies`, `nativeMessaging`.

### Bridge (Go, `cmd/bridge`)

- Native Messaging host для Firefox (stdio, JSON-фреймы по 4 байта length prefix).
- **Долгоживущий кадровый пасс-тру** — читает/пишет кадры `[4-byte LE length][payload]`,
  JSON не парсит (кроме извлечения `videoId` для формирования ошибки).
- Обслуживает порт **пока stdin не закрыт** (браузер отключил порт → EOF → выход).
- Доступ к pipe сериализован mutex'ом (daemon последовательный: 1 соединение = 1 запрос).
- При старте:
  1. Пытается подключиться к `\\.\pipe\video-downloader`.
  2. Если pipe не существует → запускает `daemon.exe` (из той же папки) с флагом
     `DETACHED_PROCESS`, чтобы Firefox не убил его вместе с деревом процессов.
  3. Ждёт появления pipe (polling до 10 с) и подключается.
- Одно одновременное подключение (один браузер).
- При EOF на stdin (Firefox закрыл порт) — закрывает pipe-соединение и выходит.
  Daemon продолжает работать.
- Логирование отсутствует (stdout занят под native messaging).

### Daemon (Go, `cmd/daemon`)

- Ядро приложения: скачивание, очередь, хранилище.
- Слушает именованный канал Windows, принимает команды от bridge.
- Независим от браузера — может работать как CLI.

## Бекенд: слои (Clean Architecture)

```
backend/internal/
├── domain/          # Сущности, бизнес-правила. Без внешних зависимостей.
├── usecase/         # Сценарии + интерфейсы DI (минимальный набор методов).
├── infrastructure/  # Реализации интерфейсов из usecase: FS, HTTP, pipe-клиент.
├── interfaces/      # Адаптеры: JSON-кодек, pipe-сервер, CLI-хендлеры.
└── dto/             # Структуры на границе (wire-форматы).
```

**Правило зависимости:** `interfaces → usecase → domain`.
Интерфейсы для DI объявляются в `usecase/` (минимально необходимый набор методов).
`infrastructure/` реализует эти интерфейсы. В Go порты (ports) отдельным пакетом не выносятся.

## Стек

| Слой             | Технология                                   |
|------------------|----------------------------------------------|
| Extension        | Vanilla JS (Manifest V3, кроссбраузерный)    |
| Backend          | Go, стандартная библиотека (+ по мере нужды) |
| IPC              | Windows Named Pipe                           |
| Протокол         | JSON (контракт — `docs/API.md`)              |
| Сборка extension | esbuild + Sass (через `builder.js`)          |
| Сборка Go        | Go Task (`Taskfile.yml`)                     |

## Сборка и запуск

### Extension

```bash
cd extension
npm run dev      # сборка с source-map → dist/
npm run build    # продакшен-сборка → dist/
npm run watch    # сборка + автопересборка при изменениях
```

### Backend

```bash
cd backend
task             # собрать bridge.exe + daemon.exe → D:/portable-programs/CLI/video-downloader/
task bridge      # только bridge.exe
task daemon      # только daemon.exe
task clean       # удалить собранные бинарники
```

## Структура монорепо

```
video-downloader/
├── .clinerules               # Правила для ИИ-агента
├── docs/
│   ├── ARCHITECTURE.md       # Этот файл
│   └── API.md                # Контракт JSON-сообщений (заполняется по мере реализации)
├── extension/
│   ├── src/
│   │   ├── manifest.json
│   │   ├── popup.html
│   │   ├── js/
│   │   │   ├── background.js
│   │   │   ├── content.js
│   │   │   ├── popup.js
│   │   │   └── _storage.js
│   │   ├── styles/main.scss
│   │   └── img/
│   ├── builder.js
│   ├── builder.config.js
│   └── TODO.md
└── backend/
    ├── cmd/
    │   ├── bridge/main.go
    │   └── daemon/main.go
    ├── internal/
    │   ├── domain/
    │   ├── dto/
    │   ├── infrastructure/
    │   ├── interfaces/
    │   └── usecase/
    ├── Taskfile.yml
    └── TODO.md
```

## Статус

Проект на ранней стадии: каркасы и конфиги на месте, бизнес-логика ещё не реализована.
Порядок реализации фиксируется в `TODO.md` каждого модуля.