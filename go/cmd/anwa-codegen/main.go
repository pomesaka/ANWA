// Command anwa-codegen emits strict Go ServerInterface bindings from anwa.json.
package main

import (
	"bytes"
	"flag"
	"fmt"
	"os"

	"github.com/pomesaka/ANWA/go/anwa"
	"github.com/pomesaka/ANWA/go/codegen"
)

func main() {
	input := flag.String("in", "", "input ANWA v0.2 anwa.json path")
	output := flag.String("out", "", "output Go file path")
	pkg := flag.String("package", "main", "generated Go package name")
	check := flag.Bool("check", false, "fail if output differs from checked-in generated file")
	flag.Parse()
	if *input == "" || *output == "" {
		fmt.Fprintln(os.Stderr, "usage: anwa-codegen -in <anwa.json> -out <contract.gen.go> [-package main] [-check]")
		os.Exit(2)
	}
	data, err := os.ReadFile(*input)
	if err != nil {
		fatal(err)
	}
	manifest, err := anwa.ParseManifest(data)
	if err != nil {
		fatal(err)
	}
	generated, err := codegen.Generate(manifest, *pkg)
	if err != nil {
		fatal(err)
	}
	if *check {
		existing, err := os.ReadFile(*output)
		if err != nil {
			fatal(err)
		}
		if !bytes.Equal(existing, generated) {
			fatal(fmt.Errorf("%s differs from generated output; rerun anwa-codegen", *output))
		}
		fmt.Println("UP TO DATE", *output)
		return
	}
	if err := os.WriteFile(*output, generated, 0644); err != nil {
		fatal(err)
	}
	fmt.Println("GENERATED", *output)
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "anwa-codegen:", err)
	os.Exit(1)
}
