# TODO — Backend (Go)

## Bridge
- [x] Реализовать `cmd/bridge/main.go` — пасс-тру stdin↔pipe + автозапуск daemon (DETACHED_PROCESS)
- [x] **Фикс «Соединение с daemon потеряно»**: bridge был single-shot с построчным stdin (`bufio.Scanner`) и выводом без 4-byte length-prefix — несовместимо с Native Messaging. Переписан в долгоживущий кадровый пасс-тру `[4-byte LE length][payload]` в обе стороны, сериализация pipe-доступа (daemon последовательный), автозапуск daemon сохранён.

## Daemon
- [x] Каркас: DTO, usecases (mock `meta` + заглушки), controller, codec, pipe server
- [ ] Реализовать usecase `Meta` — реальный yt-dlp probe
- [ ] Реализовать usecase `Start` — запуск yt-dlp + ffmpeg, прогресс
- [ ] Реализовать usecase `Pause` / `Resume` — управление загрузкой
- [ ] Реализовать usecase `Delete` — удаление файлов
- [ ] Реализовать usecase `List` — чтение реестра загрузок из БД
- [ ] Реализовать usecase `OpenFolder` — `explorer.exe`
