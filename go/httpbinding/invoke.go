package httpbinding

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"
)

// explicitNullInput preserves the difference between omitted input and
// explicit JSON null without changing the in-process App interface.
type explicitNullInput struct{}

func (explicitNullInput) MarshalJSON() ([]byte, error) { return []byte("null"), nil }

type invokeEnvelope struct {
	Ref   string          `json:"ref"`
	Input json.RawMessage `json:"input,omitempty"`
}

func (b binding) invoke(w http.ResponseWriter, r *http.Request) {
	ctx, ok := b.caller(w, r)
	if !ok {
		return
	}
	contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || contentType != "application/json" {
		writeProblem(w, http.StatusUnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json")
		return
	}
	if r.ContentLength > b.maxBodyBytes {
		writeProblem(w, http.StatusRequestEntityTooLarge, "PAYLOAD_TOO_LARGE", "Request body too large")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, b.maxBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	decoder.UseNumber()
	var envelope invokeEnvelope
	if err := decoder.Decode(&envelope); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeProblem(w, http.StatusRequestEntityTooLarge, "PAYLOAD_TOO_LARGE", "Request body too large")
		} else {
			writeProblem(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid JSON request")
		}
		return
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		writeProblem(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid request envelope")
		return
	}
	if envelope.Ref == "" {
		writeProblem(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid request envelope")
		return
	}
	var input any
	if envelope.Input != nil {
		if strings.TrimSpace(string(envelope.Input)) == "null" {
			input = explicitNullInput{}
		} else {
			dec := json.NewDecoder(strings.NewReader(string(envelope.Input)))
			dec.UseNumber()
			if err := dec.Decode(&input); err != nil {
				writeProblem(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid request envelope")
				return
			}
		}
	}
	result, err := b.runtime.Interact(r.Context(), envelope.Ref, input, ctx)
	if err != nil {
		if err.Error() == "unknown InteractionRef" || err.Error() == "use Observe for Event Interactions" {
			writeProblem(w, http.StatusNotFound, "NOT_FOUND", "Interaction not found")
		} else {
			writeProblem(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Server error")
		}
		return
	}
	status := http.StatusOK
	if result.Outcome.Kind == "accepted" {
		status = http.StatusAccepted
	}
	writeJSON(w, status, result)
}
