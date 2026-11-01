import { test } from "bun:test";
import assert from "node:assert/strict";
import { createTodo } from "../demo/todo/index.ts";
import { schema } from "../demo/todo/contract.generated.ts";
import { validateManifest } from "../src/schema-tools.ts";
import { ObservationDenied, type InteractionResponse } from "../src/anwa.ts";

const alice = { caller: { subject: "alice" } } as const;
const bob = { caller: { subject: "bob" } } as const;
const carol = { caller: { subject: "carol" } } as const;

function value<T>(r: InteractionResponse<T>): T {
  if (r.outcome.kind !== "settled" || !r.outcome.result.ok)
    throw Error("Expected success: " + JSON.stringify(r.outcome));
  return r.outcome.result.value;
}
function code(r: InteractionResponse): string {
  if (r.outcome.kind !== "settled" || r.outcome.result.ok)
    throw Error("Expected domain failure: " + JSON.stringify(r.outcome));
  return r.outcome.result.error.code;
}
async function createWorkspace() {
  const app = createTodo();
  const { workspace } = value(
    await app.interact("workspace.create", { name: "Engineering" }, alice),
  );
  const { project } = value(
    await app.interact(
      "project.create",
      {
        workspaceId: workspace.id,
        name: "Product",
        description: "Roadmap",
      },
      alice,
    ),
  );
  return { app, workspaceId: workspace.id, projectId: project.id };
}
async function createTask(
  app: ReturnType<typeof createTodo>,
  workspaceId: string,
  projectId: string,
  title: string,
  options: {
    priority?: "low" | "medium" | "high" | "urgent";
    dueAt?: string;
    recurrenceDays?: number;
    tags?: string[];
    parentId?: string;
    assignee?: string;
  } = {},
) {
  const result = await app.interact(
    "task.create",
    { workspaceId, projectId, title, ...options },
    alice,
  );
  return value(result).task;
}

test("27 top-level Interactions have typed, guarded schemas and no Things", () => {
  assert.deepEqual(validateManifest(schema), []);
  assert.equal(Object.keys(schema.interactions).length, 27);
  assert.ok(Object.values(schema.interactions).every((op) => "guard" in op));
  assert.equal(Object.hasOwn(schema, "things"), false);
});

test("Authentication is required for discovering and creating a workspace", async () => {
  const app = createTodo();
  assert.equal(app.catalog().interactions.length, 0);
  assert.equal(app.catalog(alice).interactions.length, 27);
  assert.equal(
    code(await app.interact("workspace.create", { name: "Nope" })),
    "AUTH_REQUIRED",
  );
  const response = await app.interact(
    "workspace.create",
    { name: "Engineering" },
    alice,
  );
  const workspace = value(response).workspace;
  assert.ok(workspace.id.startsWith("ws-"));
  const list = value(await app.interact("workspace.list", undefined, alice));
  assert.equal(list.workspaces.length, 1);
  assert.equal(list.workspaces[0].role, "owner");
  const dashboard = value(
    await app.interact(
      "workspace.dashboard",
      { workspaceId: workspace.id },
      alice,
    ),
  );
  assert.equal(dashboard.total, 0);
  assert.ok(response.context.next.some((n) => n.ref === "project.create"));
});

test("Workspace owner can invite; viewer can read but cannot mutate or invite", async () => {
  const { app, workspaceId, projectId } = await createWorkspace();
  assert.equal(
    code(await app.interact("workspace.dashboard", { workspaceId }, bob)),
    "PERMISSION_DENIED",
  );
  value(
    await app.interact(
      "workspace.invite",
      { workspaceId, subject: "bob", role: "viewer" },
      alice,
    ),
  );
  const members = value(
    await app.interact("workspace.members", { workspaceId }, bob),
  );
  assert.equal(members.members.length, 2);
  assert.equal(
    code(
      await app.interact(
        "workspace.invite",
        {
          workspaceId,
          subject: "carol",
          role: "viewer",
        },
        bob,
      ),
    ),
    "PERMISSION_DENIED",
  );
  assert.equal(
    code(
      await app.interact(
        "task.create",
        {
          workspaceId,
          projectId,
          title: "Not allowed",
        },
        bob,
      ),
    ),
    "PERMISSION_DENIED",
  );
  assert.equal(
    code(await app.interact("task.search", { workspaceId }, carol)),
    "PERMISSION_DENIED",
  );
  const task = await createTask(
    app,
    workspaceId,
    projectId,
    "Visible only to members",
  );
  assert.equal(
    value(await app.interact("task.get", { workspaceId, taskId: task.id }, bob))
      .task.id,
    task.id,
  );
});

test("Task hierarchy, tags, updates, search, board, comments and planner", async () => {
  const { app, workspaceId, projectId } = await createWorkspace();
  const parent = await createTask(
    app,
    workspaceId,
    projectId,
    "Plan milestone",
    {
      priority: "urgent",
      tags: ["Work", "Q4", "work"],
      dueAt: "2026-11-02",
    },
  );
  const child = await createTask(
    app,
    workspaceId,
    projectId,
    "Implement feature",
    {
      parentId: parent.id,
      priority: "high",
      tags: ["work", "frontend"],
    },
  );
  assert.deepEqual(parent.tags, ["work", "q4"]);
  assert.equal(child.parentId, parent.id);
  const updated = value(
    await app.interact(
      "task.update",
      {
        workspaceId,
        taskId: child.id,
        expectedVersion: child.version,
        patch: { status: "in_progress", notes: "Prototype", assignee: "alice" },
      },
      alice,
    ),
  ).task;
  assert.equal(updated.status, "in_progress");
  assert.equal(updated.version, child.version + 1);
  const comment = value(
    await app.interact(
      "task.comment",
      {
        workspaceId,
        taskId: child.id,
        body: "Reviewed requirements",
      },
      alice,
    ),
  ).task;
  assert.equal(comment.comments[0].author, "alice");
  const search = value(
    await app.interact(
      "task.search",
      {
        workspaceId,
        text: "feature",
        tag: "FRONTEND",
        priority: "high",
        sortBy: "priority",
        limit: 20,
      },
      alice,
    ),
  );
  assert.equal(search.total, 1);
  assert.equal(search.items[0].id, child.id);
  const subtasks = value(
    await app.interact(
      "task.list",
      {
        workspaceId,
        projectId,
        parentId: parent.id,
      },
      alice,
    ),
  );
  assert.equal(subtasks.total, 1);
  const board = value(
    await app.interact("task.board", { workspaceId, projectId }, alice),
  );
  assert.equal(board.in_progress.length, 1);
  const plan = value(await app.interact("task.plan", { workspaceId }, alice));
  assert.equal(plan.items[0].id, parent.id);
  const dashboard = value(
    await app.interact("workspace.dashboard", { workspaceId }, alice),
  );
  assert.equal(dashboard.total, 2);
});

test("Dependencies block completion, prevent cycles and produce contextual recovery", async () => {
  const { app, workspaceId, projectId } = await createWorkspace();
  const design = await createTask(app, workspaceId, projectId, "Design", {
    priority: "high",
  });
  const implement = await createTask(app, workspaceId, projectId, "Implement", {
    priority: "urgent",
  });
  const withDependency = value(
    await app.interact(
      "task.dependency.add",
      {
        workspaceId,
        taskId: implement.id,
        dependsOnId: design.id,
        expectedVersion: implement.version,
      },
      alice,
    ),
  ).task;
  assert.equal(withDependency.status, "blocked");
  assert.equal(
    code(
      await app.interact(
        "task.complete",
        {
          workspaceId,
          taskId: implement.id,
          expectedVersion: withDependency.version,
        },
        alice,
      ),
    ),
    "DEPENDENCY_BLOCKED",
  );
  const fail = await app.interact(
    "task.complete",
    {
      workspaceId,
      taskId: implement.id,
      expectedVersion: withDependency.version,
    },
    alice,
  );
  assert.equal(fail.context.next[0].ref, "task.get");
  assert.deepEqual(fail.context.next[0].input, {
    workspaceId,
    taskId: design.id,
  });
  assert.equal(
    code(
      await app.interact(
        "task.dependency.add",
        {
          workspaceId,
          taskId: design.id,
          dependsOnId: implement.id,
          expectedVersion: design.version,
        },
        alice,
      ),
    ),
    "DEPENDENCY_CYCLE",
  );
  value(
    await app.interact(
      "task.complete",
      {
        workspaceId,
        taskId: design.id,
        expectedVersion: design.version,
      },
      alice,
    ),
  );
  const result = value(
    await app.interact(
      "task.complete",
      {
        workspaceId,
        taskId: implement.id,
        expectedVersion: withDependency.version,
      },
      alice,
    ),
  );
  assert.equal(result.task.status, "done");
});

test("Recurring completion creates a new task and version conflicts offer re-read", async () => {
  const { app, workspaceId, projectId } = await createWorkspace();
  const task = await createTask(app, workspaceId, projectId, "Daily standup", {
    recurrenceDays: 1,
    dueAt: "2026-11-02",
  });
  const result = value(
    await app.interact(
      "task.complete",
      {
        workspaceId,
        taskId: task.id,
        expectedVersion: task.version,
      },
      alice,
    ),
  );
  assert.ok(result.spawnedId);
  const next = value(
    await app.interact(
      "task.get",
      {
        workspaceId,
        taskId: result.spawnedId!,
      },
      alice,
    ),
  ).task;
  assert.equal(next.status, "todo");
  assert.equal(next.originId, task.id);
  assert.equal(next.dueAt, "2026-11-03T00:00:00.000Z");
  const stale = await app.interact(
    "task.reopen",
    {
      workspaceId,
      taskId: task.id,
      expectedVersion: task.version,
    },
    alice,
  );
  assert.equal(code(stale), "VERSION_CONFLICT");
  assert.equal(stale.context.next[0].ref, "task.get");
  const current = value(
    await app.interact("task.get", { workspaceId, taskId: task.id }, alice),
  ).task;
  const reopened = value(
    await app.interact(
      "task.reopen",
      {
        workspaceId,
        taskId: task.id,
        expectedVersion: current.version,
      },
      alice,
    ),
  ).task;
  assert.equal(reopened.status, "todo");
});

test("Bulk updates reject the whole batch on stale version then apply valid changes", async () => {
  const { app, workspaceId, projectId } = await createWorkspace();
  const a = await createTask(app, workspaceId, projectId, "One");
  const b = await createTask(app, workspaceId, projectId, "Two");
  const bad = await app.interact(
    "task.bulkUpdate",
    {
      workspaceId,
      updates: [
        {
          taskId: a.id,
          expectedVersion: a.version,
          patch: { priority: "urgent" },
        },
        { taskId: b.id, expectedVersion: 999, patch: { priority: "high" } },
      ],
    },
    alice,
  );
  assert.equal(code(bad), "VERSION_CONFLICT");
  assert.equal(
    value(await app.interact("task.get", { workspaceId, taskId: a.id }, alice))
      .task.priority,
    "medium",
  );
  const valid = value(
    await app.interact(
      "task.bulkUpdate",
      {
        workspaceId,
        updates: [
          {
            taskId: a.id,
            expectedVersion: a.version,
            patch: { priority: "urgent", tags: ["A"] },
          },
          {
            taskId: b.id,
            expectedVersion: b.version,
            patch: { priority: "high", status: "in_progress" },
          },
        ],
      },
      alice,
    ),
  );
  assert.equal(valid.count, 2);
  assert.equal(valid.items[0].priority, "urgent");
  assert.equal(valid.items[1].status, "in_progress");
});

test("Archive/restore, reusable saved views, and audited event replay", async () => {
  const { app, workspaceId, projectId } = await createWorkspace();
  const a = await createTask(app, workspaceId, projectId, "Write docs", {
    tags: ["docs"],
  });
  const b = await createTask(app, workspaceId, projectId, "Ship feature", {
    priority: "urgent",
    tags: ["release"],
  });
  const archived = value(
    await app.interact(
      "task.archive",
      {
        workspaceId,
        taskId: a.id,
        expectedVersion: a.version,
      },
      alice,
    ),
  ).task;
  assert.equal(archived.archived, true);
  assert.equal(
    value(await app.interact("task.search", { workspaceId }, alice)).total,
    1,
  );
  const restored = value(
    await app.interact(
      "task.restore",
      {
        workspaceId,
        taskId: a.id,
        expectedVersion: archived.version,
      },
      alice,
    ),
  ).task;
  assert.equal(restored.archived, false);
  const saved = value(
    await app.interact(
      "view.save",
      {
        workspaceId,
        name: "Release board",
        query: { priority: "urgent", tag: "release" },
      },
      alice,
    ),
  ).view;
  const results = value(
    await app.interact("view.run", { workspaceId, viewId: saved.id }, alice),
  );
  assert.equal(results.total, 1);
  assert.equal(results.items[0].id, b.id);
  assert.equal(
    value(await app.interact("view.list", { workspaceId }, alice)).views.length,
    1,
  );
  const events = [];
  for await (const event of app.observe(
    "activity.events",
    { workspaceId },
    { cursor: 0 },
    alice,
  ))
    events.push(event);
  assert.ok(events.length >= 6);
  assert.ok(events.every((e: any, i) => e.seq === i + 1));
  const denied = app.observe("activity.events", { workspaceId }, {}, bob);
  await assert.rejects(
    async () => {
      for await (const event of denied) void event;
    },
    (err: unknown) =>
      err instanceof ObservationDenied && err.code === "PERMISSION_DENIED",
  );
});

test("Invalid dates, parent relationships and unknown workspaces reject safely", async () => {
  const { app, workspaceId, projectId } = await createWorkspace();
  assert.equal(
    code(
      await app.interact(
        "task.create",
        {
          workspaceId,
          projectId,
          title: "Broken",
          dueAt: "not-a-date",
        },
        alice,
      ),
    ),
    "INVALID_DATA",
  );
  const task = await createTask(app, workspaceId, projectId, "Valid");
  assert.equal(
    code(
      await app.interact(
        "task.create",
        {
          workspaceId,
          projectId,
          title: "Wrong subtask",
          parentId: "missing",
        },
        alice,
      ),
    ),
    "INVALID_PARENT",
  );
  assert.equal(
    code(
      await app.interact(
        "task.get",
        {
          workspaceId: "other-workspace",
          taskId: task.id,
        },
        alice,
      ),
    ),
    "PERMISSION_DENIED",
  );
});
