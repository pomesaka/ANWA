package httpbinding

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pomesaka/ANWA/go/anwa"
)

func demo(t *testing.T) *anwa.App {
	t.Helper()
	manifest := anwa.Manifest{
		ANWA:        "0.2",
		EntryPoints: []string{"public.add", "private.read", "job.start"},
		Interactions: map[string]anwa.Interaction{
			"public.add": {
				Kind: "action", Description: "Add two values", HasSideEffects: boolPtr(false), Idempotent: boolPtr(true),
				Input: &anwa.Schema{Type: "object", Properties: map[string]*anwa.Schema{
					"a": {Type: "integer"}, "b": {Type: "integer"},
				}, Required: []string{"a", "b"}, AdditionalProperties: boolPtr(false)},
				Output: &anwa.Schema{Type: "integer"},
				Errors: map[string]string{"FAILURE": "Expected failure"},
			},
			"private.read": {
				Kind: "query", Description: "Private data",
				Guard: "requireCaller", Output: &anwa.Schema{Type: "string"},
				Errors: map[string]string{"AUTH_REQUIRED": "Auth required"},
			},
			"job.start": {
				Kind: "action", Description: "Start async work",
				HasSideEffects: boolPtr(true), Idempotent: boolPtr(false),
			},
		},
	}
	app, err := anwa.New(manifest, anwa.Config{
		Public:       []string{"public.add", "job.start"},
		Discoverable: func(_ string, caller *anwa.VerifiedCaller) bool { return caller != nil },
		Guards: map[string]anwa.Guard{"requireCaller": func(_ context.Context, args anwa.Args) (anwa.GuardDecision, error) {
			if args.Caller == nil {
				return anwa.GuardDecision{Error: &anwa.DomainError{Code: "AUTH_REQUIRED", Effects: "none"}}, nil
			}
			return anwa.GuardDecision{Allowed: true}, nil
		}},
		Handlers: map[string]anwa.Handler{
			"public.add": {Run: func(_ context.Context, args anwa.Args) (anwa.Response, error) {
				var input struct{ A, B int64 }
				if err := args.DecodeInput(&input); err != nil {
					return anwa.Response{}, err
				}
				if input.A == 99 {
					return anwa.Reply(anwa.Fail("FAILURE")), nil
				}
				return anwa.Reply(anwa.OK(input.A + input.B)), nil
			}},
			"private.read": {
				Run: func(_ context.Context, args anwa.Args) (anwa.Response, error) {
					return anwa.Reply(anwa.OK(args.Caller.Subject)), nil
				},
				OnDenied: func(_ context.Context, _ anwa.Args, _ anwa.DomainError) ([]anwa.Next, error) {
					return nil, nil
				},
			},
			"job.start": {Run: func(_ context.Context, _ anwa.Args) (anwa.Response, error) {
				return anwa.Accepted("execution-1"), nil
			}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	return app
}
func boolPtr(v bool) *bool { return &v }

func server(t *testing.T) http.Handler {
	t.Helper()
	handler, err := New(demo(t), Options{
		Authenticate: func(r *http.Request) (*anwa.VerifiedCaller, error) {
			if r.Header.Get("Authorization") == "" {
				return nil, nil
			}
			if r.Header.Get("Authorization") != "Bearer valid-test-token" {
				return nil, errors.New("bad token")
			}
			return &anwa.VerifiedCaller{Subject: "alice"}, nil
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle("/anwa/", handler)
	mux.HandleFunc("/other", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })
	return mux
}
func send(h http.Handler, method, path, body, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if method == "POST" {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", token)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}
func resultCode(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var value struct {
		Outcome struct {
			Result struct {
				Error struct {
					Code string `json:"code"`
				} `json:"error"`
			} `json:"result"`
		} `json:"outcome"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &value); err != nil {
		t.Fatal(err)
	}
	return value.Outcome.Result.Error.Code
}

func TestNativeServeMuxAndDiscovery(t *testing.T) {
	mux := server(t)
	if got := send(mux, "GET", "/other", "", ""); got.Code != 204 {
		t.Fatalf("sibling route: %d", got.Code)
	}
	anon := send(mux, "GET", "/anwa/catalog", "", "")
	if anon.Code != 200 || strings.Contains(anon.Body.String(), "private.read") {
		t.Fatalf("anonymous leak: %d %s", anon.Code, anon.Body.String())
	}
	auth := send(mux, "GET", "/anwa/catalog", "", "Bearer valid-test-token")
	if auth.Code != 200 || !strings.Contains(auth.Body.String(), "private.read") {
		t.Fatalf("auth discovery: %d %s", auth.Code, auth.Body.String())
	}
	private := send(mux, "GET", "/anwa/interactions/private.read", "", "")
	if private.Code != 404 {
		t.Fatalf("private description leaked: %d", private.Code)
	}
	public := send(mux, "GET", "/anwa/interactions/public.add", "", "")
	if public.Code != 200 || !strings.Contains(public.Body.String(), "public.add") {
		t.Fatalf("description failed: %d %s", public.Code, public.Body.String())
	}
}

func TestInvokeStatusesAuthenticationAndNoCallerSpoofing(t *testing.T) {
	mux := server(t)
	add := send(mux, "POST", "/anwa/invoke", `{"ref":"public.add","input":{"a":2,"b":3}}`, "")
	if add.Code != 200 || !strings.Contains(add.Body.String(), `"value":5`) {
		t.Fatalf("add: %d %s", add.Code, add.Body.String())
	}
	if add.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("must not cache")
	}
	failure := send(mux, "POST", "/anwa/invoke", `{"ref":"public.add","input":{"a":99,"b":0}}`, "")
	if failure.Code != 200 || resultCode(t, failure) != "FAILURE" {
		t.Fatalf("domain error: %d %s", failure.Code, failure.Body.String())
	}
	invalid := send(mux, "POST", "/anwa/invoke", `{"ref":"public.add","input":{"a":"2","b":3}}`, "")
	if invalid.Code != 200 || resultCode(t, invalid) != "INVALID_INPUT" {
		t.Fatalf("input: %d %s", invalid.Code, invalid.Body.String())
	}
	accepted := send(mux, "POST", "/anwa/invoke", `{"ref":"job.start"}`, "")
	if accepted.Code != 202 || !strings.Contains(accepted.Body.String(), "execution-1") {
		t.Fatalf("accepted: %d %s", accepted.Code, accepted.Body.String())
	}
	anonymous := send(mux, "POST", "/anwa/invoke", `{"ref":"private.read"}`, "")
	if anonymous.Code != 200 || resultCode(t, anonymous) != "AUTH_REQUIRED" {
		t.Fatalf("denial: %d %s", anonymous.Code, anonymous.Body.String())
	}
	spoof := send(mux, "POST", "/anwa/invoke", `{"ref":"private.read","caller":{"subject":"alice"}}`, "")
	if spoof.Code != 400 {
		t.Fatalf("spoof accepted: %d %s", spoof.Code, spoof.Body.String())
	}
	auth := send(mux, "POST", "/anwa/invoke", `{"ref":"private.read"}`, "Bearer valid-test-token")
	if auth.Code != 200 || !strings.Contains(auth.Body.String(), `"value":"alice"`) {
		t.Fatalf("verified auth: %d %s", auth.Code, auth.Body.String())
	}
	badToken := send(mux, "GET", "/anwa/catalog", "", "Bearer invalid")
	if badToken.Code != 401 || strings.Contains(badToken.Body.String(), "bad token") {
		t.Fatalf("leaked auth error: %d %s", badToken.Code, badToken.Body.String())
	}
}

func TestProtocolErrorsAndRequestLimit(t *testing.T) {
	mux := server(t)
	tests := []struct {
		method, path, body string
		want               int
	}{
		{"GET", "/anwa/invoke", "", 405},
		{"POST", "/anwa/catalog", "{}", 405},
		{"GET", "/anwa/unknown", "", 404},
		{"GET", "/anwa/interactions/unknown", "", 404},
		{"POST", "/anwa/invoke", `{"ref":"unknown"}`, 404},
		{"POST", "/anwa/invoke", `{"ref":"public.add"`, 400},
		{"POST", "/anwa/invoke", `{"ref":"public.add"} {"ref":"job.start"}`, 400},
		{"POST", "/anwa/invoke", `{"ref":"public.add","caller":"spoofed"}`, 400},
		{"POST", "/anwa/invoke", `null`, 400},
	}
	for _, tc := range tests {
		t.Run(tc.method+tc.path+tc.body, func(t *testing.T) {
			res := send(mux, tc.method, tc.path, tc.body, "")
			if res.Code != tc.want {
				t.Fatalf("want %d got %d: %s", tc.want, res.Code, res.Body.String())
			}
			if tc.want >= 400 && !strings.HasPrefix(res.Header().Get("Content-Type"), "application/problem+json") {
				t.Fatalf("missing problem details: %s", res.Header().Get("Content-Type"))
			}
		})
	}
	method := send(mux, "GET", "/anwa/invoke", "", "")
	if method.Header().Get("Allow") != "POST" {
		t.Fatal("missing Allow")
	}
	noContentType := httptest.NewRequest("POST", "/anwa/invoke", strings.NewReader("{}"))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, noContentType)
	if rec.Code != 415 {
		t.Fatalf("missing content type accepted: %d", rec.Code)
	}
	h, err := New(demo(t), Options{MaxBodyBytes: 20})
	if err != nil {
		t.Fatal(err)
	}
	large := send(h, "POST", "/anwa/invoke", `{"ref":"public.add","input":{"a":1,"b":2}}`, "")
	if large.Code != 413 {
		t.Fatalf("large request: %d", large.Code)
	}
	if _, err := New(demo(t), Options{Prefix: "/anwa/"}); err == nil {
		t.Fatal("invalid prefix accepted")
	}
}

func TestCustomPrefixAndNoDefaultAuthentication(t *testing.T) {
	h, err := New(demo(t), Options{Prefix: "/agent"})
	if err != nil {
		t.Fatal(err)
	}
	r := send(h, "GET", "/agent/catalog", "", "")
	if r.Code != 200 || strings.Contains(r.Body.String(), "private.read") {
		t.Fatalf("default auth must be anonymous: %d %s", r.Code, r.Body.String())
	}
}

func TestRealHTTPServerRoundTrip(t *testing.T) {
	h, err := New(demo(t), Options{})
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle("/anwa/", h)
	server := httptest.NewServer(mux)
	defer server.Close()

	req, err := http.NewRequest(http.MethodPost, server.URL+"/anwa/invoke",
		strings.NewReader(`{"ref":"public.add","input":{"a":20,"b":22}}`))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	client := server.Client()
	response, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var result struct {
		Outcome struct {
			Result struct {
				OK    bool `json:"ok"`
				Value int  `json:"value"`
			} `json:"result"`
		} `json:"outcome"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != 200 || !result.Outcome.Result.OK || result.Outcome.Result.Value != 42 {
		t.Fatalf("real network round trip: status=%d result=%+v", response.StatusCode, result)
	}
}
