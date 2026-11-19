// Package dto содержит wire-форматы (JSON) для сообщений Extension ↔ Daemon.
package dto

// --- Extension → Daemon ---

type MetaRequest struct {
	Type    string `json:"type"`
	VideoID int    `json:"videoId"`
	Link    string `json:"link"`
}

type StartRequest struct {
	Type      string `json:"type"`
	VideoID   int    `json:"videoId"`
	Link      string `json:"link"`
	Quality   string `json:"quality"`
	Language  string `json:"language"`
	Cookies   string `json:"cookies"`
	UserAgent string `json:"userAgent"`
	SaveTo    string `json:"saveTo"`
	Reconvert bool   `json:"reconvert"`
}

type PauseRequest struct {
	Type       string `json:"type"`
	DownloadID int    `json:"downloadId"`
}

type ResumeRequest struct {
	Type       string `json:"type"`
	DownloadID int    `json:"downloadId"`
}

type DeleteRequest struct {
	Type       string `json:"type"`
	DownloadID int    `json:"downloadId"`
}

type ListRequest struct {
	Type string `json:"type"`
}

type OpenFolderRequest struct {
	Type       string `json:"type"`
	DownloadID int    `json:"downloadId"`
}

// --- Daemon → Extension ---

type MetaResponse struct {
	Type       string   `json:"type"`
	VideoID    int      `json:"videoId"`
	Name       string   `json:"name"`
	Duration   string   `json:"duration"`
	Resolution []string `json:"resolution"`
	Language   []string `json:"language"`
	Preview    string   `json:"preview"`
}

type Started struct {
	Type       string `json:"type"`
	VideoID    int    `json:"videoId"`
	DownloadID int    `json:"downloadId"`
}

type Paused struct {
	Type       string `json:"type"`
	DownloadID int    `json:"downloadId"`
}

type Deleted struct {
	Type       string `json:"type"`
	DownloadID int    `json:"downloadId"`
}

type DownloadItem struct {
	DownloadID int     `json:"downloadId"`
	VideoID    int     `json:"videoId"`
	Name       string  `json:"name"`
	State      string  `json:"state"`
	Percent    float64 `json:"percent"`
	Quality    string  `json:"quality"`
	Language   string  `json:"language"`
}

type ListResponse struct {
	Type      string         `json:"type"`
	Downloads []DownloadItem `json:"downloads"`
}

type Progress struct {
	Type       string  `json:"type"`
	DownloadID int     `json:"downloadId"`
	Percent    float64 `json:"percent"`
	Speed      string  `json:"speed"`
}

type Completed struct {
	Type       string `json:"type"`
	DownloadID int    `json:"downloadId"`
}

type ErrorMessage struct {
	Type       string `json:"type"`
	VideoID    int    `json:"videoId"`
	DownloadID *int   `json:"downloadId"`
	Message    string `json:"message"`
}
