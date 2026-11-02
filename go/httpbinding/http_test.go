package httpbinding

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
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

func TestHTTP_InvokePreservesOutcomeAndContext(t *testing.T) {
	cases := []struct {
		name, body, token string
		status            int
		kind              string
		value             any
		code, executionID string
	}{
		{name: "successful addition", body: `{"ref":"public.add","input":{"a":2,"b":3}}`, status: 200, kind: "settled", value: float64(5)},
		{name: "declared failure remains HTTP 200", body: `{"ref":"public.add","input":{"a":99,"b":0}}`, status: 200, kind: "settled", code: "FAILURE"},
		{name: "invalid input remains HTTP 200", body: `{"ref":"public.add","input":{"a":"2","b":3}}`, status: 200, kind: "settled", code: "INVALID_INPUT"},
		{name: "accepted work returns HTTP 202", body: `{"ref":"job.start"}`, status: 202, kind: "accepted", executionID: "execution-1"},
		{name: "anonymous Guard denial", body: `{"ref":"private.read"}`, status: 200, kind: "settled", code: "AUTH_REQUIRED"},
		{name: "verified caller is supplied separately", body: `{"ref":"private.read"}`, token: "Bearer valid-test-token", status: 200, kind: "settled", value: "alice"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := send(server(t), "POST", "/anwa/invoke", tc.body, tc.token)
			if rec.Code != tc.status {
				t.Fatalf("want status %d got %d: %s", tc.status, rec.Code, rec.Body.String())
			}
			if rec.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("ANWA responses must not be cached")
			}
			if !strings.HasPrefix(rec.Header().Get("Content-Type"), "application/json") {
				t.Fatalf("wrong media type: %s", rec.Header().Get("Content-Type"))
			}
			var body struct {
				Outcome struct {
					Kind   string `json:"kind"`
					Result *struct {
						OK    bool `json:"ok"`
						Value any  `json:"value"`
						Error *struct {
							Code string `json:"code"`
						} `json:"error"`
					} `json:"result"`
					Execution *struct {
						ID string `json:"id"`
					} `json:"execution"`
				} `json:"outcome"`
				Context *struct {
					Next []anwa.Next `json:"next"`
				} `json:"context"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if body.Outcome.Kind != tc.kind || body.Context == nil || len(body.Context.Next) != 0 {
				t.Fatalf("wrong envelope: %s", rec.Body.String())
			}
			if tc.kind == "accepted" {
				if body.Outcome.Result != nil || body.Outcome.Execution == nil || body.Outcome.Execution.ID != tc.executionID {
					t.Fatalf("expected deferred handle, got %s", rec.Body.String())
				}
				return
			}
			if body.Outcome.Result == nil || body.Outcome.Execution != nil {
				t.Fatalf("expected settled result, got %s", rec.Body.String())
			}
			result := body.Outcome.Result
			if tc.code != "" {
				if result.OK || result.Error == nil || result.Error.Code != tc.code {
					t.Fatalf("want failure %s got %s", tc.code, rec.Body.String())
				}
				return
			}
			if !result.OK || result.Error != nil || !reflect.DeepEqual(result.Value, tc.value) {
				t.Fatalf("want success value %#v got %s", tc.value, rec.Body.String())
			}
		})
	}
}

func TestHTTP_ProtocolFailuresDoNotBecomeDomainOutcomes(t *testing.T) {
	cases := []struct {
		name, method, path, body, token string
		status                          int
		code, allow                     string
	}{
		{name: "GET cannot invoke", method: "GET", path: "/anwa/invoke", status: 405, allow: "POST"},
		{name: "POST cannot discover catalog", method: "POST", path: "/anwa/catalog", body: "{}", status: 405, allow: "GET, HEAD"},
		{name: "unknown route uses native mux 404", method: "GET", path: "/anwa/unknown", status: 404},
		{name: "unknown description", method: "GET", path: "/anwa/interactions/unknown", status: 404, code: "NOT_FOUND"},
		{name: "unknown Interaction", method: "POST", path: "/anwa/invoke", body: `{"ref":"unknown"}`, status: 404, code: "NOT_FOUND"},
		{name: "incomplete JSON", method: "POST", path: "/anwa/invoke", body: `{"ref":"public.add"`, status: 400, code: "INVALID_REQUEST"},
		{name: "two JSON documents", method: "POST", path: "/anwa/invoke", body: `{"ref":"public.add"}{"ref":"job.start"}`, status: 400, code: "INVALID_REQUEST"},
		{name: "caller spoofing in envelope", method: "POST", path: "/anwa/invoke", body: `{"ref":"private.read","caller":{"subject":"alice"}}`, status: 400, code: "INVALID_REQUEST"},
		{name: "null is not an envelope", method: "POST", path: "/anwa/invoke", body: `null`, status: 400, code: "INVALID_REQUEST"},
		{name: "invalid credential", method: "GET", path: "/anwa/catalog", token: "Bearer invalid", status: 401, code: "UNAUTHENTICATED"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := send(server(t), tc.method, tc.path, tc.body, tc.token)
			if rec.Code != tc.status {
				t.Fatalf("want status %d got %d: %s", tc.status, rec.Code, rec.Body.String())
			}
			if rec.Header().Get("Allow") != tc.allow {
				t.Fatalf("want Allow %q got %q", tc.allow, rec.Header().Get("Allow"))
			}
			media := "text/plain"
			if tc.code != "" {
				media = "application/problem+json"
			}
			if !strings.HasPrefix(rec.Header().Get("Content-Type"), media) {
				t.Fatalf("want %s got %s", media, rec.Header().Get("Content-Type"))
			}
			if tc.code == "" {
				return
			} // Native mux owns the plain-text representation, not ANWA.
			var body struct {
				Code    string `json:"code"`
				Status  int    `json:"status"`
				Type    string `json:"type"`
				Outcome any    `json:"outcome"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if body.Code != tc.code || body.Status != tc.status || body.Type != "about:blank" || body.Outcome != nil {
				t.Fatalf("wrong protocol error: %s", rec.Body.String())
			}
			if strings.Contains(rec.Body.String(), "bad token") {
				t.Fatal("authentication details leaked")
			}
		})
	}
}

func TestHTTP_RequestMediaAndSizeLimits(t *testing.T) {
	cases := []struct {
		name, media, body string
		status            int
		code              string
	}{
		{"missing Content-Type", "", "{}", 415, "UNSUPPORTED_MEDIA_TYPE"},
		{"text Content-Type", "text/plain", "{}", 415, "UNSUPPORTED_MEDIA_TYPE"},
		{"body beyond 20 bytes", "application/json", `{"ref":"public.add","input":{"a":1,"b":2}}`, 413, "PAYLOAD_TOO_LARGE"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h, err := New(demo(t), Options{MaxBodyBytes: 20})
			if err != nil {
				t.Fatal(err)
			}
			req := httptest.NewRequest("POST", "/anwa/invoke", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", tc.media)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tc.status {
				t.Fatalf("want %d got %d", tc.status, rec.Code)
			}
			var body struct {
				Code string `json:"code"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if body.Code != tc.code {
				t.Fatalf("want code %s got %s", tc.code, body.Code)
			}
		})
	}
}

func TestHTTP_InvalidConfigurationFailsBeforeServing(t *testing.T) {
	for _, tc := range []struct {
		name    string
		options Options
	}{
		{"trailing slash", Options{Prefix: "/anwa/"}}, {"root prefix", Options{Prefix: "/"}}, {"negative body limit", Options{MaxBodyBytes: -1}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := New(demo(t), tc.options); err == nil {
				t.Fatal("invalid configuration accepted")
			}
		})
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
	// A caller can add its own route directly to the returned *http.ServeMux.
	h.HandleFunc("GET /agent/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	if health := send(h, "GET", "/agent/health", "", ""); health.Code != 204 {
		t.Fatalf("custom route: %d", health.Code)
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

func TestExplicitNullDoesNotMeanOmittedInput(t *testing.T) {
	mux := server(t)
	noInput := send(mux, "POST", "/anwa/invoke", `{"ref":"private.read"}`, "Bearer valid-test-token")
	if noInput.Code != 200 || !strings.Contains(noInput.Body.String(), `"value":"alice"`) {
		t.Fatalf("omitted input: %d %s", noInput.Code, noInput.Body.String())
	}
	explicitNull := send(mux, "POST", "/anwa/invoke",
		`{"ref":"private.read","input":null}`, "Bearer valid-test-token")
	if explicitNull.Code != 200 || resultCode(t, explicitNull) != "INVALID_INPUT" {
		t.Fatalf("explicit null must not be treated as omitted: %d %s", explicitNull.Code, explicitNull.Body.String())
	}
}

func TestHTTP_GetPatternAlsoAcceptsHead(t *testing.T) {
	server := httptest.NewServer(server(t))
	defer server.Close()
	request, err := http.NewRequest(http.MethodHead, server.URL+"/anwa/catalog", nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatalf("want HEAD 200 got %d", response.StatusCode)
	}
	data, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) != 0 {
		t.Fatalf("HEAD must have no body, got %s", data)
	}
}
