import {
  fail,
  ok,
  reply,
  type NextInteraction,
  type VerifiedCaller,
} from "../../src/anwa.ts";
import type { InputOf } from "../../src/contracts.ts";
import { schema } from "./contract.generated.ts";
import {
  createTodoState,
  type Role,
  type Workspace,
  type Task,
  type Project,
  type SavedView,
  type Priority,
  type StoredStatus,
  isoNow,
  validDate,
  addDays,
  normalizeTags,
  validPositive,
  validNonnegative,
} from "./model.ts";

type Ref = keyof (typeof schema)["interactions"];
type Input<K extends Ref> = InputOf<(typeof schema)["interactions"][K]>;
const priority = new Set(["low", "medium", "high", "urgent"]);
const now = () => isoNow();

export function createTodoLogic() {
  const state = createTodoState();

  function taskNext(workspaceId: string, taskId: string): NextInteraction[] {
    return [
      {
        ref: "task.get",
        input: { workspaceId, taskId },
        guidance: { level: "recommended" },
      },
      {
        ref: "task.plan",
        input: { workspaceId },
        guidance: { level: "available" },
      },
    ];
  }

  function projectNext(
    workspaceId: string,
    projectId: string,
  ): NextInteraction[] {
    return [
      { ref: "task.create", guidance: { level: "recommended" } },
      {
        ref: "task.list",
        input: { workspaceId, projectId },
        guidance: { level: "available" },
      },
    ];
  }

  function validPage(limit?: number, offset?: number): boolean {
    return (
      (limit === undefined ||
        (Number.isInteger(limit) && limit > 0 && limit <= 100)) &&
      (offset === undefined || validNonnegative(offset))
    );
  }

  function validDateField(value?: string): boolean {
    return value === undefined || value === "" || validDate(value);
  }

  function validMember(workspaceId: string, subject?: string): boolean {
    return !subject || !!state.workspace(workspaceId)?.members.has(subject);
  }

  function validPatch(
    workspaceId: string,
    patch: {
      title?: string;
      notes?: string;
      priority?: string;
      status?: string;
      dueAt?: string;
      tags?: readonly string[];
      assignee?: string;
      estimateMinutes?: number;
      recurrenceDays?: number;
    },
  ): boolean {
    if (patch.title !== undefined && !patch.title.trim()) return false;
    if (patch.priority !== undefined && !priority.has(patch.priority))
      return false;
    if (
      patch.status !== undefined &&
      !["todo", "in_progress"].includes(patch.status)
    )
      return false;
    if (!validDateField(patch.dueAt)) return false;
    if (patch.tags && patch.tags.some((t) => !t.trim())) return false;
    if (!validMember(workspaceId, patch.assignee)) return false;
    if (
      patch.estimateMinutes !== undefined &&
      !validNonnegative(patch.estimateMinutes)
    )
      return false;
    if (
      patch.recurrenceDays !== undefined &&
      !validPositive(patch.recurrenceDays)
    )
      return false;
    return true;
  }

  function applyPatch(
    task: Task,
    patch: {
      title?: string;
      notes?: string;
      priority?: string;
      status?: string;
      dueAt?: string;
      tags?: readonly string[];
      assignee?: string;
      estimateMinutes?: number;
      recurrenceDays?: number;
    },
  ): void {
    if (patch.title !== undefined) task.title = patch.title.trim();
    if (patch.notes !== undefined) task.notes = patch.notes;
    if (patch.priority !== undefined)
      task.priority = patch.priority as Priority;
    if (patch.status !== undefined) task.status = patch.status as StoredStatus;
    if (patch.dueAt !== undefined) task.dueAt = patch.dueAt || undefined;
    if (patch.tags !== undefined) task.tags = normalizeTags(patch.tags);
    if (patch.assignee !== undefined)
      task.assignee = patch.assignee || undefined;
    if (patch.estimateMinutes !== undefined)
      task.estimateMinutes = patch.estimateMinutes;
    if (patch.recurrenceDays !== undefined)
      task.recurrenceDays = patch.recurrenceDays;
    state.touch(task);
  }

  function conflict(workspaceId: string, taskId: string) {
    return reply(
      fail("VERSION_CONFLICT", "Task version changed", { effects: "none" }),
      [
        {
          ref: "task.get",
          input: { workspaceId, taskId },
          guidance: { level: "recommended" },
        },
      ],
    );
  }

  function missingTask() {
    return reply(
      fail("TASK_NOT_FOUND", "Task not found in workspace", {
        effects: "none",
      }),
    );
  }

  function invalid(reason: string) {
    return reply(fail("INVALID_DATA", reason, { effects: "none" }));
  }

  function lookupTask(workspaceId: string, taskId: string) {
    return state.task(workspaceId, taskId);
  }

  function audit(
    workspaceId: string,
    caller: VerifiedCaller,
    type: string,
    entity: string,
    id: string,
  ): void {
    state.audit(workspaceId, caller.subject, type, entity, id);
  }

  function workspaceCreate(
    input: Input<"workspace.create">,
    caller: VerifiedCaller,
  ) {
    if (!input.name.trim()) return invalid("Workspace name required");
    const workspace: Workspace = {
      id: state.newId("ws"),
      name: input.name.trim(),
      members: new Map([[caller.subject, "owner"]]),
    };
    state.workspaces.set(workspace.id, workspace);
    audit(workspace.id, caller, "workspace.created", "workspace", workspace.id);
    return reply(
      ok({
        workspace: {
          id: workspace.id,
          name: workspace.name,
          role: "owner" as const,
          members: 1,
        },
      }),
      [
        { ref: "project.create", guidance: { level: "recommended" } },
        {
          ref: "workspace.dashboard",
          input: { workspaceId: workspace.id },
          guidance: { level: "available" },
        },
      ],
    );
  }

  function workspaceList(caller: VerifiedCaller) {
    const workspaces = [...state.workspaces.values()]
      .filter((w) => w.members.has(caller.subject))
      .map((w) => ({
        id: w.id,
        name: w.name,
        role: w.members.get(caller.subject)!,
        members: w.members.size,
      }));
    return reply(ok({ workspaces }));
  }

  function workspaceInvite(
    input: Input<"workspace.invite">,
    caller: VerifiedCaller,
  ) {
    const w = state.workspace(input.workspaceId)!;
    if (!input.subject.trim()) return invalid("Member subject required");
    if (w.members.has(input.subject))
      return reply(fail("MEMBER_EXISTS", "Member already invited"));
    w.members.set(input.subject, input.role as Role);
    audit(w.id, caller, "member.added", "member", input.subject);
    return reply(ok({ member: { subject: input.subject, role: input.role } }), [
      {
        ref: "workspace.members",
        input: { workspaceId: w.id },
        guidance: { level: "recommended" },
      },
    ]);
  }

  function workspaceMembers(input: Input<"workspace.members">) {
    const w = state.workspace(input.workspaceId)!;
    return reply(
      ok({
        members: [...w.members.entries()].map(([subject, role]) => ({
          subject,
          role,
        })),
      }),
    );
  }

  function workspaceDashboard(input: Input<"workspace.dashboard">) {
    const tasks = state.tasksIn(input.workspaceId);
    const byStatus = { todo: 0, in_progress: 0, blocked: 0, done: 0 };
    let overdue = 0,
      dueSoon = 0;
    const cutoff = Date.now() + 7 * 86400000;
    for (const t of tasks) {
      const status = state.effectiveStatus(t);
      byStatus[status]++;
      if (status === "done" || !t.dueAt) continue;
      const due = Date.parse(t.dueAt);
      if (due < Date.now()) overdue++;
      else if (due <= cutoff) dueSoon++;
    }
    const byProject = [...state.projects.values()]
      .filter((p) => p.workspaceId === input.workspaceId && !p.archived)
      .map((p) => ({
        projectId: p.id,
        name: p.name,
        total: tasks.filter((t) => t.projectId === p.id).length,
        done: tasks.filter((t) => t.projectId === p.id && t.status === "done")
          .length,
      }));
    return reply(
      ok({
        total: tasks.length,
        done: byStatus.done,
        overdue,
        dueSoon,
        byStatus,
        byProject,
      }),
      [
        {
          ref: "task.plan",
          input: { workspaceId: input.workspaceId },
          guidance: { level: "recommended" },
        },
        {
          ref: "task.board",
          input: { workspaceId: input.workspaceId },
          guidance: { level: "available" },
        },
      ],
    );
  }

  function projectCreate(
    input: Input<"project.create">,
    caller: VerifiedCaller,
  ) {
    if (!input.name.trim()) return invalid("Project name required");
    const project: Project = {
      id: state.newId("prj"),
      workspaceId: input.workspaceId,
      name: input.name.trim(),
      description: input.description ?? "",
      archived: false,
      version: 1,
    };
    state.projects.set(project.id, project);
    audit(input.workspaceId, caller, "project.created", "project", project.id);
    return reply(
      ok({ project: { ...project } }),
      projectNext(input.workspaceId, project.id),
    );
  }

  function projectList(input: Input<"project.list">) {
    const projects = [...state.projects.values()]
      .filter(
        (p) =>
          p.workspaceId === input.workspaceId &&
          (input.includeArchived || !p.archived),
      )
      .map((p) => ({ ...p }));
    return reply(ok({ projects }));
  }

  function projectUpdate(
    input: Input<"project.update">,
    caller: VerifiedCaller,
  ) {
    const p = state.project(input.workspaceId, input.projectId);
    if (!p) return reply(fail("PROJECT_NOT_FOUND", "Project not found"));
    if (p.version !== input.expectedVersion)
      return reply(
        fail("VERSION_CONFLICT", "Project version changed", {
          effects: "none",
        }),
        [
          {
            ref: "project.list",
            input: { workspaceId: input.workspaceId },
            guidance: { level: "recommended" },
          },
        ],
      );
    if (input.name !== undefined && !input.name.trim())
      return invalid("Project name required");
    if (input.name !== undefined) p.name = input.name.trim();
    if (input.description !== undefined) p.description = input.description;
    if (input.archived !== undefined) p.archived = input.archived;
    p.version++;
    audit(input.workspaceId, caller, "project.updated", "project", p.id);
    return reply(
      ok({ project: { ...p } }),
      projectNext(input.workspaceId, p.id),
    );
  }

  function taskCreate(input: Input<"task.create">, caller: VerifiedCaller) {
    const p = state.project(input.workspaceId, input.projectId);
    if (!p || p.archived)
      return reply(fail("PROJECT_NOT_FOUND", "Active project not found"));
    if (
      !input.title.trim() ||
      !validDateField(input.dueAt) ||
      (input.estimateMinutes !== undefined &&
        !validNonnegative(input.estimateMinutes)) ||
      (input.recurrenceDays !== undefined &&
        !validPositive(input.recurrenceDays)) ||
      !validMember(input.workspaceId, input.assignee) ||
      (input.tags ?? []).some((t) => !t.trim())
    )
      return invalid("Invalid task attributes");
    if (input.parentId) {
      const parent = lookupTask(input.workspaceId, input.parentId);
      if (!parent || parent.projectId !== p.id || parent.archived)
        return reply(
          fail(
            "INVALID_PARENT",
            "Parent must be an active task in same project",
          ),
        );
    }
    const timestamp = now();
    const task: Task = {
      id: state.newId("tsk"),
      workspaceId: input.workspaceId,
      projectId: p.id,
      title: input.title.trim(),
      notes: input.notes ?? "",
      status: "todo",
      priority: input.priority ?? "medium",
      dueAt: input.dueAt || undefined,
      tags: normalizeTags(input.tags ?? []),
      assignee: input.assignee,
      estimateMinutes: input.estimateMinutes,
      recurrenceDays: input.recurrenceDays,
      parentId: input.parentId,
      dependencies: [],
      version: 1,
      archived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      comments: [],
    };
    state.tasks.set(task.id, task);
    audit(input.workspaceId, caller, "task.created", "task", task.id);
    return reply(
      ok({ task: state.snapshot(task) }),
      taskNext(input.workspaceId, task.id),
    );
  }

  function taskGet(input: Input<"task.get">) {
    const t = lookupTask(input.workspaceId, input.taskId);
    return t ? reply(ok({ task: state.snapshot(t) })) : missingTask();
  }

  function taskList(input: Input<"task.list">) {
    if (!validPage(input.limit, input.offset))
      return invalid("Invalid pagination");
    let items = state.tasksIn(input.workspaceId, input.includeArchived);
    if (input.projectId)
      items = items.filter((t) => t.projectId === input.projectId);
    if (input.parentId)
      items = items.filter((t) => t.parentId === input.parentId);
    items.sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    );
    const offset = input.offset ?? 0,
      limit = input.limit ?? 30,
      total = items.length;
    return reply(
      ok({
        items: items
          .slice(offset, offset + limit)
          .map((t) => state.snapshot(t)),
        total,
        offset,
        limit,
      }),
    );
  }

  function taskUpdate(input: Input<"task.update">, caller: VerifiedCaller) {
    const t = lookupTask(input.workspaceId, input.taskId);
    if (!t) return missingTask();
    if (t.archived) return reply(fail("ARCHIVED", "Restore before editing"));
    if (t.version !== input.expectedVersion)
      return conflict(input.workspaceId, t.id);
    if (
      !Object.keys(input.patch).length ||
      !validPatch(input.workspaceId, input.patch)
    )
      return invalid("Invalid task patch");
    applyPatch(t, input.patch);
    audit(input.workspaceId, caller, "task.updated", "task", t.id);
    return reply(
      ok({ task: state.snapshot(t) }),
      taskNext(input.workspaceId, t.id),
    );
  }

  function taskComplete(input: Input<"task.complete">, caller: VerifiedCaller) {
    const t = lookupTask(input.workspaceId, input.taskId);
    if (!t) return missingTask();
    if (t.archived)
      return reply(fail("ARCHIVED", "Archived task cannot be completed"));
    if (t.version !== input.expectedVersion)
      return conflict(input.workspaceId, t.id);
    if (t.status === "done")
      return reply(fail("ALREADY_DONE", "Task already completed"));
    const unresolved = t.dependencies.filter(
      (id) => state.tasks.get(id)?.status !== "done",
    );
    if (unresolved.length)
      return reply(
        fail("DEPENDENCY_BLOCKED", "Finish dependencies first", {
          effects: "none",
        }),
        unresolved.slice(0, 5).map((taskId) => ({
          ref: "task.get",
          input: { workspaceId: input.workspaceId, taskId },
          guidance: { level: "recommended" },
        })),
      );
    t.status = "done";
    t.completedAt = now();
    state.touch(t);
    audit(input.workspaceId, caller, "task.completed", "task", t.id);
    let spawnedId: string | undefined;
    if (t.recurrenceDays) {
      const timestamp = now();
      const next: Task = {
        ...t,
        id: state.newId("tsk"),
        version: 1,
        status: "todo",
        completedAt: undefined,
        originId: t.originId ?? t.id,
        dependencies: [],
        dueAt: addDays(t.dueAt ?? timestamp, t.recurrenceDays),
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        comments: [],
        tags: [...t.tags],
      };
      state.tasks.set(next.id, next);
      audit(
        input.workspaceId,
        caller,
        "task.recurrence.created",
        "task",
        next.id,
      );
      spawnedId = next.id;
    }
    return reply(
      ok({ task: state.snapshot(t), ...(spawnedId ? { spawnedId } : {}) }),
      [
        ...taskNext(input.workspaceId, t.id),
        ...(spawnedId
          ? [
              {
                ref: "task.get",
                input: { workspaceId: input.workspaceId, taskId: spawnedId },
                guidance: { level: "recommended" as const },
              },
            ]
          : []),
      ],
    );
  }

  function taskReopen(input: Input<"task.reopen">, caller: VerifiedCaller) {
    const t = lookupTask(input.workspaceId, input.taskId);
    if (!t) return missingTask();
    if (t.archived) return reply(fail("ARCHIVED", "Restore before reopening"));
    if (t.version !== input.expectedVersion)
      return conflict(input.workspaceId, t.id);
    if (t.status !== "done")
      return reply(fail("NOT_DONE", "Task is not complete"));
    t.status = "todo";
    t.completedAt = undefined;
    state.touch(t);
    audit(input.workspaceId, caller, "task.reopened", "task", t.id);
    return reply(
      ok({ task: state.snapshot(t) }),
      taskNext(input.workspaceId, t.id),
    );
  }

  function taskArchive(input: Input<"task.archive">, caller: VerifiedCaller) {
    const t = lookupTask(input.workspaceId, input.taskId);
    if (!t) return missingTask();
    if (t.version !== input.expectedVersion)
      return conflict(input.workspaceId, t.id);
    if (t.archived) return reply(fail("ARCHIVED", "Already archived"));
    t.archived = true;
    state.touch(t);
    audit(input.workspaceId, caller, "task.archived", "task", t.id);
    return reply(ok({ task: state.snapshot(t) }), [
      {
        ref: "task.restore",
        input: {
          workspaceId: input.workspaceId,
          taskId: t.id,
          expectedVersion: t.version,
        },
        guidance: { level: "available" },
      },
    ]);
  }

  function taskRestore(input: Input<"task.restore">, caller: VerifiedCaller) {
    const t = lookupTask(input.workspaceId, input.taskId);
    if (!t) return missingTask();
    if (t.version !== input.expectedVersion)
      return conflict(input.workspaceId, t.id);
    if (!t.archived) return invalid("Task is not archived");
    t.archived = false;
    state.touch(t);
    audit(input.workspaceId, caller, "task.restored", "task", t.id);
    return reply(
      ok({ task: state.snapshot(t) }),
      taskNext(input.workspaceId, t.id),
    );
  }

  function dependencyAdd(
    input: Input<"task.dependency.add">,
    caller: VerifiedCaller,
  ) {
    const t = lookupTask(input.workspaceId, input.taskId);
    const dep = lookupTask(input.workspaceId, input.dependsOnId);
    if (!t || !dep) return missingTask();
    if (t.archived)
      return reply(fail("ARCHIVED", "Restore before editing dependencies"));
    if (t.version !== input.expectedVersion)
      return conflict(input.workspaceId, t.id);
    if (t.dependencies.includes(dep.id))
      return reply(fail("ALREADY_DEPENDENT", "Already depends on task"));
    if (state.createsCycle(t.id, dep.id))
      return reply(
        fail("DEPENDENCY_CYCLE", "Dependency cycle would form", {
          effects: "none",
        }),
        [
          {
            ref: "task.get",
            input: { workspaceId: input.workspaceId, taskId: dep.id },
            guidance: { level: "recommended" },
          },
        ],
      );
    t.dependencies.push(dep.id);
    state.touch(t);
    audit(input.workspaceId, caller, "dependency.added", "task", t.id);
    return reply(ok({ task: state.snapshot(t) }), [
      {
        ref: "task.get",
        input: { workspaceId: input.workspaceId, taskId: dep.id },
        guidance: { level: "recommended" },
      },
    ]);
  }

  function dependencyRemove(
    input: Input<"task.dependency.remove">,
    caller: VerifiedCaller,
  ) {
    const t = lookupTask(input.workspaceId, input.taskId);
    if (!t) return missingTask();
    if (t.archived)
      return reply(fail("ARCHIVED", "Restore before editing dependencies"));
    if (t.version !== input.expectedVersion)
      return conflict(input.workspaceId, t.id);
    if (!t.dependencies.includes(input.dependsOnId))
      return invalid("Dependency not found");
    t.dependencies = t.dependencies.filter((id) => id !== input.dependsOnId);
    state.touch(t);
    audit(input.workspaceId, caller, "dependency.removed", "task", t.id);
    return reply(
      ok({ task: state.snapshot(t) }),
      taskNext(input.workspaceId, t.id),
    );
  }

  function taskBulkUpdate(
    input: Input<"task.bulkUpdate">,
    caller: VerifiedCaller,
  ) {
    const updates = input.updates;
    if (!updates.length || updates.length > 100)
      return invalid("Bulk update requires 1 to 100 tasks");
    const seen = new Set<string>(),
      staged: Array<{ task: Task; patch: (typeof updates)[number]["patch"] }> =
        [];
    for (const update of updates) {
      if (seen.has(update.taskId))
        return reply(fail("DUPLICATE_ITEM", "Duplicate task in batch"));
      seen.add(update.taskId);
      const t = lookupTask(input.workspaceId, update.taskId);
      if (!t) return missingTask();
      if (t.archived)
        return reply(fail("ARCHIVED", "Cannot bulk edit archived tasks"));
      if (t.version !== update.expectedVersion)
        return conflict(input.workspaceId, t.id);
      if (
        !Object.keys(update.patch).length ||
        !validPatch(input.workspaceId, update.patch)
      )
        return invalid("Invalid bulk patch");
      staged.push({ task: t, patch: update.patch });
    }
    // All checks above happen before the first mutation, giving an in-memory atomic batch.
    for (const { task, patch } of staged) {
      applyPatch(task, patch);
      audit(input.workspaceId, caller, "task.bulk.updated", "task", task.id);
    }
    return reply(
      ok({
        items: staged.map(({ task }) => state.snapshot(task)),
        count: staged.length,
      }),
      [
        {
          ref: "task.board",
          input: { workspaceId: input.workspaceId },
          guidance: { level: "recommended" },
        },
      ],
    );
  }

  function taskSearch(input: Input<"task.search">) {
    if (
      !validPage(input.limit, input.offset) ||
      !validDateField(input.dueBefore) ||
      !validDateField(input.dueAfter)
    )
      return invalid("Invalid search filters");
    const result = state.search(
      input.workspaceId,
      input,
      input.offset ?? 0,
      input.limit ?? 30,
    );
    return reply(
      ok(result),
      result.items.slice(0, 3).map((t) => ({
        ref: "task.get",
        input: { workspaceId: input.workspaceId, taskId: t.id },
        guidance: { level: "available" },
      })),
    );
  }

  function taskBoard(input: Input<"task.board">) {
    const groups: {
      todo: Task[];
      in_progress: Task[];
      blocked: Task[];
      done: Task[];
    } = {
      todo: [],
      in_progress: [],
      blocked: [],
      done: [],
    };
    for (const t of state.tasksIn(input.workspaceId)) {
      if (input.projectId && t.projectId !== input.projectId) continue;
      groups[state.effectiveStatus(t)].push(t);
    }
    return reply(
      ok({
        todo: groups.todo.map((t) => state.snapshot(t)),
        in_progress: groups.in_progress.map((t) => state.snapshot(t)),
        blocked: groups.blocked.map((t) => state.snapshot(t)),
        done: groups.done.map((t) => state.snapshot(t)),
      }),
      [
        {
          ref: "task.plan",
          input: { workspaceId: input.workspaceId },
          guidance: { level: "recommended" },
        },
      ],
    );
  }

  function taskPlan(input: Input<"task.plan">) {
    const limit = input.limit ?? 10;
    if (!validPage(limit, 0)) return invalid("Invalid plan size");
    const active = state
      .tasksIn(input.workspaceId)
      .filter((t) => t.status !== "done");
    const blocked = active.filter((t) => state.isBlocked(t)).length;
    const ready = active.filter(
      (t) =>
        !state.isBlocked(t) &&
        (!input.assignee || t.assignee === input.assignee),
    );
    ready.sort(
      (a, b) =>
        state.priorityScore(b) - state.priorityScore(a) ||
        a.id.localeCompare(b.id),
    );
    const items = ready.slice(0, limit).map((t) => state.snapshot(t));
    return reply(
      ok({ items, blocked }),
      items.slice(0, 5).map((t) => ({
        ref: "task.get",
        input: { workspaceId: input.workspaceId, taskId: t.id },
        guidance: { level: "recommended" },
      })),
    );
  }

  function taskComment(input: Input<"task.comment">, caller: VerifiedCaller) {
    const t = lookupTask(input.workspaceId, input.taskId);
    if (!t) return missingTask();
    if (t.archived)
      return reply(fail("ARCHIVED", "Cannot comment on archived task"));
    if (!input.body.trim()) return invalid("Comment cannot be empty");
    t.comments.push({
      author: caller.subject,
      body: input.body.trim(),
      at: now(),
    });
    state.touch(t);
    audit(input.workspaceId, caller, "task.commented", "task", t.id);
    return reply(
      ok({ task: state.snapshot(t) }),
      taskNext(input.workspaceId, t.id),
    );
  }

  function viewSave(input: Input<"view.save">, caller: VerifiedCaller) {
    if (!input.name.trim() || !validDateField(input.query.dueBefore))
      return invalid("Invalid view parameters");
    const view: SavedView = {
      id: state.newId("view"),
      workspaceId: input.workspaceId,
      name: input.name.trim(),
      query: { ...input.query },
      creator: caller.subject,
    };
    state.views.set(view.id, view);
    audit(input.workspaceId, caller, "view.saved", "view", view.id);
    return reply(
      ok({
        view: {
          id: view.id,
          name: view.name,
          query: view.query,
          creator: view.creator,
        },
      }),
      [
        {
          ref: "view.run",
          input: { workspaceId: input.workspaceId, viewId: view.id },
          guidance: { level: "recommended" },
        },
      ],
    );
  }

  function viewList(input: Input<"view.list">) {
    return reply(
      ok({
        views: [...state.views.values()]
          .filter((v) => v.workspaceId === input.workspaceId)
          .map((v) => ({
            id: v.id,
            name: v.name,
            query: { ...v.query },
            creator: v.creator,
          })),
      }),
    );
  }

  function viewRun(input: Input<"view.run">) {
    if (!validPage(input.limit, input.offset))
      return invalid("Invalid view pagination");
    const view = state.view(input.workspaceId, input.viewId);
    if (!view)
      return reply(fail("VIEW_NOT_FOUND", "Saved view does not exist"));
    const result = state.search(
      input.workspaceId,
      view.query,
      input.offset ?? 0,
      input.limit ?? 30,
    );
    return reply(
      ok(result),
      result.items.slice(0, 3).map((t) => ({
        ref: "task.get",
        input: { workspaceId: input.workspaceId, taskId: t.id },
        guidance: { level: "available" },
      })),
    );
  }

  async function* activityEvents(input: Input<"activity.events">, cursor = 0) {
    const events = state.activity.get(input.workspaceId) ?? [];
    if (!Number.isInteger(cursor) || cursor < 0) throw Error("Invalid cursor");
    for (const event of events.slice(cursor)) yield { ...event };
  }

  return {
    state,
    workspaceCreate,
    workspaceList,
    workspaceInvite,
    workspaceMembers,
    workspaceDashboard,
    projectCreate,
    projectList,
    projectUpdate,
    taskCreate,
    taskGet,
    taskList,
    taskUpdate,
    taskComplete,
    taskReopen,
    taskArchive,
    taskRestore,
    dependencyAdd,
    dependencyRemove,
    taskBulkUpdate,
    taskSearch,
    taskBoard,
    taskPlan,
    taskComment,
    viewSave,
    viewList,
    viewRun,
    activityEvents,
  };
}
export type TodoLogic = ReturnType<typeof createTodoLogic>;
