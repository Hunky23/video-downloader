package interfaces

import (
	"bufio"
	"errors"
	"fmt"
	"os"

	"golang.org/x/sys/windows"
)

// PipeServer слушает именованный канал (Windows named pipe) и обрабатывает подключения.
// Протокол: одно соединение = один запрос → один ответ → закрыть.
type PipeServer struct {
	addr string
	ctrl *Controller
}

func NewPipeServer(addr string, ctrl *Controller) *PipeServer {
	return &PipeServer{addr: addr, ctrl: ctrl}
}

// Serve запускает pipe-сервер. Блокирует до ошибки.
func (s *PipeServer) Serve() error {
	for {
		file, err := s.accept()
		if err != nil {
			return err
		}
		s.handleConnection(file)
	}
}

// accept создаёт named pipe и ждёт подключения клиента.
func (s *PipeServer) accept() (*os.File, error) {
	name := windows.StringToUTF16(s.addr)

	handle, err := windows.CreateNamedPipe(
		&name[0],
		windows.PIPE_ACCESS_DUPLEX,
		windows.PIPE_TYPE_BYTE|windows.PIPE_READMODE_BYTE|windows.PIPE_WAIT,
		1,     // max instances
		65536, // out buffer
		65536, // in buffer
		0,     // timeout: infinite
		nil,   // security attributes
	)
	if err != nil {
		return nil, fmt.Errorf("CreateNamedPipe: %w", err)
	}

	// Ждём клиента. ERROR_PIPE_CONNECTED — клиент уже подключён (нормально).
	err = windows.ConnectNamedPipe(handle, nil)
	if err != nil && !errors.Is(err, windows.ERROR_PIPE_CONNECTED) {
		windows.CloseHandle(handle)
		return nil, fmt.Errorf("ConnectNamedPipe: %w", err)
	}

	return os.NewFile(uintptr(handle), s.addr), nil
}

// handleConnection читает ОДИН фрейм, обрабатывает, закрывает.
func (s *PipeServer) handleConnection(file *os.File) {
	defer file.Close()

	s.ctrl.SetWriter(file)

	reader := bufio.NewReader(file)
	frame, err := ReadFrame(reader)
	if err != nil {
		return // клиент не отправил ничего или разрыв
	}
	if frame == nil {
		return
	}

	// Обрабатываем и отправляем ответ. После этого defer file.Close() закроет pipe,
	// и клиент получит EOF после чтения ответа.
	s.ctrl.Handle(frame)
}
