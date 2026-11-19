package usecase

import (
	"video-downloader/internal/dto"
)

// Resume — usecase возобновления загрузки.
type Resume struct{}

func NewResume() *Resume {
	return &Resume{}
}

// Handle возобновляет загрузку. Ответ не отправляется — идут progress-сообщения.
func (r *Resume) Handle(req dto.ResumeRequest) error {
	// TODO: реальная реализация
	return nil
}
