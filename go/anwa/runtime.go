package anwa

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"reflect"
	"regexp"
	"strings"
)

type VerifiedCaller struct {
	Subject string         `json:"subject"`
	Claims  map[string]any `json:"claims,omitempty"`
}

// RequestContext is supplied separately by a trusted adapter, never extracted
// from the agent-controlled Interaction input. This package does not authenticate.
type RequestContext struct {
	Caller *VerifiedCaller
}

type Args struct {
	Ref    string
	Input  any
	App    *App
	Caller *VerifiedCaller
}

func (a Args) DecodeInput(target any) error {
	data, err := json.Marshal(a.Input)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, target)
}

type DomainError struct {
	Code    string `json:"code"`
	Message string `json:"message,omitempty"`
	Details any    `json:"details,omitempty"`
	Effects string `json:"effects,omitempty"`
}

// Result uses custom JSON encoding so an OK result with a nil value still
// includes the required "value":null field.
type Result struct {
	OK    bool
	Value any
	Error *DomainError
}

func (r Result) MarshalJSON() ([]byte, error) {
	if r.OK {
		return json.Marshal(struct {
			OK    bool `json:"ok"`
			Value any  `json:"value"`
		}{OK: true, Value: r.Value})
	}
	return json.Marshal(struct {
		OK    bool         `json:"ok"`
		Error *DomainError `json:"error"`
	}{OK: false, Error: r.Error})
}

func OK(value any) Result     { return Result{OK: true, Value: value} }
func Fail(code string) Result { return Result{Error: &DomainError{Code: code}} }

type Execution struct {
	ID string `json:"id"`
}
type Outcome struct {
	Kind      string     `json:"kind"`
	Result    *Result    `json:"result,omitempty"`
	Execution *Execution `json:"execution,omitempty"`
}
type Guidance struct {
	Kind  string `json:"kind,omitempty"`
	Level string `json:"level,omitempty"`
}
type Timing struct {
	After string `json:"after"`
}
type Applicability struct {
	State  string `json:"state"`
	Reason string `json:"reason,omitempty"`
}
type Next struct {
	Ref           string         `json:"ref"`
	Input         any            `json:"input,omitempty"`
	Guidance      *Guidance      `json:"guidance,omitempty"`
	When          *Timing        `json:"when,omitempty"`
	Applicability *Applicability `json:"applicability,omitempty"`
}
type ResponseContext struct {
	Next []Next `json:"next"`
}
type Response struct {
	Outcome Outcome         `json:"outcome"`
	Context ResponseContext `json:"context"`
}

func Reply(result Result, next ...Next) Response {
	return Response{
		Outcome: Outcome{Kind: "settled", Result: &result},
		Context: ResponseContext{Next: append([]Next{}, next...)},
	}
}
func Accepted(id string, next ...Next) Response {
	return Response{
		Outcome: Outcome{Kind: "accepted", Execution: &Execution{ID: id}},
		Context: ResponseContext{Next: append([]Next{}, next...)},
	}
}
func unexpected() Response {
	return Reply(Result{Error: &DomainError{
		Code: "UNEXPECTED_ERROR", Message: "Unexpected application failure", Effects: "unknown",
	}})
}

// InvokeHandler constructs both Outcome and Context for one Query/Action.
type InvokeHandler func(context.Context, Args) (Response, error)
type DenialHandler func(context.Context, Args, DomainError) ([]Next, error)
type EventHandler func(context.Context, Args, *int) (<-chan any, error)
type Guard func(context.Context, Args) (GuardDecision, error)
type DiscoveryPolicy func(ref string, caller *VerifiedCaller) bool

type Handler struct {
	Run      InvokeHandler
	OnDenied DenialHandler
	Observe  EventHandler
}
type GuardDecision struct {
	Allowed bool
	Error   *DomainError
}
type Config struct {
	Handlers     map[string]Handler
	Guards       map[string]Guard
	Public       []string
	Discoverable DiscoveryPolicy
}

type App struct {
	manifest     Manifest
	handlers     map[string]Handler
	guards       map[string]Guard
	public       map[string]bool
	discoverable DiscoveryPolicy
}

type CatalogEntry struct {
	Ref         string `json:"ref"`
	Kind        string `json:"kind"`
	Description string `json:"description"`
}
type Catalog struct {
	ANWA         string         `json:"anwa"`
	EntryPoints  []string       `json:"entrypoints"`
	Interactions []CatalogEntry `json:"interactions"`
}
type Description struct {
	Ref string `json:"ref"`
	Interaction
}
type Discovery struct {
	Description Description     `json:"description"`
	Context     ResponseContext `json:"context"`
}

func New(manifest Manifest, config Config) (*App, error) {
	if err := manifest.Validate(); err != nil {
		return nil, err
	}
	app := &App{
		manifest: manifest, handlers: config.Handlers, guards: config.Guards,
		public: make(map[string]bool), discoverable: config.Discoverable,
	}
	for _, ref := range config.Public {
		spec, ok := manifest.Interactions[ref]
		if !ok || spec.Guard != "" {
			return nil, fmt.Errorf("unknown or guarded public Interaction %q", ref)
		}
		app.public[ref] = true
	}
	for ref, spec := range manifest.Interactions {
		h, ok := config.Handlers[ref]
		if !ok {
			return nil, fmt.Errorf("%s: missing Handler", ref)
		}
		if spec.Kind == "event" {
			if h.Observe == nil || h.Run != nil || h.OnDenied != nil {
				return nil, fmt.Errorf("%s: Event requires Observe only", ref)
			}
		} else if h.Run == nil || h.Observe != nil {
			return nil, fmt.Errorf("%s: Query/Action requires Run", ref)
		}
		if spec.Guard != "" {
			if config.Guards[spec.Guard] == nil {
				return nil, fmt.Errorf("%s: missing named Guard %q", ref, spec.Guard)
			}
			if spec.Kind != "event" && h.OnDenied == nil {
				return nil, fmt.Errorf("%s: guarded Query/Action requires OnDenied", ref)
			}
		} else if !app.public[ref] {
			return nil, fmt.Errorf("%s: requires a named Guard or explicit public declaration", ref)
		} else if h.OnDenied != nil {
			return nil, fmt.Errorf("%s: unguarded Handler cannot have OnDenied", ref)
		}
	}
	for ref := range config.Handlers {
		if _, ok := manifest.Interactions[ref]; !ok {
			return nil, fmt.Errorf("undeclared Handler %q", ref)
		}
	}
	return app, nil
}

func trustedCaller(request *RequestContext) (*VerifiedCaller, error) {
	if request == nil || request.Caller == nil {
		return nil, nil
	}
	if strings.TrimSpace(request.Caller.Subject) == "" {
		return nil, errors.New("invalid verified Caller subject")
	}
	caller := *request.Caller
	if caller.Claims != nil {
		caller.Claims = make(map[string]any, len(request.Caller.Claims))
		for k, v := range request.Caller.Claims {
			caller.Claims[k] = v
		}
	}
	return &caller, nil
}

func (a *App) canDiscover(ref string, caller *VerifiedCaller) (allowed bool) {
	if a.public[ref] {
		return true
	}
	if a.manifest.Interactions[ref].Guard == "" || a.discoverable == nil {
		return false
	}
	defer func() {
		if recover() != nil {
			allowed = false
		}
	}()
	return a.discoverable(ref, caller)
}

func (a *App) Catalog(request *RequestContext) (Catalog, error) {
	caller, err := trustedCaller(request)
	if err != nil {
		return Catalog{}, err
	}
	catalog := Catalog{ANWA: a.manifest.ANWA, EntryPoints: []string{}, Interactions: []CatalogEntry{}}
	for _, ref := range a.manifest.EntryPoints {
		if a.canDiscover(ref, caller) {
			catalog.EntryPoints = append(catalog.EntryPoints, ref)
		}
	}
	for _, ref := range sortedKeys(a.manifest.Interactions) {
		if a.canDiscover(ref, caller) {
			spec := a.manifest.Interactions[ref]
			catalog.Interactions = append(catalog.Interactions, CatalogEntry{
				Ref: ref, Kind: spec.Kind, Description: spec.Description,
			})
		}
	}
	return catalog, nil
}

func (a *App) Discover(ref string, request *RequestContext) (Discovery, error) {
	caller, err := trustedCaller(request)
	if err != nil {
		return Discovery{}, err
	}
	if _, ok := a.manifest.Interactions[ref]; !ok || !a.canDiscover(ref, caller) {
		return Discovery{}, errors.New("unknown or undiscoverable Interaction")
	}
	return Discovery{Description: Description{Ref: ref, Interaction: a.manifest.Interactions[ref]},
		Context: ResponseContext{Next: []Next{}}}, nil
}

func normalizeJSON(value any) (any, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var normalized any
	if err := dec.Decode(&normalized); err != nil {
		return nil, err
	}
	return normalized, nil
}

func (a *App) check(schema *Schema, value any, path string) error {
	if schema == nil {
		return nil
	}
	if schema.Ref != "" {
		return a.check(a.manifest.Definitions[schema.Ref[8:]], value, path)
	}
	if schema.Enum != nil {
		matched := false
		for _, candidate := range schema.Enum {
			if reflect.DeepEqual(candidate, value) {
				matched = true
				break
			}
		}
		if !matched {
			return fmt.Errorf("%s not in enum", path)
		}
	}
	switch schema.Type {
	case "object":
		obj, ok := value.(map[string]any)
		if !ok {
			return fmt.Errorf("%s must be object", path)
		}
		for _, required := range schema.Required {
			if _, found := obj[required]; !found {
				return fmt.Errorf("%s.%s required", path, required)
			}
		}
		for key, child := range obj {
			field, has := schema.Properties[key]
			if !has {
				if schema.AdditionalProperties != nil && !*schema.AdditionalProperties {
					return fmt.Errorf("%s.%s not allowed", path, key)
				}
			} else if err := a.check(field, child, path+"."+key); err != nil {
				return err
			}
		}
	case "array":
		arr, ok := value.([]any)
		if !ok {
			return fmt.Errorf("%s must be array", path)
		}
		for index, element := range arr {
			if err := a.check(schema.Items, element, fmt.Sprintf("%s[%d]", path, index)); err != nil {
				return err
			}
		}
	case "string":
		if _, ok := value.(string); !ok {
			return fmt.Errorf("%s must be string", path)
		}
	case "boolean":
		if _, ok := value.(bool); !ok {
			return fmt.Errorf("%s must be boolean", path)
		}
	case "integer", "number":
		number, ok := value.(json.Number)
		if !ok {
			return fmt.Errorf("%s must be %s", path, schema.Type)
		}
		f, err := number.Float64()
		if err != nil || math.IsInf(f, 0) || math.IsNaN(f) ||
			(schema.Type == "integer" && math.Trunc(f) != f) {
			return fmt.Errorf("%s must be %s", path, schema.Type)
		}
	case "null":
		if value != nil {
			return fmt.Errorf("%s must be null", path)
		}
	}
	return nil
}

func (a *App) declaredError(spec Interaction, err *DomainError) bool {
	if err == nil || err.Code == "INVALID_INPUT" || err.Code == "UNEXPECTED_ERROR" {
		return false
	}
	if _, ok := spec.Errors[err.Code]; !ok {
		return false
	}
	return validEffects(err.Effects)
}

func validEffects(value string) bool {
	return value == "" || value == "none" || value == "occurred" || value == "unknown"
}

var durationPattern = regexp.MustCompile(`^P(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$`)

func (a *App) validNext(source string, next []Next) bool {
	for _, choice := range next {
		spec, ok := a.manifest.Interactions[choice.Ref]
		if !ok {
			return false
		}
		if choice.Input != nil {
			if spec.Input == nil {
				return false
			}
			v, err := normalizeJSON(choice.Input)
			if err != nil || a.check(spec.Input, v, "$") != nil {
				return false
			}
		}
		if g := choice.Guidance; g != nil {
			if g.Kind != "" && g.Kind != "retry" ||
				g.Level != "" && g.Level != "required" && g.Level != "recommended" && g.Level != "available" ||
				g.Kind == "" && g.Level == "" || g.Kind == "retry" && choice.Ref != source {
				return false
			}
		}
		if choice.When != nil && (!durationPattern.MatchString(choice.When.After) || !strings.ContainsAny(choice.When.After, "0123456789")) {
			return false
		}
		if p := choice.Applicability; p != nil &&
			p.State != "available" && p.State != "blocked" && p.State != "unknown" {
			return false
		}
	}
	return true
}

func (a *App) checkResponse(ref string, spec Interaction, response Response, caller *VerifiedCaller) Response {
	switch response.Outcome.Kind {
	case "settled":
		result := response.Outcome.Result
		if result == nil || response.Outcome.Execution != nil {
			return unexpected()
		}
		if result.OK {
			if result.Error != nil {
				return unexpected()
			}
			if spec.Output != nil {
				value, err := normalizeJSON(result.Value)
				if err != nil || a.check(spec.Output, value, "$") != nil {
					return unexpected()
				}
			}
		} else if !a.declaredError(spec, result.Error) {
			return unexpected()
		}
	case "accepted":
		if spec.Kind != "action" || response.Outcome.Result != nil ||
			response.Outcome.Execution == nil || response.Outcome.Execution.ID == "" {
			return unexpected()
		}
	default:
		return unexpected()
	}
	if !a.validNext(ref, response.Context.Next) {
		return unexpected()
	}
	filtered := make([]Next, 0, len(response.Context.Next))
	for _, candidate := range response.Context.Next {
		if a.canDiscover(candidate.Ref, caller) {
			filtered = append(filtered, candidate)
		}
	}
	response.Context.Next = filtered
	return response
}

// Interact validates untrusted input, runs the declared Guard before Run, and
// returns an opaque UNEXPECTED_ERROR on contract violations or Handler errors.
func (a *App) Interact(ctx context.Context, ref string, input any, request *RequestContext) (response Response, err error) {
	caller, err := trustedCaller(request)
	if err != nil {
		return Response{}, err
	}
	spec, ok := a.manifest.Interactions[ref]
	if !ok {
		return Response{}, errors.New("unknown InteractionRef")
	}
	if spec.Kind == "event" {
		return Response{}, errors.New("use Observe for Event Interactions")
	}
	if spec.Input == nil && input != nil {
		return Reply(Fail("INVALID_INPUT")), nil
	}
	var normalized any
	if input != nil {
		normalized, err = normalizeJSON(input)
		if err != nil {
			return Reply(Fail("INVALID_INPUT")), nil
		}
	}
	if spec.Input != nil {
		if issue := a.check(spec.Input, normalized, "$"); issue != nil {
			failure := Fail("INVALID_INPUT")
			failure.Error.Message = issue.Error()
			return Reply(failure), nil
		}
	}
	defer func() {
		if recover() != nil {
			response, err = unexpected(), nil
		}
	}()
	args := Args{Ref: ref, Input: normalized, App: a, Caller: caller}
	binding := a.handlers[ref]
	if spec.Guard != "" {
		decision, e := a.guards[spec.Guard](ctx, args)
		if e != nil {
			return unexpected(), nil
		}
		if !decision.Allowed {
			if !a.declaredError(spec, decision.Error) {
				return unexpected(), nil
			}
			next, e := binding.OnDenied(ctx, args, *decision.Error)
			if e != nil {
				return unexpected(), nil
			}
			return a.checkResponse(ref, spec, Reply(Result{Error: decision.Error}, next...), caller), nil
		}
	}
	response, err = binding.Run(ctx, args)
	if err != nil {
		return unexpected(), nil
	}
	return a.checkResponse(ref, spec, response, caller), nil
}

func (a *App) Follow(ctx context.Context, choice Next, request *RequestContext) (Response, error) {
	return a.Interact(ctx, choice.Ref, choice.Input, request)
}

// ObservationDenied is a pre-subscription refusal, not an Interaction Result.
type ObservationDenied struct{ Code string }

func (e ObservationDenied) Error() string { return "Event subscription denied: " + e.Code }

// Observe checks the Guard before starting the application event stream.
// Caller cancellation must be respected by each application Event Handler.
func (a *App) Observe(ctx context.Context, ref string, input any, cursor *int, request *RequestContext) (stream <-chan any, err error) {
	caller, err := trustedCaller(request)
	if err != nil {
		return nil, err
	}
	spec, ok := a.manifest.Interactions[ref]
	if !ok {
		return nil, errors.New("unknown InteractionRef")
	}
	if spec.Kind != "event" {
		return nil, errors.New("only Event Interactions can be observed")
	}
	if spec.Input == nil && input != nil {
		return nil, errors.New("invalid Event input")
	}
	var normalized any
	if input != nil {
		normalized, err = normalizeJSON(input)
		if err != nil {
			return nil, errors.New("invalid Event input")
		}
	}
	if spec.Input != nil {
		if err := a.check(spec.Input, normalized, "$"); err != nil {
			return nil, errors.New("invalid Event input")
		}
	}
	defer func() {
		if recover() != nil {
			stream, err = nil, ObservationDenied{Code: "UNEXPECTED_ERROR"}
		}
	}()
	args := Args{Ref: ref, Input: normalized, App: a, Caller: caller}
	if spec.Guard != "" {
		decision, e := a.guards[spec.Guard](ctx, args)
		if e != nil {
			return nil, ObservationDenied{Code: "UNEXPECTED_ERROR"}
		}
		if !decision.Allowed {
			if !a.declaredError(spec, decision.Error) {
				return nil, ObservationDenied{Code: "UNEXPECTED_ERROR"}
			}
			return nil, ObservationDenied{Code: decision.Error.Code}
		}
	}
	stream, err = a.handlers[ref].Observe(ctx, args, cursor)
	if err != nil {
		return nil, err
	}
	if stream == nil {
		return nil, errors.New("Event Handler returned nil stream")
	}
	return stream, nil
}
