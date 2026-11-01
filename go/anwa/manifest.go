// Package anwa is an experimental, transport-neutral Go adapter for ANWA v0.2.
// It implements the documented subset, not a production-ready network service.
package anwa

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strings"
)

// Manifest describes standalone application Interactions. $defs are data schemas,
// not Thing instances or independently invocable Interactions.
type Manifest struct {
	ANWA         string                 `json:"anwa"`
	EntryPoints  []string               `json:"entrypoints"`
	Definitions  map[string]*Schema     `json:"$defs,omitempty"`
	Interactions map[string]Interaction `json:"interactions"`
}

type Interaction struct {
	Kind           string            `json:"kind"`
	Description    string            `json:"description"`
	Input          *Schema           `json:"input,omitempty"`
	Output         *Schema           `json:"output,omitempty"`
	Errors         map[string]string `json:"errors,omitempty"`
	SemanticTypes  []string          `json:"semanticTypes,omitempty"`
	Guard          string            `json:"guard,omitempty"`
	HasSideEffects *bool             `json:"hasSideEffects,omitempty"`
	Idempotent     *bool             `json:"idempotent,omitempty"`
}

// Schema implements the intentionally limited v0.2 JSON Schema subset.
// A local $ref must be the only populated schema keyword.
type Schema struct {
	Ref                  string             `json:"$ref,omitempty"`
	Type                 string             `json:"type,omitempty"`
	Description          string             `json:"description,omitempty"`
	Enum                 []any              `json:"enum,omitempty"`
	Properties           map[string]*Schema `json:"properties,omitempty"`
	Required             []string           `json:"required,omitempty"`
	Items                *Schema            `json:"items,omitempty"`
	AdditionalProperties *bool              `json:"additionalProperties,omitempty"`
}

var (
	refPattern         = regexp.MustCompile(`^#/\$defs/([A-Za-z_$][A-Za-z0-9_$]*)$`)
	definitionPattern  = regexp.MustCompile(`^[A-Za-z_$][A-Za-z0-9_$]*$`)
	interactionPattern = regexp.MustCompile(`^[A-Za-z_$][A-Za-z0-9_$]*(?:[.-][A-Za-z_$][A-Za-z0-9_$]*)*$`)
	errorPattern       = regexp.MustCompile(`^[A-Z][A-Z0-9_]*$`)
	semanticPattern    = regexp.MustCompile(`^(https?://|urn:)[^\s]+$`)
)

var supportedTypes = map[string]bool{
	"object": true, "array": true, "string": true, "number": true,
	"integer": true, "boolean": true, "null": true,
}

// ParseManifest decodes a JSON manifest without silently accepting unsupported
// keywords. Numeric literals are preserved as json.Number for integer checks.
func ParseManifest(data []byte) (Manifest, error) {
	var manifest Manifest
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	dec.DisallowUnknownFields()
	if err := dec.Decode(&manifest); err != nil {
		return Manifest{}, fmt.Errorf("decode ANWA manifest: %w", err)
	}
	var tail any
	if err := dec.Decode(&tail); !errors.Is(err, io.EOF) {
		if err == nil {
			return Manifest{}, errors.New("manifest contains trailing JSON")
		}
		return Manifest{}, fmt.Errorf("trailing data: %w", err)
	}
	if err := manifest.Validate(); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

// Validate verifies manifest references and the supported schema subset.
// It does not claim conformance with full JSON Schema Draft 2020-12.
func (m Manifest) Validate() error {
	if m.ANWA != "0.2" {
		return errors.New("anwa must be 0.2")
	}
	if len(m.Interactions) == 0 {
		return errors.New("interactions must not be empty")
	}
	if len(m.EntryPoints) == 0 {
		return errors.New("entrypoints must not be empty")
	}
	seenEntrypoints := make(map[string]bool)
	for _, ref := range m.EntryPoints {
		if _, ok := m.Interactions[ref]; !ok {
			return fmt.Errorf("entrypoint %q is not a declared Interaction", ref)
		}
		if seenEntrypoints[ref] {
			return fmt.Errorf("duplicate entrypoint %q", ref)
		}
		seenEntrypoints[ref] = true
	}
	for _, name := range sortedKeys(m.Definitions) {
		if !definitionPattern.MatchString(name) {
			return fmt.Errorf("invalid $defs name %q", name)
		}
		if err := m.validateSchema(m.Definitions[name], "$defs."+name); err != nil {
			return err
		}
	}
	visiting, visited := make(map[string]bool), make(map[string]bool)
	var visit func(string) error
	visit = func(name string) error {
		if visiting[name] {
			return fmt.Errorf("cyclic $ref at $defs.%s", name)
		}
		if visited[name] {
			return nil
		}
		visiting[name] = true
		for _, dep := range referencedDefinitions(m.Definitions[name]) {
			if err := visit(dep); err != nil {
				return err
			}
		}
		visiting[name] = false
		visited[name] = true
		return nil
	}
	for _, name := range sortedKeys(m.Definitions) {
		if err := visit(name); err != nil {
			return err
		}
	}
	for _, ref := range sortedKeys(m.Interactions) {
		spec := m.Interactions[ref]
		if !interactionPattern.MatchString(ref) {
			return fmt.Errorf("invalid InteractionRef %q", ref)
		}
		if spec.Kind != "query" && spec.Kind != "action" && spec.Kind != "event" {
			return fmt.Errorf("%s: unknown kind %q", ref, spec.Kind)
		}
		if strings.TrimSpace(spec.Description) == "" {
			return fmt.Errorf("%s: description is required", ref)
		}
		if spec.Kind != "action" && (spec.HasSideEffects != nil || spec.Idempotent != nil) {
			return fmt.Errorf("%s: side-effect hints are action-only", ref)
		}
		if len(spec.SemanticTypes) > 0 {
			seen := make(map[string]bool)
			for _, v := range spec.SemanticTypes {
				if !semanticPattern.MatchString(v) || seen[v] {
					return fmt.Errorf("%s: invalid/duplicate semanticTypes entry", ref)
				}
				seen[v] = true
			}
		}
		if err := m.validateSchema(spec.Input, ref+".input"); err != nil {
			return err
		}
		if err := m.validateSchema(spec.Output, ref+".output"); err != nil {
			return err
		}
		for code, meaning := range spec.Errors {
			if !errorPattern.MatchString(code) || code == "INVALID_INPUT" || code == "UNEXPECTED_ERROR" || strings.TrimSpace(meaning) == "" {
				return fmt.Errorf("%s: invalid domain error %q", ref, code)
			}
		}
	}
	return nil
}

func (m Manifest) validateSchema(s *Schema, path string) error {
	if s == nil {
		return nil
	}
	if s.Ref != "" {
		parts := refPattern.FindStringSubmatch(s.Ref)
		if parts == nil || m.Definitions[parts[1]] == nil {
			return fmt.Errorf("%s: unknown or unsupported local $ref %q", path, s.Ref)
		}
		if s.Type != "" || s.Description != "" || s.Enum != nil || s.Properties != nil ||
			s.Required != nil || s.Items != nil || s.AdditionalProperties != nil {
			return fmt.Errorf("%s: $ref must be the only schema keyword", path)
		}
		return nil
	}
	if !supportedTypes[s.Type] {
		return fmt.Errorf("%s: unsupported schema type %q", path, s.Type)
	}
	if s.Description != "" && strings.TrimSpace(s.Description) == "" {
		return fmt.Errorf("%s: empty description", path)
	}
	if s.Enum != nil && len(s.Enum) == 0 {
		return fmt.Errorf("%s: enum must not be empty", path)
	}
	if s.Type == "object" {
		if s.AdditionalProperties != nil && *s.AdditionalProperties {
			return fmt.Errorf("%s: only additionalProperties=false is supported", path)
		}
		required := make(map[string]bool)
		for _, name := range s.Required {
			if s.Properties[name] == nil || required[name] {
				return fmt.Errorf("%s: unknown or duplicate required property %q", path, name)
			}
			required[name] = true
		}
		for _, name := range sortedKeys(s.Properties) {
			if err := m.validateSchema(s.Properties[name], path+".properties."+name); err != nil {
				return err
			}
		}
	} else if s.Properties != nil || s.Required != nil || s.AdditionalProperties != nil {
		return fmt.Errorf("%s: object-only keywords on %s", path, s.Type)
	}
	if s.Type == "array" {
		if s.Items == nil {
			return fmt.Errorf("%s: array items are required", path)
		}
		return m.validateSchema(s.Items, path+".items")
	}
	if s.Items != nil {
		return fmt.Errorf("%s: items are array-only", path)
	}
	return nil
}

func referencedDefinitions(s *Schema) []string {
	if s == nil {
		return nil
	}
	if s.Ref != "" {
		return []string{refPattern.FindStringSubmatch(s.Ref)[1]}
	}
	var names []string
	for _, sub := range s.Properties {
		names = append(names, referencedDefinitions(sub)...)
	}
	names = append(names, referencedDefinitions(s.Items)...)
	return names
}

func sortedKeys[V any](items map[string]V) []string {
	keys := make([]string, 0, len(items))
	for key := range items {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
