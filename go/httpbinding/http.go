// Package httpbinding adapts the in-process ANWA runtime to net/http.
// It does not own a server, router, credentials, business logic, or CORS policy.
package httpbinding

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"

	"github.com/pomesaka/ANWA/go/anwa"
)

// Runtime is the minimal interface needed by the HTTP binding. *anwa.App
// implements it; other implementations can be supplied for tests or wrappers.
type Runtime interface {
	Catalog(*anwa.RequestContext) (anwa.Catalog, error)
	Discover(string, *anwa.RequestContext) (anwa.Discovery, error)
	Interact(context.Context, string, any, *anwa.RequestContext) (anwa.Response, error)
}

type Options struct {
	// Prefix defaults to /anwa, and must be registered with a parent mux.
	Prefix string
	// Authenticate is trusted application/transport code, NOT user-supplied JSON.
	// When nil, requests are anonymous; public Interactions can still be invoked.
	Authenticate func(*http.Request) (*anwa.VerifiedCaller, error)
	// MaxBodyBytes defaults to 1 MiB.
	MaxBodyBytes int64
}

type invokeEnvelope struct {
	Ref   string          `json:"ref"`
	Input json.RawMessage `json:"input,omitempty"`
}

func writeProblem(w http.ResponseWriter, status int, code, title string) {
	w.Header().Set("Content-Type", "application/problem+json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(struct {
		Type   string `json:"type"`
		Title  string `json:"title"`
		Status int    `json:"status"`
		Code   string `json:"code"`
	}{
		Type: "about:blank", Title: title, Status: status, Code: code,
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

// New returns a self-contained http.Handler. Attach it to an existing
// ServeMux, chi, or any router that accepts net/http handlers:
//
//     mux.Handle("/anwa/", handler)
//
// The HTTP Binding 0.1 exposes Query/Action and Discovery. Event streaming,
// idempotency-key storage and authentication mechanisms are separate concerns.
func New(runtime Runtime, options Options) (http.Handler, error) {
	if runtime == nil {
		return nil, errors.New("ANWA HTTP runtime is required")
	}
	prefix := options.Prefix
	if prefix == "" {
		prefix = "/anwa"
	}
	if !strings.HasPrefix(prefix, "/") || prefix == "/" ||
		strings.HasSuffix(prefix, "/") || strings.Contains(prefix, "//") ||
		strings.ContainsAny(prefix, "?#") {
		return nil, errors.New("invalid ANWA HTTP prefix")
	}
	limit := options.MaxBodyBytes
	if limit == 0 {
		limit = 1 << 20
	}
	if limit < 0 {
		return nil, errors.New("invalid max body size")
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		catalog := path == prefix+"/catalog"
		invoke := path == prefix+"/invoke"
		description := strings.HasPrefix(path, prefix+"/interactions/")
		if !catalog && !invoke && !description {
			writeProblem(w, http.StatusNotFound, "NOT_FOUND", "Route not found")
			return
		}
		allow := http.MethodGet
		if invoke {
			allow = http.MethodPost
		}
		if r.Method != allow {
			w.Header().Set("Allow", allow)
			writeProblem(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed")
			return
		}
		var caller *anwa.VerifiedCaller
		if options.Authenticate != nil {
			var err error
			caller, err = options.Authenticate(r)
			if err != nil {
				writeProblem(w, http.StatusUnauthorized, "UNAUTHENTICATED", "Authentication failed")
				return
			}
			if caller != nil && strings.TrimSpace(caller.Subject) == "" {
				writeProblem(w, http.StatusInternalServerError, "ADAPTER_ERROR", "Invalid authenticated caller")
				return
			}
		}
		ctx := &anwa.RequestContext{Caller: caller}
		if catalog {
			result, err := runtime.Catalog(ctx)
			if err != nil {
				writeProblem(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Server error")
				return
			}
			writeJSON(w, http.StatusOK, result)
			return
		}
		if description {
			ref := strings.TrimPrefix(path, prefix+"/interactions/")
			if ref == "" || strings.ContainsAny(ref, "/%") {
				writeProblem(w, http.StatusNotFound, "NOT_FOUND", "Interaction not found")
				return
			}
			result, err := runtime.Discover(ref, ctx)
			if err != nil {
				writeProblem(w, http.StatusNotFound, "NOT_FOUND", "Interaction not found")
				return
			}
			writeJSON(w, http.StatusOK, result)
			return
		}
		contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || contentType != "application/json" {
			writeProblem(w, http.StatusUnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json")
			return
		}
		if r.ContentLength > limit {
			writeProblem(w, http.StatusRequestEntityTooLarge, "PAYLOAD_TOO_LARGE", "Request body too large")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit)
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
			dec := json.NewDecoder(strings.NewReader(string(envelope.Input)))
			dec.UseNumber()
			if err := dec.Decode(&input); err != nil {
				writeProblem(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid request envelope")
				return
			}
		}
		result, err := runtime.Interact(r.Context(), envelope.Ref, input, ctx)
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
	}), nil
}
