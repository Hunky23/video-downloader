package interfaces

import (
	"encoding/json"
	"io"
	"sync"

	"video-downloader/internal/dto"
	"video-downloader/internal/usecase"
)

// Controller обрабатывает входящие сообщения и отправляет ответы.
type Controller struct {
	meta       *usecase.Meta
	start      *usecase.Start
	pause      *usecase.Pause
	resume     *usecase.Resume
	delete     *usecase.Delete
	list       *usecase.List
	openFolder *usecase.OpenFolder

	mu     sync.Mutex
	writer io.Writer
}

func NewController(
	meta *usecase.Meta,
	start *usecase.Start,
	pause *usecase.Pause,
	resume *usecase.Resume,
	delete *usecase.Delete,
	list *usecase.List,
	openFolder *usecase.OpenFolder,
) *Controller {
	return &Controller{
		meta:       meta,
		start:      start,
		pause:      pause,
		resume:     resume,
		delete:     delete,
		list:       list,
		openFolder: openFolder,
	}
}

// SetWriter задаёт канал отправки ответов (вызывается при подключении).
func (c *Controller) SetWriter(w io.Writer) {
	c.mu.Lock()
	c.writer = w
	c.mu.Unlock()
}

// Handle обрабатывает одно входящее сообщение (raw JSON).
func (c *Controller) Handle(raw []byte) {
	var envelope struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return
	}

	switch envelope.Type {
	case "meta":
		var req dto.MetaRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			return
		}
		resp, err := c.meta.Handle(req)
		if err != nil {
			c.sendError(req.VideoID, nil, err.Error())
			return
		}
		c.send(resp)

	case "start":
		var req dto.StartRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			return
		}
		resp, err := c.start.Handle(req)
		if err != nil {
			c.sendError(req.VideoID, nil, err.Error())
			return
		}
		c.send(resp)

	case "pause":
		var req dto.PauseRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			return
		}
		resp, err := c.pause.Handle(req)
		if err != nil {
			id := req.DownloadID
			c.sendError(0, &id, err.Error())
			return
		}
		c.send(resp)

	case "resume":
		var req dto.ResumeRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			return
		}
		if err := c.resume.Handle(req); err != nil {
			id := req.DownloadID
			c.sendError(0, &id, err.Error())
		}
		// Ответ не отправляется — идут progress.

	case "delete":
		var req dto.DeleteRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			return
		}
		resp, err := c.delete.Handle(req)
		if err != nil {
			id := req.DownloadID
			c.sendError(0, &id, err.Error())
			return
		}
		c.send(resp)

	case "list":
		resp, err := c.list.Handle()
		if err != nil {
			c.sendError(0, nil, err.Error())
			return
		}
		c.send(resp)

	case "open_folder":
		var req dto.OpenFolderRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			return
		}
		if err := c.openFolder.Handle(req); err != nil {
			id := req.DownloadID
			c.sendError(0, &id, err.Error())
		}
		// Ответ не отправляется.

	default:
		c.sendError(0, nil, "unknown message type: "+envelope.Type)
	}
}

func (c *Controller) send(msg any) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = WriteFrame(c.writer, data)
}

func (c *Controller) sendError(videoID int, downloadID *int, message string) {
	c.send(dto.ErrorMessage{
		Type:       "error",
		VideoID:    videoID,
		DownloadID: downloadID,
		Message:    message,
	})
}
