// Run from go/: go run ./examples/calculator
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/pomesaka/ANWA/go/anwa"
	"github.com/pomesaka/ANWA/go/httpbinding"
)

// The generated interface requires both methods to exist with typed inputs
// and typed success/failure responses. No manual map[string]Handler here.
type CalculatorServer struct{}

var _ ServerInterface = (*CalculatorServer)(nil)

func (*CalculatorServer) CalculatorAdd(_ context.Context, request CalculatorAddRequest) (CalculatorAddResponse, error) {
	return CalculatorAddOK{Value: CalculatorAddOutput(request.Input.A + request.Input.B)}, nil
}

func (*CalculatorServer) CalculatorDivide(_ context.Context, request CalculatorDivideRequest) (CalculatorDivideResponse, error) {
	if request.Input.B == 0 {
		return CalculatorDivideFailure{Code: CalculatorDivideErrorDivideByZero}, nil
	}
	return CalculatorDivideOK{Value: CalculatorDivideOutput(request.Input.A / request.Input.B)}, nil
}

func main() {
	listen := flag.String("listen", "", "serve ANWA over HTTP at this address (example: 127.0.0.1:8080)")
	flag.Parse()
	data, err := os.ReadFile("../demo/calculator/anwa.json")
	if err != nil {
		log.Fatal(err)
	}
	manifest, err := anwa.ParseManifest(data)
	if err != nil {
		log.Fatal(err)
	}

	app, err := anwa.New(manifest, anwa.Config{
		Public:   []string{"calculator.add", "calculator.divide"},
		Handlers: Handlers(&CalculatorServer{}),
	})
	if err != nil {
		log.Fatal(err)
	}
	if *listen != "" {
		adapter, err := httpbinding.New(app, httpbinding.Options{})
		if err != nil {
			log.Fatal(err)
		}
		mux := http.NewServeMux()
		mux.Handle("/anwa/", adapter)
		log.Printf("ANWA HTTP calculator listening on %s", *listen)
		log.Fatal(http.ListenAndServe(*listen, mux))
		return
	}
	catalog, err := app.Catalog(nil)
	if err != nil {
		log.Fatal(err)
	}
	result, err := app.Interact(context.Background(), "calculator.divide",
		map[string]any{"a": 12, "b": 3}, nil)
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
