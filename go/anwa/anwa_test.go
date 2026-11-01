package anwa

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
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

func TestManifestRejectsUnknownKeywordsAndRefs(t *testing.T) {
	for _, data := range []string{
		`{"anwa":"0.2","entrypoints":["x"],"interactions":{"x":{"kind":"query","description":"test","input":{"type":"string","pattern":"x"}}}}`,
		`{"anwa":"0.2","entrypoints":["x"],"interactions":{"x":{"kind":"query","description":"test","input":{"$ref":"#/$defs/Missing"}}}}`,
		`{"anwa":"0.2","entrypoints":["x"],"$defs":{"A":{"$ref":"#/$defs/B"},"B":{"$ref":"#/$defs/A"}},"interactions":{"x":{"kind":"query","description":"test"}}}`,
		`{"anwa":"0.2","entrypoints":["x"],"$defs":{"A":{"type":"string"}},"interactions":{"x":{"kind":"query","description":"test","input":{"$ref":"#/$defs/A","type":"string"}}}}`,
		`{"anwa":"0.2","entrypoints":["x"],"things":{},"interactions":{"x":{"kind":"query","description":"test"}}}`,
	} {
		if _, err := ParseManifest([]byte(data)); err == nil {
			t.Fatalf("expected invalid manifest: %s", data)
		}
	}
}

func TestCalculatorWorksFromSamePublicManifest(t *testing.T) {
	manifest := fixture(t, "calculator")
	app, err := New(manifest, Config{
		Public: []string{"calculator.add", "calculator.divide"},
		Handlers: map[string]Handler{
			"calculator.add": {Run: func(_ context.Context, args Args) (Response, error) {
				var input struct{ A, B float64 }
				if err := args.DecodeInput(&input); err != nil { return Response{}, err }
				return Reply(OK(input.A + input.B)), nil
			}},
			"calculator.divide": {Run: func(_ context.Context, args Args) (Response, error) {
				var input struct{ A, B float64 }
				if err := args.DecodeInput(&input); err != nil { return Response{}, err }
				if input.B == 0 { return Reply(Fail("DIVIDE_BY_ZERO")), nil }
				return Reply(OK(input.A / input.B)), nil
			}},
		},
	})
	if err != nil { t.Fatal(err) }
	catalog, err := app.Catalog(nil)
	if err != nil || len(catalog.Interactions) != 2 { t.Fatalf("catalog: %+v %v", catalog, err) }
	desc, err := app.Discover("calculator.divide", nil)
	if err != nil || desc.Description.Kind != "action" { t.Fatalf("discover: %+v %v", desc, err) }
	good, err := app.Interact(context.Background(), "calculator.add", map[string]any{"a": 2, "b": 3}, nil)
	if err != nil || good.Outcome.Result == nil || good.Outcome.Result.Value != float64(5) { t.Fatalf("result: %+v %v", good, err) }
	bad, err := app.Follow(context.Background(), Next{Ref: "calculator.add", Input: map[string]any{"a": "bad", "b": 3}}, nil)
	if err != nil || bad.Outcome.Result.Error.Code != "INVALID_INPUT" { t.Fatalf("invalid input: %+v %v", bad, err) }
	div, err := app.Interact(context.Background(), "calculator.divide", map[string]any{"a": 1, "b": 0}, nil)
	if err != nil || div.Outcome.Result.Error.Code != "DIVIDE_BY_ZERO" { t.Fatalf("domain error: %+v %v", div, err) }
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

func TestGuardsDiscoveryAndNoLeaks(t *testing.T) {
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
	if err != nil { t.Fatal(err) }
	public, err := app.Catalog(nil)
	if err != nil || len(public.Interactions) != 1 { t.Fatalf("anonymous discovery leaked: %+v %v", public, err) }
	if _, err := app.Discover("private.read", nil); err == nil { t.Fatal("anonymous discovery must be hidden") }
	ping, _ := app.Interact(context.Background(), "public.ping", nil, nil)
	if len(ping.Context.Next) != 0 { t.Fatal("private next leaked") }
	denied, err := app.Interact(context.Background(), "private.read", nil, nil)
	if err != nil || denied.Outcome.Result.Error.Code != "AUTH_REQUIRED" || ran != 0 || len(denied.Context.Next) != 0 {
		t.Fatalf("guard denial: %+v %v", denied, err)
	}
	alice := &RequestContext{Caller: &VerifiedCaller{Subject: "alice"}}
	visible, _ := app.Catalog(alice)
	if len(visible.Interactions) != 2 { t.Fatalf("authenticated visibility: %+v", visible) }
	success, err := app.Interact(context.Background(), "private.read", nil, alice)
	if err != nil || !success.Outcome.Result.OK || ran != 1 || success.Context.Next[0].Ref != "public.ping" {
		t.Fatalf("authenticated read: %+v %v", success, err)
	}
	if _, err := app.Catalog(&RequestContext{Caller: &VerifiedCaller{Subject: " "}}); err == nil {
		t.Fatal("untrusted empty Caller must be rejected")
	}
}

func TestContractViolationsAreOpaque(t *testing.T) {
	tests := []struct {
		name string
		run  InvokeHandler
	}{
		{"undeclared domain error", func(_ context.Context, _ Args) (Response, error) { return Reply(Fail("PRIVATE_ERROR")), nil }},
		{"invalid success output", func(_ context.Context, _ Args) (Response, error) { return Reply(OK(123)), nil }},
		{"unknown next", func(_ context.Context, _ Args) (Response, error) { return Reply(OK("ok"), Next{Ref: "secret.missing"}), nil }},
		{"invalid retry timing", func(_ context.Context, _ Args) (Response, error) { return Reply(OK("ok"), Next{Ref: "public.ping", Guidance: &Guidance{Kind: "retry"}, When: &Timing{After: "tomorrow"}}), nil }},
		{"accepted query", func(_ context.Context, _ Args) (Response, error) { return Accepted("id"), nil }},
		{"handler error", func(_ context.Context, _ Args) (Response, error) { return Response{}, errors.New("private information") }},
		{"handler panic", func(_ context.Context, _ Args) (Response, error) { panic("secret stacktrace") }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			doc := Manifest{ANWA: "0.2", EntryPoints: []string{"public.ping"}, Interactions: map[string]Interaction{
				"public.ping": {Kind: "query", Description: "Read", Output: &Schema{Type: "string"}},
			}}
			app, err := New(doc, Config{Public: []string{"public.ping"},
				Handlers: map[string]Handler{"public.ping": {Run: tc.run}}})
			if err != nil { t.Fatal(err) }
			reply, err := app.Interact(context.Background(), "public.ping", nil, nil)
			if err != nil || reply.Outcome.Result == nil || reply.Outcome.Result.Error == nil ||
				reply.Outcome.Result.Error.Code != "UNEXPECTED_ERROR" ||
				len(reply.Context.Next) != 0 {
				t.Fatalf("failed to hide violation: %+v %v", reply, err)
			}
		})
	}
}

func TestSharedSchemasValidateInputAndOutput(t *testing.T) {
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
	app, err := New(doc, Config{Public: []string{"data.echo"}, Handlers: map[string]Handler{
		"data.echo": {Run: func(_ context.Context, args Args) (Response, error) {
			return Reply(OK(args.Input)), nil
		}},
	}})
	if err != nil { t.Fatal(err) }
	invalid, _ := app.Follow(context.Background(), Next{Ref: "data.echo", Input: map[string]any{"label": 9}}, nil)
	if invalid.Outcome.Result.Error.Code != "INVALID_INPUT" { t.Fatalf("bad local reference input: %+v", invalid) }
	valid, err := app.Interact(context.Background(), "data.echo", map[string]any{"label": "hello"}, nil)
	if err != nil || !valid.Outcome.Result.OK { t.Fatalf("valid ref input: %+v %v", valid, err) }
	if valid.Outcome.Result.Value.(map[string]any)["label"] != "hello" { t.Fatalf("wrong result: %+v", valid) }
}
func boolPtr(v bool) *bool { return &v }

func TestAcceptedActionsAndObservationGuards(t *testing.T) {
	doc := Manifest{ANWA: "0.2", EntryPoints: []string{"job.start", "job.events"}, Interactions: map[string]Interaction{
		"job.start": {Kind: "action", Description: "Start job"},
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
			if a.Caller == nil { return GuardDecision{Error: &DomainError{Code: "AUTH_REQUIRED"}}, nil }
			return GuardDecision{Allowed: true}, nil
		}},
		Discoverable: func(_ string, caller *VerifiedCaller) bool { return caller != nil },
	})
	if err != nil { t.Fatal(err) }
	job, err := app.Interact(context.Background(), "job.start", nil, nil)
	if err != nil || job.Outcome.Kind != "accepted" || job.Outcome.Execution.ID != "opaque-123" { t.Fatalf("accepted: %+v %v", job, err) }
	_, err = app.Observe(context.Background(), "job.events", nil, nil, nil)
	var denied ObservationDenied
	if !errors.As(err, &denied) || denied.Code != "AUTH_REQUIRED" || calls != 0 {
		t.Fatalf("guarded subscription: %v", err)
	}
	index := 2
	ch, err := app.Observe(context.Background(), "job.events", nil, &index,
		&RequestContext{Caller: &VerifiedCaller{Subject: "alice"}})
	if err != nil || calls != 1 { t.Fatalf("observe: %v", err) }
	if event, ok := <-ch; !ok || event == nil { t.Fatal("expected event") }
	if _, ok := <-ch; ok { t.Fatal("finite event stream should close") }
}

func TestResultNullIsSerializedAndNoErrorsAreLeaked(t *testing.T) {
	data, err := json.Marshal(Reply(OK(nil)))
	if err != nil { t.Fatal(err) }
	if !strings.Contains(string(data), `"result":{"ok":true,"value":null}`) ||
		!strings.Contains(string(data), `"context":{"next":[]}`) {
		t.Fatalf("result wire contract: %s", data)
	}
}
