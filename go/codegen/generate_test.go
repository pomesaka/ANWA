package codegen

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

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

func TestGenerateTypedInterfaceForCalculator(t *testing.T) {
	content, err := Generate(loadDemo(t, "calculator"), "main")
	if err != nil {
		t.Fatal(err)
	}
	for _, needle := range []string{
		"type ServerInterface interface",
		"CalculatorAdd(ctx context.Context, request CalculatorAddRequest) (CalculatorAddResponse, error)",
		"type CalculatorAddInput struct",
		"type CalculatorDivideErrorCode string",
		"func Handlers(server ServerInterface) map[string]anwa.Handler",
	} {
		if !strings.Contains(string(content), needle) {
			t.Errorf("missing %q", needle)
		}
	}
	again, err := Generate(loadDemo(t, "calculator"), "main")
	if err != nil || string(content) != string(again) {
		t.Fatal("generated code must be deterministic")
	}
}

func TestAllExistingManifestsCanGenerateStrictGo(t *testing.T) {
	for _, name := range []string{"calculator", "orders", "reports", "todo"} {
		t.Run(name, func(t *testing.T) {
			source, err := Generate(loadDemo(t, name), "generated")
			if err != nil {
				t.Fatal(err)
			}
			if len(source) == 0 {
				t.Fatal("empty source")
			}
			if name == "todo" {
				s := string(source)
				if !strings.Contains(s, "type Task struct") ||
					!strings.Contains(s, "TaskCreate(ctx context.Context") ||
					!strings.Contains(s, "type TaskGetOutput") {
					t.Fatal("Todo's reusable data and handlers must be generated")
				}
			}
		})
	}
}

func TestRejectGoNameCollisions(t *testing.T) {
	manifest := anwa.Manifest{
		ANWA:        "0.2",
		EntryPoints: []string{"a-b"},
		Interactions: map[string]anwa.Interaction{
			"a-b": {Kind: "query", Description: "First"},
			"a.b": {Kind: "query", Description: "Second"},
		},
	}
	_, err := Generate(manifest, "generated")
	if err == nil || !strings.Contains(err.Error(), "collides") {
		t.Fatalf("expected identifier collision, got %v", err)
	}
}
