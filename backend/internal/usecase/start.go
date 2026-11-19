package usecase

import (
	"video-downloader/internal/dto"
)

// Start — usecase начала загрузки.
type Start struct{}

func NewStart() *Start {
	return &Start{}
}

// Handle начинает загрузку видео.
func (s *Start) Handle(req dto.StartRequest) (*dto.Started, error) {
	// TODO: реальная реализация
	downloadID := 1
	return &dto.Started{
		Type:       "started",
		VideoID:    req.VideoID,
		DownloadID: downloadID,
	}, nil
}
