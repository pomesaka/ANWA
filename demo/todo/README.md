# Advanced Todo — ANWA Interaction-first demo

A **27-Interaction**, in-memory collaborative Todo application implemented entirely in app-owned TypeScript. It is an expressiveness/stress test for ANWA Core, not a reusable production task manager or an example of a mandatory domain architecture.

## Try it

```bash
bun install --frozen-lockfile
bun run validate
bun run codegen
bun check
bun test
bun run demo:todo
```

The walkthrough creates a workspace, invites a collaborator, creates a project, defines a dependency, attempts a blocked completion, completes its prerequisite, generates the next recurring task, builds a workspace dashboard, executes a saved search and replays audit events.

## Implemented functionality

| Area                       | Interactions                                                                                                          | Behaviors                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Workspaces and memberships | `workspace.create`, `workspace.list`, `workspace.invite`, `workspace.members`, `workspace.dashboard`                  | Owner/editor/viewer roles, caller isolation, project and task metrics                                     |
| Projects                   | `project.create`, `project.list`, `project.update`                                                                    | Project grouping, archiving, version checks                                                               |
| Task lifecycle             | `task.create`, `task.get`, `task.list`, `task.update`, `task.complete`, `task.reopen`, `task.archive`, `task.restore` | Subtasks, priorities, tags, assignees, notes, deadlines, recurrence, version checks, reversible archiving |
| Task dependencies          | `task.dependency.add`, `task.dependency.remove`                                                                       | DAG cycle detection, computed blocked status, completion prerequisites                                    |
| Operations and planning    | `task.bulkUpdate`, `task.search`, `task.board`, `task.plan`                                                           | Prevalidated in-memory bulk changes, filters/sort/pagination, kanban, priority/urgency planning           |
| Collaboration              | `task.comment`                                                                                                        | Attributed comments visible to members                                                                    |
| Saved searches             | `view.save`, `view.list`, `view.run`                                                                                  | Reusable, workspace-scoped query criteria                                                                 |
| Audit                      | `activity.events`                                                                                                     | Guarded, cursor-based finite replay via AsyncIterable                                                     |

The published JSON manifest is [anwa.json](anwa.json). Its `$defs.Task`, `$defs.Project`, and `$defs.SavedQuery` are reusable **payload descriptions**, not Things: 27 separate Interactions keep their own refs, guards, inputs and outputs. The authoring manifest uses local `$ref` for repeated shapes; codegen expands those references into the unchanged literal [contract.generated.ts](contract.generated.ts), which CI checks for drift. Each Handler in [index.ts](index.ts) is typed by the manifest and delegates app logic to [logic.ts](logic.ts), using an ordinary [in-memory model](model.ts).

## ANWA-specific behavior exercised

- **Zero Things:** tasks, projects, members and workspaces are ordinary domain data. Every operation is a top-level InteractionRef.
- **Authentication is not built in:** the walkthrough supplies simulated `caller` objects, as if they came from a trusted authentication adapter. The app does not authenticate users itself.
- **Authorization:** named Guards protect all operations, including Queries and the audit Event; anonymous callers and nonmembers are denied. Viewer cannot edit; owner alone can invite.
- **Outcome + Context:** successful operations return useful follow-up Interaction choices. A blocked dependency or stale task version offers a relevant `task.get` candidate.
- **Schema-first typing:** input, success output, expected error code and guard input types are generated from the public JSON manifest.
- **Runtime validation:** business errors and return payloads are checked against the reference runtime's supported JSON Schema subset.
- **Event observation:** the guarded Event returns a **finite audit replay**, not a durable live stream.

## Deliberate limitations

This is **not** a network app, a database-backed service or a browser UI. State is lost between runs; task IDs are process-local. The bulk operation is prevalidated before mutation but is **not a cross-process database transaction**. The Guard runs before the Handler, but real persistence must still enforce authorization and state consistency atomically. Audit events are in-memory and not independently tamper-proof; reminders are represented as deadlines and plan data, not external notifications. Recurrence uses a simple fixed day interval, not calendar/RRULE scheduling.

[Core specification](../../spec/anwa-0.2.md) · [Authentication boundary](../../docs/authentication-authorization.md) · [All demos](../README.md)
