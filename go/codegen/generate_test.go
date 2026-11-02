package codegen

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pomesaka/ANWA/go/anwa"
)

func loadDemo(t *testing.T, name string) anwa.Manifest {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "demo", name, "anwa.json"))
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := anwa.ParseManifest(data)
	if err != nil {
		t.Fatal(err)
	}
	return manifest
}

// Compile the generated public contract, not just substrings of its source.
// The temporary module has one local replacement and requires no network access.
func compile(t *testing.T, generated []byte, implementation string) ([]byte, error) {
	t.Helper()
	module, err := filepath.Abs("..")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	files := map[string][]byte{
		"go.mod":            []byte("module generatedfixture\n\ngo 1.23.0\nrequire github.com/pomesaka/ANWA/go v0.0.0\nreplace github.com/pomesaka/ANWA/go => " + filepath.ToSlash(module) + "\n"),
		"contract.go":       generated,
		"implementation.go": []byte("package generated\nvar _ ServerInterface\n" + implementation),
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(dir, name), content, 0600); err != nil {
			t.Fatal(err)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "go", "test", "./...")
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GOWORK=off", "GOPROXY=off", "GOTOOLCHAIN=local")
	return cmd.CombinedOutput()
}

func TestCodegen_PublicContractsCompileAndAreDeterministic(t *testing.T) {
	cases := []struct {
		name     string
		manifest anwa.Manifest
	}{
		{"calculator", loadDemo(t, "calculator")},
		{"orders with guarded handlers", loadDemo(t, "orders")},
		{"reports with event stream", loadDemo(t, "reports")},
		{"todo with shared definitions", loadDemo(t, "todo")},
		{"event-only contract", anwa.Manifest{ANWA: "0.2", EntryPoints: []string{"activity.events"}, Interactions: map[string]anwa.Interaction{
			"activity.events": {Kind: "event", Description: "Observe activity"},
		}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			first, err := Generate(tc.manifest, "generated")
			if err != nil {
				t.Fatal(err)
			}
			second, err := Generate(tc.manifest, "generated")
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(first, second) {
				t.Fatal("same manifest must produce identical source bytes")
			}
			if output, err := compile(t, first, ""); err != nil {
				t.Fatalf("generated public contract must compile: %v\n%s", err, output)
			}
		})
	}
}

func TestCodegen_CompilerRejectsInvalidImplementations(t *testing.T) {
	source, err := Generate(loadDemo(t, "calculator"), "generated")
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct{ name, implementation, want string }{
		{"missing Interaction methods", "type incomplete struct{}\nvar _ ServerInterface = incomplete{}", "does not implement ServerInterface"},
		{"wrong request field type", "var _ = CalculatorAddInput{A: \"not a number\", B: 2}", "cannot use"},
		{"wrong response family", "var _ CalculatorAddResponse = CalculatorDivideOK{}", "does not implement CalculatorAddResponse"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			output, err := compile(t, source, tc.implementation)
			if err == nil || !strings.Contains(string(output), tc.want) {
				t.Fatalf("expected %s compile failure, got %v\n%s", tc.want, err, output)
			}
		})
	}
}

func TestCodegen_RejectsAmbiguousGoNames(t *testing.T) {
	cases := []struct{ name, first, second string }{
		{"hyphen and dot normalize identically", "a-b", "a.b"},
		{"underscore and dot normalize identically", "a_b", "a.b"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			manifest := anwa.Manifest{ANWA: "0.2", EntryPoints: []string{tc.first}, Interactions: map[string]anwa.Interaction{
				tc.first: {Kind: "query", Description: "First"}, tc.second: {Kind: "query", Description: "Second"},
			}}
			_, err := Generate(manifest, "generated")
			if err == nil || !strings.Contains(err.Error(), "collides") {
				t.Fatalf("ambiguous identifier must be rejected, got %v", err)
			}
		})
	}
}
