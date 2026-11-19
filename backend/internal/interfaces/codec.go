// Package interfaces — адаптеры (pipe-сервер, контроллер, кодек фреймов).
package interfaces

import (
	"encoding/binary"
	"fmt"
	"io"
)

// ReadFrame читает один фрейм: 4-byte little-endian length + payload.
func ReadFrame(r io.Reader) ([]byte, error) {
	var lenBuf [4]byte
	if _, err := io.ReadFull(r, lenBuf[:]); err != nil {
		return nil, err
	}
	length := binary.LittleEndian.Uint32(lenBuf[:])
	if length == 0 {
		return nil, nil
	}
	if length > 64*1024*1024 { // защита от мусорных данных: максимум 64 МБ
		return nil, fmt.Errorf("frame too large: %d bytes", length)
	}
	payload := make([]byte, length)
	if _, err := io.ReadFull(r, payload); err != nil {
		return nil, err
	}
	return payload, nil
}

// WriteFrame записывает фрейм: 4-byte little-endian length + payload.
func WriteFrame(w io.Writer, data []byte) error {
	lenBuf := make([]byte, 4)
	binary.LittleEndian.PutUint32(lenBuf, uint32(len(data)))
	if _, err := w.Write(lenBuf); err != nil {
		return err
	}
	_, err := w.Write(data)
	return err
}
