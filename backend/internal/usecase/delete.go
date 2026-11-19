package usecase

import (
	"video-downloader/internal/dto"
)

// Delete — usecase удаления загрузки.
type Delete struct{}

func NewDelete() *Delete {
	return &Delete{}
}

// Handle удаляет загрузку.
func (d *Delete) Handle(req dto.DeleteRequest) (*dto.Deleted, error) {
	// TODO: реальная реализация
	return &dto.Deleted{
		Type:       "deleted",
		DownloadID: req.DownloadID,
	}, nil
}
