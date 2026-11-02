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

func TestTodo_InvalidCreateHasNoStateEffects(t *testing.T) {
	cases := []struct {
		name   string
		input  any
		caller *anwa.RequestContext
		code   string
	}{
		{"anonymous caller", map[string]any{"title": "private"}, nil, "AUTH_REQUIRED"},
		{"numeric title", map[string]any{"title": 9}, user("alice"), "INVALID_INPUT"},
		{"forged caller in input", map[string]any{"title": "work", "caller": "alice"}, nil, "INVALID_INPUT"},
		{"blank title", map[string]any{"title": " "}, user("alice"), "INVALID_TITLE"},
		{"title beyond 120 characters", map[string]any{"title": strings.Repeat("x", 121)}, user("alice"), "INVALID_TITLE"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := testApp(t)
			failed(t, invoke(t, app, "task.create", tc.input, tc.caller), tc.code)
			got := successful[TaskListOutput](t, invoke(t, app, "task.list", nil, user("alice")))
			if len(got.Items) != 0 {
				t.Fatalf("rejected create changed state: %+v", got)
			}
		})
	}
}

func TestTodo_OtherCallerCannotReadOrMutateOwnedTask(t *testing.T) {
	cases := []struct {
		name, ref string
		extra     map[string]any
	}{
		{"read", "task.get", map[string]any{}},
		{"rename", "task.rename", map[string]any{"expectedVersion": 1, "title": "stolen"}},
		{"complete", "task.complete", map[string]any{"expectedVersion": 1}},
		{"delete", "task.delete", map[string]any{"expectedVersion": 1}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := testApp(t)
			item := successful[TaskCreateOutput](t, invoke(t, app, "task.create", map[string]any{"title": "private"}, user("alice"))).Task
			input := map[string]any{"taskId": item.Id}
			for key, value := range tc.extra {
				input[key] = value
			}
			failed(t, invoke(t, app, tc.ref, input, user("bob")), "TASK_NOT_FOUND")
			got := successful[TaskGetOutput](t, invoke(t, app, "task.get", map[string]any{"taskId": item.Id}, user("alice"))).Task
			if got != item {
				t.Fatalf("denied operation mutated task: want %+v got %+v", item, got)
			}
			if items := successful[TaskListOutput](t, invoke(t, app, "task.list", nil, user("bob"))).Items; len(items) != 0 {
				t.Fatalf("other caller saw tasks: %+v", items)
			}
		})
	}
}

func TestTodo_FollowRechecksCaller(t *testing.T) {
	for _, tc := range []struct {
		name   string
		caller *anwa.RequestContext
		code   string
	}{
		{"anonymous", nil, "AUTH_REQUIRED"}, {"other caller", user("bob"), "TASK_NOT_FOUND"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			app := testApp(t)
			created := invoke(t, app, "task.create", map[string]any{"title": "private"}, user("alice"))
			successful[TaskCreateOutput](t, created)
			result, err := app.Follow(context.Background(), created.Context.Next[0], tc.caller)
			if err != nil {
				t.Fatal(err)
			}
			failed(t, result, tc.code)
			if len(result.Context.Next) != 0 {
				t.Fatalf("denied caller received private continuation: %+v", result.Context)
			}
		})
	}
}

func TestTodo_DiscoveryIsCallerScoped(t *testing.T) {
	for _, tc := range []struct {
		name   string
		caller *anwa.RequestContext
		count  int
	}{
		{"anonymous", nil, 0}, {"verified caller", user("alice"), 6},
	} {
		t.Run(tc.name, func(t *testing.T) {
			app := testApp(t)
			catalog, err := app.Catalog(tc.caller)
			if err != nil {
				t.Fatal(err)
			}
			if len(catalog.Interactions) != tc.count {
				t.Fatalf("want %d visible operations, got %+v", tc.count, catalog)
			}
			_, err = app.Discover("task.get", tc.caller)
			if (err == nil) != (tc.count > 0) {
				t.Fatalf("description exposure differs from catalog: %v", err)
			}
		})
	}
}

func TestTodo_ConcurrentSameVersionWritesCommitExactlyOnce(t *testing.T) {
	app := testApp(t)
	alice := user("alice")
	var ids []string
	for i := 0; i < 12; i++ {
		output := successful[TaskCreateOutput](t, invoke(t, app, "task.create",
			map[string]any{"title": "work"}, alice))
		ids = append(ids, output.Task.Id)
	}
	list := successful[TaskListOutput](t, invoke(t, app, "task.list", nil, alice))
	if len(list.Items) != len(ids) {
		t.Fatalf("want %d created tasks, got %d", len(ids), len(list.Items))
	}
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
