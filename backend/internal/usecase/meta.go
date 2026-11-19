package usecase

import (
	"bytes"
	"image"
	"image/png"

	"encoding/base64"

	"video-downloader/internal/dto"
)

// Meta — usecase получения метаданных видео.
// Сейчас: мок, возвращает захардкоженный ответ.
type Meta struct{}

func NewMeta() *Meta {
	return &Meta{}
}

// Handle возвращает метаданные для видео.
func (m *Meta) Handle(req dto.MetaRequest) (dto.MetaResponse, error) {
	return dto.MetaResponse{
		Type:       "meta",
		VideoID:    req.VideoID,
		Name:       "Test Video",
		Duration:   "0:10",
		Resolution: []string{"1080p", "720p", "480p"},
		Language:   []string{"English", "Русский"},
		Preview:    blackPreview(120, 90),
	}, nil
}

// blackPreview генерирует data URL с чёрным PNG заданного размера.
func blackPreview(w, h int) string {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	// RGBA по умолчанию: (0,0,0,0). Делаем пиксели непрозрачными.
	for i := 3; i < len(img.Pix); i += 4 {
		img.Pix[i] = 255
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
}
