//go:build windows

// Bridge — долгоживущий пасс-тру кадров между Native Messaging (stdin/stdout)
// и именованным каналом daemon'а.
//
// Протокол на обоих концах (extension и daemon) — кадры:
//
//	[4-byte little-endian length][payload]
//
// Bridge НЕ парсит JSON: читает кадры из stdin и для каждого открывает
// соединение с daemon, пересылает кадр в pipe и ответный кадр — в stdout.
//
// Ограничение daemon: одно соединение = один запрос → один ответ → закрыть
// (pipe server обслуживает соединения последовательно). Поэтому доступ к pipe
// сериализуется mutex'ом; кадры из stdin читаются сразу, обработка идёт в
// порядке очереди.
//
// Процесс живёт, пока stdin не закрыт (браузер отключил порт) → EOF → выход.
package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"

	"golang.org/x/sys/windows"
)

const (
	pipeAddr      = `\\.\pipe\video-downloader`
	maxFrameSize  = 64 * 1024 * 1024
	retryAttempts = 30
	retryInterval = 200 * time.Millisecond
)

// pipeLock сериализует доступ к pipe и stdout: daemon обслуживает запросы
// последовательно (одно соединение = один запрос), а кадры в stdout не должны
// пересекаться. Критическая секция «подключиться → записать → прочитать → ответить»
// выполняется атомарно.
var pipeLock sync.Mutex

func main() {
	stdin := os.Stdin
	stdout := os.Stdout

	// Основной цикл: читать кадры из stdin и обрабатывать каждый.
	// Обработка асинхронна, чтобы не блокировать чтение следующего кадра,
	// но доступ к pipe сериализован pipeLock.
	for {
		payload, err := readFrame(stdin)
		if err != nil {
			// EOF / ErrUnexpectedEOF — браузер закрыл порт. Нормальный выход.
			if err != io.EOF && err != io.ErrUnexpectedEOF {
				fmt.Fprintf(os.Stderr, "bridge: read stdin: %v\n", err)
			}
			return
		}
		go handleRequest(payload, stdout)
	}
}

// handleRequest обрабатывает один кадр: stdin-кадр → pipe → ответ-кадр → stdout.
func handleRequest(payload []byte, stdout io.Writer) {
	pipeLock.Lock()
	defer pipeLock.Unlock()

	file, err := connectWithRetry(pipeAddr)
	if err != nil {
		writeErrorFrame(stdout, payload, "connect pipe: "+err.Error())
		return
	}
	defer file.Close()

	// Запрос в pipe.
	if err := writeFrame(file, payload); err != nil {
		writeErrorFrame(stdout, payload, "write request to pipe: "+err.Error())
		return
	}

	// Ответ из pipe.
	resp, err := readFrame(file)
	if err != nil {
		writeErrorFrame(stdout, payload, "read response from pipe: "+err.Error())
		return
	}

	// Ответ в stdout.
	if err := writeFrame(stdout, resp); err != nil {
		fmt.Fprintf(os.Stderr, "bridge: write stdout: %v\n", err)
	}
}

// connectWithRetry подключается к pipe; при неудаче запускает daemon.exe и ретраит.
func connectWithRetry(addr string) (*os.File, error) {
	file, err := connectPipe(addr)
	if err == nil {
		return file, nil
	}

	startDaemon()
	for i := 0; i < retryAttempts; i++ {
		file, err = connectPipe(addr)
		if err == nil {
			return file, nil
		}
		time.Sleep(retryInterval)
	}
	return nil, fmt.Errorf("connect to %s: %w", addr, err)
}

// readFrame читает кадр: [4-byte little-endian length][payload].
func readFrame(r io.Reader) ([]byte, error) {
	var lenBuf [4]byte
	if _, err := io.ReadFull(r, lenBuf[:]); err != nil {
		return nil, err
	}
	length := binary.LittleEndian.Uint32(lenBuf[:])
	if length > maxFrameSize {
		return nil, fmt.Errorf("frame too large: %d bytes", length)
	}
	payload := make([]byte, length)
	if _, err := io.ReadFull(r, payload); err != nil {
		return nil, err
	}
	return payload, nil
}

// writeFrame записывает кадр: [4-byte little-endian length][payload].
func writeFrame(w io.Writer, data []byte) error {
	if len(data) > maxFrameSize {
		return fmt.Errorf("frame too large: %d bytes", len(data))
	}
	lenBuf := make([]byte, 4)
	binary.LittleEndian.PutUint32(lenBuf, uint32(len(data)))
	if _, err := w.Write(lenBuf); err != nil {
		return err
	}
	_, err := w.Write(data)
	return err
}

// writeErrorFrame шлёт extension'у кадр с ошибкой в том же формате, что и daemon
// ({type:"error", videoId, message}), чтобы pending-промис reject'нулся, а не
// висел до timeout.
func writeErrorFrame(w io.Writer, payload []byte, message string) {
	resp := struct {
		Type    string `json:"type"`
		VideoID int    `json:"videoId"`
		Message string `json:"message"`
	}{
		Type:    "error",
		VideoID: extractVideoID(payload),
		Message: message,
	}
	data, _ := json.Marshal(resp)
	_ = writeFrame(w, data)
}

// extractVideoID вытаскивает videoId из входящего кадра (только для ошибки).
func extractVideoID(payload []byte) int {
	var req struct {
		VideoID int `json:"videoId"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return 0
	}
	return req.VideoID
}

// connectPipe подключается к именованному каналу.
func connectPipe(addr string) (*os.File, error) {
	name := windows.StringToUTF16(addr)
	handle, err := windows.CreateFile(
		&name[0],
		windows.GENERIC_READ|windows.GENERIC_WRITE,
		0,
		nil,
		windows.OPEN_EXISTING,
		0,
		0,
	)
	if err != nil {
		return nil, err
	}
	return os.NewFile(uintptr(handle), addr), nil
}

// startDaemon запускает daemon.exe из той же директории, что и bridge.exe.
func startDaemon() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	daemonPath := exe[:len(exe)-len("bridge.exe")] + "daemon.exe"
	cmd := exec.Command(daemonPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: 0x00000008, // DETACHED_PROCESS
	}
	_ = cmd.Start()
}
