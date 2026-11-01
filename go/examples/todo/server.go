// Package main demonstrates an ANWA application with state, ownership, and
// optimistic updates. The generated ServerInterface is implemented here.
package main

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/pomesaka/ANWA/go/anwa"
)

type storedTask struct {
	owner string
	order int64
	task  Task
}

// TaskServer deliberately owns business state. ANWA owns dispatch, Guard
// preflight, payload checks, and the Outcome + Context envelope.
type TaskServer struct {
	mu    sync.Mutex
	seq   int64
	tasks map[string]storedTask
}

var _ ServerInterface = (*TaskServer)(nil)

func newTaskServer() *TaskServer {
	return &TaskServer{tasks: make(map[string]storedTask)}
}

func newTodoApp(manifest anwa.Manifest) (*anwa.App, *TaskServer, error) {
	server := newTaskServer()
	app, err := anwa.New(manifest, anwa.Config{
		Handlers: Handlers(server),
		Guards: map[string]anwa.Guard{
			"requireCaller": func(_ context.Context, args anwa.Args) (anwa.GuardDecision, error) {
				if args.Caller == nil {
					return anwa.GuardDecision{Error: &anwa.DomainError{
						Code: "AUTH_REQUIRED", Effects: "none",
					}}, nil
				}
				return anwa.GuardDecision{Allowed: true}, nil
			},
		},
		Discoverable: func(_ string, caller *anwa.VerifiedCaller) bool {
			return caller != nil
		},
	})
	return app, server, err
}

func cleanTitle(title string) (string, bool) {
	trimmed := strings.TrimSpace(title)
	return trimmed, trimmed != "" && utf8.RuneCountInString(trimmed) <= 120
}

func taskGetNext(id string) anwa.Next {
	return anwa.Next{
		Ref: "task.get",
		Input: map[string]any{"taskId": id},
		Guidance: &anwa.Guidance{Level: "recommended"},
	}
}

func taskMutationNext(id string, version int64) []anwa.Next {
	input := map[string]any{"taskId": id, "expectedVersion": version}
	return []anwa.Next{
		{Ref: "task.get", Input: map[string]any{"taskId": id}},
		{Ref: "task.rename"}, // title still needs to be supplied by the caller
		{Ref: "task.complete", Input: input},
		{Ref: "task.delete", Input: input},
	}
}

// caller ownership is checked while holding the same lock as the mutation.
// Guard preflight alone is not sufficient for this per-resource check.
func (s *TaskServer) ownedLocked(owner, id string) (storedTask, bool) {
	record, ok := s.tasks[id]
	return record, ok && record.owner == owner
}

func (s *TaskServer) TaskCreate(_ context.Context, req TaskCreateRequest) (TaskCreateResponse, error) {
	title, valid := cleanTitle(req.Input.Title)
	if !valid {
		return TaskCreateFailure{Code: TaskCreateErrorInvalidTitle, Effects: "none"}, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.seq++
	id := fmt.Sprintf("task-%d", s.seq)
	task := Task{Id: id, Title: title, Completed: false, Version: 1}
	s.tasks[id] = storedTask{owner: req.Caller.Subject, order: s.seq, task: task}
	return TaskCreateOK{Value: TaskCreateOutput{Task: task},
		Next: []anwa.Next{taskGetNext(id)}}, nil
}

func (s *TaskServer) TaskList(_ context.Context, req TaskListRequest) (TaskListResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var records []storedTask
	for _, record := range s.tasks {
		if record.owner == req.Caller.Subject {
			records = append(records, record)
		}
	}
	sort.Slice(records, func(i, j int) bool { return records[i].order < records[j].order })
	tasks := make([]Task, 0, len(records))
	for _, record := range records {
		tasks = append(tasks, record.task)
	}
	return TaskListOK{Value: TaskListOutput{Items: tasks},
		Next: []anwa.Next{{Ref: "task.create"}}}, nil
}

func (s *TaskServer) TaskGet(_ context.Context, req TaskGetRequest) (TaskGetResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record, ok := s.ownedLocked(req.Caller.Subject, req.Input.TaskId)
	if !ok {
		// Do not distinguish another user's task from a nonexistent task.
		return TaskGetFailure{Code: TaskGetErrorTaskNotFound, Effects: "none"}, nil
	}
	return TaskGetOK{Value: TaskGetOutput{Task: record.task},
		Next: taskMutationNext(record.task.Id, record.task.Version)}, nil
}

func (s *TaskServer) TaskRename(_ context.Context, req TaskRenameRequest) (TaskRenameResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record, ok := s.ownedLocked(req.Caller.Subject, req.Input.TaskId)
	if !ok {
		return TaskRenameFailure{Code: TaskRenameErrorTaskNotFound, Effects: "none"}, nil
	}
	if record.task.Version != req.Input.ExpectedVersion {
		return TaskRenameFailure{Code: TaskRenameErrorVersionConflict, Effects: "none",
			Next: []anwa.Next{taskGetNext(record.task.Id)}}, nil
	}
	title, valid := cleanTitle(req.Input.Title)
	if !valid {
		return TaskRenameFailure{Code: TaskRenameErrorInvalidTitle, Effects: "none"}, nil
	}
	record.task.Title = title
	record.task.Version++
	s.tasks[record.task.Id] = record
	return TaskRenameOK{Value: TaskRenameOutput{Task: record.task},
		Next: []anwa.Next{taskGetNext(record.task.Id)}}, nil
}

func (s *TaskServer) TaskComplete(_ context.Context, req TaskCompleteRequest) (TaskCompleteResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record, ok := s.ownedLocked(req.Caller.Subject, req.Input.TaskId)
	if !ok {
		return TaskCompleteFailure{Code: TaskCompleteErrorTaskNotFound, Effects: "none"}, nil
	}
	if record.task.Version != req.Input.ExpectedVersion {
		return TaskCompleteFailure{Code: TaskCompleteErrorVersionConflict, Effects: "none",
			Next: []anwa.Next{taskGetNext(record.task.Id)}}, nil
	}
	if record.task.Completed {
		return TaskCompleteFailure{Code: TaskCompleteErrorAlreadyCompleted, Effects: "none",
			Next: []anwa.Next{taskGetNext(record.task.Id)}}, nil
	}
	record.task.Completed = true
	record.task.Version++
	s.tasks[record.task.Id] = record
	return TaskCompleteOK{Value: TaskCompleteOutput{Task: record.task},
		Next: []anwa.Next{taskGetNext(record.task.Id)}}, nil
}

func (s *TaskServer) TaskDelete(_ context.Context, req TaskDeleteRequest) (TaskDeleteResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record, ok := s.ownedLocked(req.Caller.Subject, req.Input.TaskId)
	if !ok {
		return TaskDeleteFailure{Code: TaskDeleteErrorTaskNotFound, Effects: "none"}, nil
	}
	if record.task.Version != req.Input.ExpectedVersion {
		return TaskDeleteFailure{Code: TaskDeleteErrorVersionConflict, Effects: "none",
			Next: []anwa.Next{taskGetNext(record.task.Id)}}, nil
	}
	delete(s.tasks, record.task.Id)
	return TaskDeleteOK{Value: TaskDeleteOutput{DeletedId: record.task.Id},
		Next: []anwa.Next{{Ref: "task.list"}}}, nil
}

// Denial hooks are Interaction-owned even when all six use the same policy.
// No private next references are offered to callers denied by requireCaller.
func (*TaskServer) TaskCreateOnDenied(_ context.Context, _ TaskCreateRequest, _ anwa.DomainError) ([]anwa.Next, error) {
	return nil, nil
}
func (*TaskServer) TaskListOnDenied(_ context.Context, _ TaskListRequest, _ anwa.DomainError) ([]anwa.Next, error) {
	return nil, nil
}
func (*TaskServer) TaskGetOnDenied(_ context.Context, _ TaskGetRequest, _ anwa.DomainError) ([]anwa.Next, error) {
	return nil, nil
}
func (*TaskServer) TaskRenameOnDenied(_ context.Context, _ TaskRenameRequest, _ anwa.DomainError) ([]anwa.Next, error) {
	return nil, nil
}
func (*TaskServer) TaskCompleteOnDenied(_ context.Context, _ TaskCompleteRequest, _ anwa.DomainError) ([]anwa.Next, error) {
	return nil, nil
}
func (*TaskServer) TaskDeleteOnDenied(_ context.Context, _ TaskDeleteRequest, _ anwa.DomainError) ([]anwa.Next, error) {
	return nil, nil
}
