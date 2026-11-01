// Run from the go/ directory: go run ./examples/calculator
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/pomesaka/ANWA/go/anwa"
)

func main() {
	data, err := os.ReadFile("../demo/calculator/anwa.json")
	if err != nil {
		log.Fatal(err)
	}
	manifest, err := anwa.ParseManifest(data)
	if err != nil {
		log.Fatal(err)
	}

	app, err := anwa.New(manifest, anwa.Config{
		Public: []string{"calculator.add", "calculator.divide"},
		Handlers: map[string]anwa.Handler{
			"calculator.add": {Run: func(_ context.Context, a anwa.Args) (anwa.Response, error) {
				var input struct{ A, B float64 }
				if err := a.DecodeInput(&input); err != nil {
					return anwa.Response{}, err
				}
				return anwa.Reply(anwa.OK(input.A + input.B)), nil
			}},
			"calculator.divide": {Run: func(_ context.Context, a anwa.Args) (anwa.Response, error) {
				var input struct{ A, B float64 }
				if err := a.DecodeInput(&input); err != nil {
					return anwa.Response{}, err
				}
				if input.B == 0 {
					return anwa.Reply(anwa.Fail("DIVIDE_BY_ZERO")), nil
				}
				return anwa.Reply(anwa.OK(input.A / input.B)), nil
			}},
		},
	})
	if err != nil {
		log.Fatal(err)
	}

	catalog, err := app.Catalog(nil)
	if err != nil {
		log.Fatal(err)
	}
	result, err := app.Interact(context.Background(), "calculator.divide", map[string]any{"a": 12, "b": 3}, nil)
	if err != nil {
		log.Fatal(err)
	}

	for _, item := range []any{catalog, result} {
		out, err := json.MarshalIndent(item, "", "  ")
		if err != nil {
			log.Fatal(err)
		}
		fmt.Println(string(out))
	}
}
