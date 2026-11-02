// Package httpbinding adapts the in-process ANWA runtime to net/http.
// Routing uses the standard Go ServeMux; this package does not own a server,
// credentials, business logic, or CORS policy.
package httpbinding

import (
	"context"
	"encoding/json"
	"errors"
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

type binding struct {
	runtime      Runtime
	authenticate func(*http.Request) (*anwa.VerifiedCaller, error)
	maxBodyBytes int64
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

// New returns an *http.ServeMux (which implements http.Handler), so a host
// can mount it without depending on a framework-specific ANWA adapter:
//
//	outerMux.Handle("/anwa/", handler)
//
// Go 1.22+ ServeMux owns method routing, 404/405 responses and path variables.
// Only successful route matches reach the dedicated ANWA handlers.
func New(runtime Runtime, options Options) (*http.ServeMux, error) {
	if runtime == nil {
		return nil, errors.New("ANWA HTTP runtime is required")
	}
	prefix := options.Prefix
	if prefix == "" {
		prefix = "/anwa"
	}
	if !strings.HasPrefix(prefix, "/") || prefix == "/" ||
		strings.HasSuffix(prefix, "/") || strings.Contains(prefix, "//") ||
		strings.ContainsAny(prefix, "?#{}% \t\r\n") {
		return nil, errors.New("invalid ANWA HTTP prefix")
	}
	limit := options.MaxBodyBytes
	if limit == 0 {
		limit = 1 << 20
	}
	if limit < 0 {
		return nil, errors.New("invalid max body size")
	}

	b := binding{
		runtime:      runtime,
		authenticate: options.Authenticate,
		maxBodyBytes: limit,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET "+prefix+"/catalog", b.catalog)
	mux.HandleFunc("GET "+prefix+"/interactions/{ref}", b.discover)
	mux.HandleFunc("POST "+prefix+"/invoke", b.invoke)
	return mux, nil
}

// caller obtains trusted identity only from host-side authentication, never
// from the Interaction input. It is shared by all three route handlers.
func (b binding) caller(w http.ResponseWriter, r *http.Request) (*anwa.RequestContext, bool) {
	var caller *anwa.VerifiedCaller
	if b.authenticate != nil {
		var err error
		caller, err = b.authenticate(r)
		if err != nil {
			writeProblem(w, http.StatusUnauthorized, "UNAUTHENTICATED", "Authentication failed")
			return nil, false
		}
		if caller != nil && strings.TrimSpace(caller.Subject) == "" {
			writeProblem(w, http.StatusInternalServerError, "ADAPTER_ERROR", "Invalid authenticated caller")
			return nil, false
		}
	}
	return &anwa.RequestContext{Caller: caller}, true
}
