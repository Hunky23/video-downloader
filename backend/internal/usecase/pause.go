package usecase

import (
	"video-downloader/internal/dto"
)

// Pause — usecase паузы загрузки.
type Pause struct{}

func NewPause() *Pause {
	return &Pause{}
}

// Handle ставит загрузку на паузу.
func (p *Pause) Handle(req dto.PauseRequest) (*dto.Paused, error) {
	// TODO: реальная реализация
	return &dto.Paused{
		Type:       "paused",
		DownloadID: req.DownloadID,
	}, nil
}
