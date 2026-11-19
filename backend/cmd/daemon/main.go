//go:build windows

package main

import (
	"log"

	"video-downloader/internal/interfaces"
	"video-downloader/internal/usecase"
)

const pipeAddr = `\\.\pipe\video-downloader`

func main() {
	// Usecases.
	meta := usecase.NewMeta()
	start := usecase.NewStart()
	pause := usecase.NewPause()
	resume := usecase.NewResume()
	del := usecase.NewDelete()
	list := usecase.NewList()
	openFolder := usecase.NewOpenFolder()

	// Controller.
	ctrl := interfaces.NewController(meta, start, pause, resume, del, list, openFolder)

	// Pipe server.
	server := interfaces.NewPipeServer(pipeAddr, ctrl)

	log.Println("daemon: listening on", pipeAddr)
	if err := server.Serve(); err != nil {
		log.Fatal("daemon: ", err)
	}
}
