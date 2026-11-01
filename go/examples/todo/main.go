// Run from the go module: go run ./examples/todo
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
	data, err := os.ReadFile("examples/todo/anwa.json")
	if err != nil {
		log.Fatal(err)
	}
	manifest, err := anwa.ParseManifest(data)
	if err != nil {
		log.Fatal(err)
	}
	app, _, err := newTodoApp(manifest)
	if err != nil {
		log.Fatal(err)
	}
	ctx := context.Background()
	alice := &anwa.RequestContext{Caller: &anwa.VerifiedCaller{Subject: "alice"}}
	bob := &anwa.RequestContext{Caller: &anwa.VerifiedCaller{Subject: "bob"}}

	anonymous, err := app.Catalog(nil)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("anonymous discovery: %d interactions\n", len(anonymous.Interactions))

	created := requireSuccess(app.Interact(ctx, "task.create", map[string]any{"title": "Write ANWA proposal"}, alice))
	printResponse("create", created)
	task := created.Outcome.Result.Value.(TaskCreateOutput).Task

	// Follow the server-selected next candidate; it is checked again with
	// the current caller and input, not treated as an authorization token.
	fetched := requireSuccess(app.Follow(ctx, created.Context.Next[0], alice))
	printResponse("follow task.get", fetched)

	renamed := requireSuccess(app.Interact(ctx, "task.rename", map[string]any{
		"taskId": task.Id, "expectedVersion": task.Version, "title": "Write ANWA HTTP proposal",
	}, alice))
	printResponse("rename", renamed)
	updated := renamed.Outcome.Result.Value.(TaskRenameOutput).Task

	stale, err := app.Interact(ctx, "task.complete", map[string]any{
		"taskId": task.Id, "expectedVersion": task.Version,
	}, alice)
	if err != nil {
		log.Fatal(err)
	}
	printResponse("stale completion", stale)

	completed := requireSuccess(app.Interact(ctx, "task.complete", map[string]any{
		"taskId": updated.Id, "expectedVersion": updated.Version,
	}, alice))
	printResponse("complete", completed)

	visible := requireSuccess(app.Interact(ctx, "task.list", nil, alice))
	printResponse("alice tasks", visible)
	isolated := requireSuccess(app.Interact(ctx, "task.list", nil, bob))
	printResponse("bob tasks", isolated)
}

func requireSuccess(response anwa.Response, err error) anwa.Response {
	if err != nil {
		log.Fatal(err)
	}
	if response.Outcome.Kind != "settled" || response.Outcome.Result == nil || !response.Outcome.Result.OK {
		log.Fatalf("expected settled success, got %+v", response)
	}
	return response
}

func printResponse(name string, response anwa.Response) {
	raw, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("%s:\n%s\n", name, raw)
}
