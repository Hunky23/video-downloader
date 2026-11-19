package usecase

import (
	"video-downloader/internal/dto"
)

// List — usecase получения списка загрузок.
type List struct{}

func NewList() *List {
	return &List{}
}

// Handle возвращает список всех загрузок.
func (l *List) Handle() (dto.ListResponse, error) {
	// TODO: реальная реализация
	return dto.ListResponse{
		Type:      "list",
		Downloads: []dto.DownloadItem{},
	}, nil
}
