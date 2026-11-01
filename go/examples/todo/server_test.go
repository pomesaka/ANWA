package main

import (
	"context"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/pomesaka/ANWA/go/anwa"
)

func testApp(t *testing.T) *anwa.App {
	t.Helper()
	data, err := os.ReadFile("anwa.json")
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := anwa.ParseManifest(data)
	if err != nil {
		t.Fatal(err)
	}
	app, _, err := newTodoApp(manifest)
	if err != nil {
		t.Fatal(err)
	}
	return app
}

func user(subject string) *anwa.RequestContext {
	return &anwa.RequestContext{Caller: &anwa.VerifiedCaller{Subject: subject}}
}

func invoke(t *testing.T, app *anwa.App, ref string, input any, caller *anwa.RequestContext) anwa.Response {
	t.Helper()
	response, err := app.Interact(context.Background(), ref, input, caller)
	if err != nil {
		t.Fatal(err)
	}
	return response
}

func successful[T any](t *testing.T, response anwa.Response) T {
	t.Helper()
	if response.Outcome.Kind != "settled" || response.Outcome.Result == nil || !response.Outcome.Result.OK {
		t.Fatalf("expected settled success; got %+v", response)
	}
	value, ok := response.Outcome.Result.Value.(T)
	if !ok {
		t.Fatalf("expected %T, got %T", *new(T), response.Outcome.Result.Value)
	}
	return value
}

func failed(t *testing.T, response anwa.Response, code string) {
	t.Helper()
	if response.Outcome.Kind != "settled" || response.Outcome.Result == nil ||
		response.Outcome.Result.OK || response.Outcome.Result.Error == nil ||
		response.Outcome.Result.Error.Code != code {
		t.Fatalf("expected error %s, got %+v", code, response)
	}
}

func TestTodoLifecycleAndContextNavigation(t *testing.T) {
	app := testApp(t)
	alice := user("alice")
	ctx := context.Background()
	created := invoke(t, app, "task.create", map[string]any{"title": "  draft spec  "}, alice)
	item := successful[TaskCreateOutput](t, created).Task
	if item.Id != "task-1" || item.Title != "draft spec" || item.Completed || item.Version != 1 {
		t.Fatalf("bad task: %+v", item)
	}
	if len(created.Context.Next) != 1 || created.Context.Next[0].Ref != "task.get" {
		t.Fatalf("create should offer task.get: %+v", created.Context)
	}
	followed, err := app.Follow(ctx, created.Context.Next[0], alice)
	if err != nil {
		t.Fatal(err)
	}
	if got := successful[TaskGetOutput](t, followed).Task; got != item {
		t.Fatalf("follow returned wrong task: %+v", got)
	}
	if len(followed.Context.Next) != 4 {
		t.Fatalf("get should offer get, rename, complete and delete: %+v", followed.Context.Next)
	}
	renamed := invoke(t, app, "task.rename", map[string]any{
		"taskId": item.Id, "expectedVersion": item.Version, "title": "write spec",
	}, alice)
	item = successful[TaskRenameOutput](t, renamed).Task
	if item.Title != "write spec" || item.Version != 2 {
		t.Fatalf("rename failed: %+v", item)
	}

	stale := invoke(t, app, "task.complete", map[string]any{
		"taskId": item.Id, "expectedVersion": 1,
	}, alice)
	failed(t, stale, "VERSION_CONFLICT")
	if len(stale.Context.Next) != 1 || stale.Context.Next[0].Ref != "task.get" {
		t.Fatalf("conflict should offer fresh task: %+v", stale.Context)
	}
	refreshed, err := app.Follow(ctx, stale.Context.Next[0], alice)
	if err != nil {
		t.Fatal(err)
	}
	if got := successful[TaskGetOutput](t, refreshed).Task; got.Version != 2 || got.Completed {
		t.Fatalf("conflict changed task: %+v", got)
	}

	completed := invoke(t, app, "task.complete", map[string]any{
		"taskId": item.Id, "expectedVersion": item.Version,
	}, alice)
	item = successful[TaskCompleteOutput](t, completed).Task
	if !item.Completed || item.Version != 3 {
		t.Fatalf("completion failed: %+v", item)
	}
	failed(t, invoke(t, app, "task.complete", map[string]any{
		"taskId": item.Id, "expectedVersion": item.Version,
	}, alice), "ALREADY_COMPLETED")
	list := successful[TaskListOutput](t, invoke(t, app, "task.list", nil, alice))
	if len(list.Items) != 1 || list.Items[0] != item {
		t.Fatalf("list mismatch: %+v", list)
	}

	failed(t, invoke(t, app, "task.delete", map[string]any{
		"taskId": item.Id, "expectedVersion": 1,
	}, alice), "VERSION_CONFLICT")
	deleted := invoke(t, app, "task.delete", map[string]any{
		"taskId": item.Id, "expectedVersion": item.Version,
	}, alice)
	if successful[TaskDeleteOutput](t, deleted).DeletedId != item.Id {
		t.Fatalf("unexpected delete output: %+v", deleted)
	}
	if len(deleted.Context.Next) != 1 || deleted.Context.Next[0].Ref != "task.list" {
		t.Fatalf("delete should offer list: %+v", deleted.Context)
	}
	failed(t, invoke(t, app, "task.get", map[string]any{"taskId": item.Id}, alice), "TASK_NOT_FOUND")
	if after := successful[TaskListOutput](t, invoke(t, app, "task.list", nil, alice)); len(after.Items) != 0 {
		t.Fatalf("task remained after deletion: %+v", after.Items)
	}
}

func TestTodoAuthIsolationAndInputBoundary(t *testing.T) {
	app := testApp(t)
	alice, bob := user("alice"), user("bob")
	anonymous, err := app.Catalog(nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(anonymous.Interactions) != 0 || len(anonymous.EntryPoints) != 0 {
		t.Fatalf("discovery leaked to anonymous caller: %+v", anonymous)
	}
	if _, err := app.Discover("task.get", nil); err == nil {
		t.Fatal("anonymous caller discovered protected interaction")
	}
	known, err := app.Catalog(alice)
	if err != nil || len(known.Interactions) != 6 {
		t.Fatalf("authenticated discovery: %+v, %v", known, err)
	}

	failed(t, invoke(t, app, "task.create", map[string]any{"title": "secret"}, nil), "AUTH_REQUIRED")
	failed(t, invoke(t, app, "task.create", map[string]any{"title": 9}, alice), "INVALID_INPUT")
	failed(t, invoke(t, app, "task.create", map[string]any{"title": "ok", "caller": "alice"}, nil), "INVALID_INPUT")
	failed(t, invoke(t, app, "task.create", map[string]any{"title": "  "}, alice), "INVALID_TITLE")
	failed(t, invoke(t, app, "task.create", map[string]any{"title": strings.Repeat("x", 121)}, alice), "INVALID_TITLE")

	created := invoke(t, app, "task.create", map[string]any{"title": "private"}, alice)
	item := successful[TaskCreateOutput](t, created).Task
	if result := successful[TaskListOutput](t, invoke(t, app, "task.list", nil, bob)); len(result.Items) != 0 {
		t.Fatalf("bob saw private tasks: %+v", result.Items)
	}
	failed(t, invoke(t, app, "task.get", map[string]any{"taskId": item.Id}, bob), "TASK_NOT_FOUND")
	failed(t, invoke(t, app, "task.rename", map[string]any{
		"taskId": item.Id, "expectedVersion": 1, "title": "stolen",
	}, bob), "TASK_NOT_FOUND")
	failed(t, invoke(t, app, "task.complete", map[string]any{
		"taskId": item.Id, "expectedVersion": 1,
	}, bob), "TASK_NOT_FOUND")
	failed(t, invoke(t, app, "task.delete", map[string]any{
		"taskId": item.Id, "expectedVersion": 1,
	}, bob), "TASK_NOT_FOUND")
	failed(t, invoke(t, app, "task.rename", map[string]any{
		"taskId": item.Id, "expectedVersion": "1", "title": "bad",
	}, alice), "INVALID_INPUT")
	if got := successful[TaskGetOutput](t, invoke(t, app, "task.get", map[string]any{"taskId": item.Id}, alice)).Task; got != item {
		t.Fatalf("denied attempts mutated task: %+v", got)
	}

	// Follow-up candidates are not authorization capabilities.
	followed, err := app.Follow(context.Background(), created.Context.Next[0], bob)
	if err != nil {
		t.Fatal(err)
	}
	failed(t, followed, "TASK_NOT_FOUND")
	noCaller, err := app.Follow(context.Background(), created.Context.Next[0], nil)
	if err != nil {
		t.Fatal(err)
	}
	failed(t, noCaller, "AUTH_REQUIRED")
	if len(noCaller.Context.Next) != 0 {
		t.Fatalf("private next leaked: %+v", noCaller.Context)
	}
}

func TestTodoOptimisticConcurrencyAndOrderedListing(t *testing.T) {
	app := testApp(t)
	alice := user("alice")
	var ids []string
	for i := 0; i < 12; i++ {
		output := successful[TaskCreateOutput](t, invoke(t, app, "task.create",
			map[string]any{"title": "work"}, alice))
		ids = append(ids, output.Task.Id)
	}
	list := successful[TaskListOutput](t, invoke(t, app, "task.list", nil, alice))
	for i, item := range list.Items {
		if item.Id != ids[i] {
			t.Fatalf("list not in insertion order at %d: %+v", i, list.Items)
		}
	}
	const calls = 24
	var success, conflict atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < calls; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			reply, err := app.Interact(context.Background(), "task.rename", map[string]any{
				"taskId": ids[0], "expectedVersion": 1, "title": "concurrent",
			}, alice)
			if err != nil {
				t.Errorf("interact: %v", err)
				return
			}
			if reply.Outcome.Result == nil {
				t.Errorf("no settled result: %+v", reply)
				return
			}
			if reply.Outcome.Result.OK {
				success.Add(1)
			} else if reply.Outcome.Result.Error.Code == "VERSION_CONFLICT" {
				conflict.Add(1)
			} else {
				t.Errorf("unexpected response: %+v", reply)
			}
		}(i)
	}
	wg.Wait()
	if success.Load() != 1 || conflict.Load() != calls-1 {
		t.Fatalf("non-atomic optimistic updates: success=%d conflict=%d", success.Load(), conflict.Load())
	}
	got := successful[TaskGetOutput](t, invoke(t, app, "task.get", map[string]any{"taskId": ids[0]}, alice)).Task
	if got.Version != 2 || got.Title != "concurrent" {
		t.Fatalf("unexpected concurrent winner: %+v", got)
	}
}
