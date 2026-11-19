package usecase

import (
	"video-downloader/internal/dto"
)

// OpenFolder — usecase открытия папки загрузки.
type OpenFolder struct{}

func NewOpenFolder() *OpenFolder {
	return &OpenFolder{}
}

// Handle открывает проводник в папке загрузки.
func (o *OpenFolder) Handle(req dto.OpenFolderRequest) error {
	// TODO: реальная реализация (os/exec: explorer.exe)
	return nil
}
