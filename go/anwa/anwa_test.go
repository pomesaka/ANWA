package anwa

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func fixture(t *testing.T, demo string) Manifest {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "demo", demo, "anwa.json"))
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := ParseManifest(data)
	if err != nil {
		t.Fatal(err)
	}
	return manifest
}

func TestExistingTypeScriptManifestsParseInGo(t *testing.T) {
	for _, name := range []string{"calculator", "orders", "reports", "todo"} {
		t.Run(name, func(t *testing.T) {
			m := fixture(t, name)
			if m.ANWA != "0.2" || len(m.Interactions) == 0 {
				t.Fatalf("invalid parsed manifest: %+v", m)
			}
			if name == "todo" {
				if len(m.Interactions) != 27 || m.Definitions["Task"] == nil ||
					m.Definitions["Project"] == nil || m.Definitions["SavedQuery"] == nil {
					t.Fatal("Go must read shared Todo definitions and all 27 Interactions")
				}
			}
		})
	}
}

func TestManifest_RejectsInvalidDeclarations(t *testing.T) {
	cases := []struct{ name, json, want string }{
		{"unsupported schema keyword", `{"anwa":"0.2","entrypoints":["x"],"interactions":{"x":{"kind":"query","description":"test","input":{"type":"string","pattern":"x"}}}}`, "unknown field"},
		{"missing local reference", `{"anwa":"0.2","entrypoints":["x"],"interactions":{"x":{"kind":"query","description":"test","input":{"$ref":"#/$defs/Missing"}}}}`, "unknown or unsupported"},
		{"reference cycle", `{"anwa":"0.2","entrypoints":["x"],"$defs":{"A":{"$ref":"#/$defs/B"},"B":{"$ref":"#/$defs/A"}},"interactions":{"x":{"kind":"query","description":"test"}}}`, "cyclic"},
		{"reference sibling", `{"anwa":"0.2","entrypoints":["x"],"$defs":{"A":{"type":"string"}},"interactions":{"x":{"kind":"query","description":"test","input":{"$ref":"#/$defs/A","type":"string"}}}}`, "only schema keyword"},
		{"Thing root field", `{"anwa":"0.2","entrypoints":["x"],"things":{},"interactions":{"x":{"kind":"query","description":"test"}}}`, "unknown field"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ParseManifest([]byte(tc.json))
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("want %s error, got %v", tc.want, err)
			}
		})
	}
}

func calculatorApp(t *testing.T) *App {
	t.Helper()
	manifest := fixture(t, "calculator")
	app, err := New(manifest, Config{
		Public: []string{"calculator.add", "calculator.divide"},
		Handlers: map[string]Handler{
			"calculator.add": {Run: func(_ context.Context, args Args) (Response, error) {
				var input struct{ A, B float64 }
				if err := args.DecodeInput(&input); err != nil {
					return Response{}, err
				}
				return Reply(OK(input.A + input.B)), nil
			}},
			"calculator.divide": {Run: func(_ context.Context, args Args) (Response, error) {
				var input struct{ A, B float64 }
				if err := args.DecodeInput(&input); err != nil {
					return Response{}, err
				}
				if input.B == 0 {
					return Reply(Fail("DIVIDE_BY_ZERO")), nil
				}
				return Reply(OK(input.A / input.B)), nil
			}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	return app
}

func assertSettled(t *testing.T, response Response, code string) *Result {
	t.Helper()
	if response.Outcome.Kind != "settled" || response.Outcome.Execution != nil || response.Outcome.Result == nil {
		t.Fatalf("expected only a settled result: %+v", response)
	}
	result := response.Outcome.Result
	if code == "" {
		if !result.OK || result.Error != nil {
			t.Fatalf("expected success: %+v", result)
		}
		return result
	}
	if result.OK || result.Error == nil || result.Error.Code != code {
		t.Fatalf("expected %s: %+v", code, result)
	}
	return result
}

func TestCalculator_InvocationContract(t *testing.T) {
	for _, tc := range []struct {
		name, ref string
		input     any
		value     any
		code      string
	}{
		{"addition", "calculator.add", map[string]any{"a": 2, "b": 3}, float64(5), ""},
		{"division", "calculator.divide", map[string]any{"a": 12, "b": 3}, float64(4), ""},
		{"division by zero", "calculator.divide", map[string]any{"a": 1, "b": 0}, nil, "DIVIDE_BY_ZERO"},
		{"invalid numeric input", "calculator.add", map[string]any{"a": "bad", "b": 3}, nil, "INVALID_INPUT"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			response, err := calculatorApp(t).Interact(context.Background(), tc.ref, tc.input, nil)
			if err != nil {
				t.Fatal(err)
			}
			result := assertSettled(t, response, tc.code)
			if tc.code == "" && !reflect.DeepEqual(result.Value, tc.value) {
				t.Fatalf("want %#v got %#v", tc.value, result.Value)
			}
			if len(response.Context.Next) != 0 {
				t.Fatalf("calculator must not prescribe a follow-up: %+v", response.Context)
			}
		})
	}
}

func securedManifest() Manifest {
	return Manifest{
		ANWA: "0.2", EntryPoints: []string{"private.read", "public.ping"},
		Interactions: map[string]Interaction{
			"private.read": {
				Kind: "query", Description: "Guarded read", Guard: "canRead",
				Errors: map[string]string{"AUTH_REQUIRED": "Login required"},
				Output: &Schema{Type: "string"},
			},
			"public.ping": {Kind: "query", Description: "Public ping", Output: &Schema{Type: "string"}},
		},
	}
}

func TestAccess_DiscoveryAndRunAreCallerScoped(t *testing.T) {
	for _, tc := range []struct {
		name     string
		caller   *RequestContext
		refs     []string
		code     string
		executed int
	}{
		{"anonymous", nil, []string{"public.ping"}, "AUTH_REQUIRED", 0},
		{"verified caller", &RequestContext{Caller: &VerifiedCaller{Subject: "alice"}}, []string{"private.read", "public.ping"}, "", 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ran := 0
			app, err := New(securedManifest(), Config{
				Public: []string{"public.ping"},
				Handlers: map[string]Handler{
					"public.ping": {Run: func(_ context.Context, _ Args) (Response, error) {
						return Reply(OK("pong"), Next{Ref: "private.read"}), nil
					}},
					"private.read": {
						Run: func(_ context.Context, _ Args) (Response, error) {
							ran++
							return Reply(OK("secret"), Next{Ref: "public.ping"}), nil
						},
						OnDenied: func(_ context.Context, _ Args, _ DomainError) ([]Next, error) {
							return []Next{{Ref: "private.read"}}, nil
						},
					},
				},
				Guards: map[string]Guard{"canRead": func(_ context.Context, args Args) (GuardDecision, error) {
					if args.Caller == nil {
						return GuardDecision{Error: &DomainError{Code: "AUTH_REQUIRED"}}, nil
					}
					return GuardDecision{Allowed: true}, nil
				}},
				Discoverable: func(_ string, caller *VerifiedCaller) bool { return caller != nil },
			})
			if err != nil {
				t.Fatal(err)
			}
			catalog, err := app.Catalog(tc.caller)
			if err != nil {
				t.Fatal(err)
			}
			refs := make([]string, 0, len(catalog.Interactions))
			for _, item := range catalog.Interactions {
				refs = append(refs, item.Ref)
			}
			if !reflect.DeepEqual(refs, tc.refs) {
				t.Fatalf("want disclosed refs %v got %v", tc.refs, refs)
			}
			_, err = app.Discover("private.read", tc.caller)
			if (err == nil) != (tc.executed == 1) {
				t.Fatalf("description exposure disagrees with policy: %v", err)
			}
			ping, err := app.Interact(context.Background(), "public.ping", nil, tc.caller)
			if err != nil {
				t.Fatal(err)
			}
			if got := assertSettled(t, ping, "").Value; got != "pong" {
				t.Fatalf("public read: %+v", got)
			}
			if len(ping.Context.Next) != tc.executed {
				t.Fatalf("private continuation exposure: %+v", ping.Context)
			}
			result, err := app.Interact(context.Background(), "private.read", nil, tc.caller)
			if err != nil {
				t.Fatal(err)
			}
			outcome := assertSettled(t, result, tc.code)
			if tc.code == "" && outcome.Value != "secret" {
				t.Fatalf("guarded success payload: %+v", outcome)
			}
			if ran != tc.executed {
				t.Fatalf("want %d handler calls got %d", tc.executed, ran)
			}
			if len(result.Context.Next) != tc.executed {
				t.Fatalf("private next exposure: %+v", result.Context)
			}
		})
	}
}

func TestAccess_EmptyTrustedSubjectIsRejected(t *testing.T) {
	if _, err := calculatorApp(t).Catalog(&RequestContext{Caller: &VerifiedCaller{Subject: " "}}); err == nil {
		t.Fatal("empty trusted subject accepted")
	}
}

func TestContractViolationsAreOpaque(t *testing.T) {
	tests := []struct {
		name string
		run  InvokeHandler
	}{
		{"undeclared domain error", func(_ context.Context, _ Args) (Response, error) { return Reply(Fail("PRIVATE_ERROR")), nil }},
		{"invalid success output", func(_ context.Context, _ Args) (Response, error) { return Reply(OK(123)), nil }},
		{"unknown next", func(_ context.Context, _ Args) (Response, error) {
			return Reply(OK("ok"), Next{Ref: "secret.missing"}), nil
		}},
		{"invalid retry timing", func(_ context.Context, _ Args) (Response, error) {
			return Reply(OK("ok"), Next{Ref: "public.ping", Guidance: &Guidance{Kind: "retry"}, When: &Timing{After: "tomorrow"}}), nil
		}},
		{"accepted query", func(_ context.Context, _ Args) (Response, error) { return Accepted("id"), nil }},
		{"handler error", func(_ context.Context, _ Args) (Response, error) {
			return Response{}, errors.New("private information")
		}},
		{"handler panic", func(_ context.Context, _ Args) (Response, error) { panic("secret stacktrace") }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			doc := Manifest{ANWA: "0.2", EntryPoints: []string{"public.ping"}, Interactions: map[string]Interaction{
				"public.ping": {Kind: "query", Description: "Read", Output: &Schema{Type: "string"}},
			}}
			app, err := New(doc, Config{Public: []string{"public.ping"},
				Handlers: map[string]Handler{"public.ping": {Run: tc.run}}})
			if err != nil {
				t.Fatal(err)
			}
			reply, err := app.Interact(context.Background(), "public.ping", nil, nil)
			if err != nil {
				t.Fatal(err)
			}
			result := assertSettled(t, reply, "UNEXPECTED_ERROR")
			want := &DomainError{Code: "UNEXPECTED_ERROR", Message: "Unexpected application failure", Effects: "unknown"}
			if !reflect.DeepEqual(result.Error, want) || len(reply.Context.Next) != 0 {
				t.Fatalf("failure must be opaque and have no continuation: %+v", reply)
			}
		})
	}
}

func TestSharedSchemas_InputAndOutputValidation(t *testing.T) {
	doc := Manifest{
		ANWA: "0.2", EntryPoints: []string{"data.echo"},
		Definitions: map[string]*Schema{
			"Word": {Type: "string"},
			"Container": {Type: "object", Properties: map[string]*Schema{
				"label": {Ref: "#/$defs/Word"},
			}, Required: []string{"label"}, AdditionalProperties: boolPtr(false)},
		},
		Interactions: map[string]Interaction{"data.echo": {
			Kind: "query", Description: "Read shared data",
			Input: &Schema{Ref: "#/$defs/Container"}, Output: &Schema{Ref: "#/$defs/Container"},
		}},
	}
	for _, tc := range []struct {
		name   string
		input  any
		output any
		code   string
		calls  int
	}{
		{"invalid input prevents handler", map[string]any{"label": 9}, map[string]any{"label": "hello"}, "INVALID_INPUT", 0},
		{"valid shared payload", map[string]any{"label": "hello"}, map[string]any{"label": "hello"}, "", 1},
		{"invalid output is opaque", map[string]any{"label": "hello"}, map[string]any{"label": 9}, "UNEXPECTED_ERROR", 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			app, err := New(doc, Config{Public: []string{"data.echo"}, Handlers: map[string]Handler{
				"data.echo": {Run: func(_ context.Context, _ Args) (Response, error) { calls++; return Reply(OK(tc.output)), nil }},
			}})
			if err != nil {
				t.Fatal(err)
			}
			response, err := app.Interact(context.Background(), "data.echo", tc.input, nil)
			if err != nil {
				t.Fatal(err)
			}
			result := assertSettled(t, response, tc.code)
			if calls != tc.calls {
				t.Fatalf("want %d calls got %d", tc.calls, calls)
			}
			if tc.code == "" && !reflect.DeepEqual(result.Value, tc.output) {
				t.Fatalf("want %+v got %+v", tc.output, result.Value)
			}
		})
	}
}
func boolPtr(v bool) *bool { return &v }

func TestAcceptedActionsAndObservationGuards(t *testing.T) {
	doc := Manifest{ANWA: "0.2", EntryPoints: []string{"job.start", "job.events"}, Interactions: map[string]Interaction{
		"job.start": {Kind: "action", Description: "Start job", HasSideEffects: boolPtr(true), Idempotent: boolPtr(false)},
		"job.events": {Kind: "event", Description: "Private updates", Guard: "canWatch",
			Errors: map[string]string{"AUTH_REQUIRED": "Login"}},
	}}
	calls := 0
	app, err := New(doc, Config{
		Public: []string{"job.start"},
		Handlers: map[string]Handler{
			"job.start": {Run: func(_ context.Context, _ Args) (Response, error) {
				return Accepted("opaque-123"), nil
			}},
			"job.events": {Observe: func(_ context.Context, _ Args, cursor *int) (<-chan any, error) {
				calls++
				ch := make(chan any, 1)
				ch <- map[string]any{"kind": "progress", "cursor": cursor}
				close(ch)
				return ch, nil
			}},
		},
		Guards: map[string]Guard{"canWatch": func(_ context.Context, a Args) (GuardDecision, error) {
			if a.Caller == nil {
				return GuardDecision{Error: &DomainError{Code: "AUTH_REQUIRED"}}, nil
			}
			return GuardDecision{Allowed: true}, nil
		}},
		Discoverable: func(_ string, caller *VerifiedCaller) bool { return caller != nil },
	})
	if err != nil {
		t.Fatal(err)
	}
	job, err := app.Interact(context.Background(), "job.start", nil, nil)
	if err != nil || job.Outcome.Kind != "accepted" || job.Outcome.Execution.ID != "opaque-123" {
		t.Fatalf("accepted: %+v %v", job, err)
	}
	_, err = app.Observe(context.Background(), "job.events", nil, nil, nil)
	var denied ObservationDenied
	if !errors.As(err, &denied) || denied.Code != "AUTH_REQUIRED" || calls != 0 {
		t.Fatalf("guarded subscription: %v", err)
	}
	index := 2
	ch, err := app.Observe(context.Background(), "job.events", nil, &index,
		&RequestContext{Caller: &VerifiedCaller{Subject: "alice"}})
	if err != nil || calls != 1 {
		t.Fatalf("observe: %v", err)
	}
	if event, ok := <-ch; !ok || event == nil {
		t.Fatal("expected event")
	}
	if _, ok := <-ch; ok {
		t.Fatal("finite event stream should close")
	}
}

func TestWire_SuccessIncludesExplicitNullAndEmptyContinuation(t *testing.T) {
	data, err := json.Marshal(Reply(OK(nil)))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), `"result":{"ok":true,"value":null}`) ||
		!strings.Contains(string(data), `"context":{"next":[]}`) {
		t.Fatalf("result wire contract: %s", data)
	}
}

func TestManifest_ActionEffectsAreRequiredBooleans(t *testing.T) {
	cases := []struct {
		name, kind          string
		effects, idempotent *bool
		valid               bool
	}{
		{"explicit false values", "action", boolPtr(false), boolPtr(false), true},
		{"pure idempotent Action", "action", boolPtr(false), boolPtr(true), true},
		{"missing side effects", "action", nil, boolPtr(true), false},
		{"missing idempotency", "action", boolPtr(true), nil, false},
		{"Query forbids Action fields", "query", boolPtr(false), boolPtr(true), false},
		{"Event forbids Action fields", "event", boolPtr(false), boolPtr(true), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			doc := Manifest{ANWA: "0.2", EntryPoints: []string{"test.run"}, Interactions: map[string]Interaction{
				"test.run": {Kind: tc.kind, Description: "Operation", HasSideEffects: tc.effects, Idempotent: tc.idempotent},
			}}
			err := doc.Validate()
			if (err == nil) != tc.valid {
				t.Fatalf("want valid=%t, got %v", tc.valid, err)
			}
		})
	}
}
