/** Advanced Todo rules: each case owns its workspace, identities and preconditions. */
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { createTodo } from "../demo/todo/index.ts";
import { success, failure } from "./support/outcome.ts";
const alice = { caller: { subject: "alice" } } as const;
const bob = { caller: { subject: "bob" } } as const;

async function workspace() {
  const app = createTodo();
  const { workspace } = success(
    await app.interact("workspace.create", { name: "Engineering" }, alice),
  );
  const { project } = success(
    await app.interact(
      "project.create",
      { workspaceId: workspace.id, name: "Product" },
      alice,
    ),
  );
  return { app, workspaceId: workspace.id, projectId: project.id };
}
type Fixture = Awaited<ReturnType<typeof workspace>>;
async function task(
  f: Fixture,
  title = "Work",
  options: Record<string, unknown> = {},
) {
  return success(
    await f.app.interact(
      "task.create",
      { workspaceId: f.workspaceId, projectId: f.projectId, title, ...options },
      alice,
    ),
  ).task;
}
async function read(f: Fixture, taskId: string) {
  return success(
    await f.app.interact(
      "task.get",
      { workspaceId: f.workspaceId, taskId },
      alice,
    ),
  ).task;
}
async function events(f: Fixture, cursor = 0) {
  const result: Array<{ seq: number; type: string; entityId: string }> = [];
  for await (const item of f.app.observe(
    "activity.events",
    { workspaceId: f.workspaceId },
    { cursor },
    alice,
  ))
    result.push(item as (typeof result)[number]);
  return result;
}

describe("TODO ACCESS — roles grant specific capabilities, not blanket write access", () => {
  const roles = [
    { name: "nonmember", role: null, read: false, write: false, manage: false },
    { name: "viewer", role: "viewer", read: true, write: false, manage: false },
    { name: "editor", role: "editor", read: true, write: true, manage: false },
    { name: "owner", role: "owner", read: true, write: true, manage: true },
  ] as const;
  const operations = [
    {
      name: "dashboard",
      ref: "workspace.dashboard",
      permission: "read",
      extra: {},
    },
    {
      name: "create task",
      ref: "task.create",
      permission: "write",
      extra: { title: "New" },
    },
    {
      name: "invite member",
      ref: "workspace.invite",
      permission: "manage",
      extra: { subject: "carol", role: "viewer" },
    },
  ] as const;
  test.each(
    roles.flatMap((role) =>
      operations.map((op) => ({ name: `${role.name}: ${op.name}`, role, op })),
    ),
  )("$name", async ({ role, op }) => {
    const f = await workspace();
    if (role.role && role.role !== "owner")
      success(
        await f.app.interact(
          "workspace.invite",
          { workspaceId: f.workspaceId, subject: "bob", role: role.role },
          alice,
        ),
      );
    const before = await events(f);
    const input =
      op.ref === "task.create"
        ? { workspaceId: f.workspaceId, projectId: f.projectId, ...op.extra }
        : { workspaceId: f.workspaceId, ...op.extra };
    const response = await f.app.follow(
      { ref: op.ref, input },
      role.role === "owner" ? alice : bob,
    );
    if (role[op.permission]) success(response);
    else {
      failure(response, "PERMISSION_DENIED");
      assert.deepEqual(
        await events(f),
        before,
        "refused operations emit no mutation audit",
      );
      assert.equal(
        success(
          await f.app.interact(
            "task.list",
            { workspaceId: f.workspaceId },
            alice,
          ),
        ).total,
        0,
      );
    }
  });
  test("anonymous callers cannot create a workspace or discover private operations", async () => {
    const app = createTodo();
    assert.deepEqual(app.catalog().interactions, []);
    failure(
      await app.interact("workspace.create", { name: "Nope" }),
      "AUTH_REQUIRED",
    );
    assert.deepEqual(
      success(await app.interact("workspace.list", undefined, alice))
        .workspaces,
      [],
    );
  });
  test("factory instances do not share workspace state", async () => {
    const first = await workspace();
    const second = createTodo();
    assert.equal(
      success(await first.app.interact("workspace.list", undefined, alice))
        .workspaces.length,
      1,
    );
    assert.deepEqual(
      success(await second.interact("workspace.list", undefined, alice))
        .workspaces,
      [],
    );
  });
});

describe("TODO INPUT — invalid task creation has no state or audit effects", () => {
  test.each([
    { name: "blank title", extra: { title: " " }, code: "INVALID_DATA" },
    {
      name: "invalid date",
      extra: { dueAt: "not-a-date" },
      code: "INVALID_DATA",
    },
    {
      name: "missing parent",
      extra: { parentId: "missing" },
      code: "INVALID_PARENT",
    },
    {
      name: "unknown project",
      extra: { projectId: "missing" },
      code: "PROJECT_NOT_FOUND",
    },
    {
      name: "nonmember assignee",
      extra: { assignee: "stranger" },
      code: "INVALID_DATA",
    },
    {
      name: "negative estimate",
      extra: { estimateMinutes: -1 },
      code: "INVALID_DATA",
    },
  ])("$name", async ({ extra, code }) => {
    const f = await workspace();
    const before = await events(f);
    const response = await f.app.follow(
      {
        ref: "task.create",
        input: {
          workspaceId: f.workspaceId,
          projectId: f.projectId,
          title: "Work",
          ...extra,
        },
      },
      alice,
    );
    failure(response, code);
    assert.equal(
      success(
        await f.app.interact(
          "task.list",
          { workspaceId: f.workspaceId },
          alice,
        ),
      ).total,
      0,
    );
    assert.deepEqual(await events(f), before);
  });
});

describe("TODO QUERY — filters and derived views reflect the same tasks", () => {
  test.each([
    {
      name: "title search",
      ref: "task.search",
      filter: { text: "FEATURE" },
      total: 1,
      title: "Implement feature",
    },
    {
      name: "case-normalized tag search",
      ref: "task.search",
      filter: { tag: "FRONTEND" },
      total: 1,
      title: "Implement feature",
    },
    {
      name: "priority search",
      ref: "task.search",
      filter: { priority: "urgent" },
      total: 1,
      title: "Plan milestone",
    },
    {
      name: "no match",
      ref: "task.search",
      filter: { text: "not present" },
      total: 0,
      title: null,
    },
  ])("$name", async ({ ref, filter, total, title }) => {
    const f = await workspace();
    await task(f, "Plan milestone", {
      priority: "urgent",
      tags: ["Work", "Q4", "work"],
    });
    await task(f, "Implement feature", {
      priority: "high",
      tags: ["frontend"],
    });
    const response = await f.app.follow(
      { ref, input: { workspaceId: f.workspaceId, ...filter } },
      alice,
    );
    const result = success(response) as {
      items: Array<{ title: string }>;
      total: number;
    };
    assert.equal(result.total, total);
    assert.deepEqual(
      result.items.map((item) => item.title),
      title === null ? [] : [title],
    );
  });
  test("hierarchical tasks normalize tags, and update appears in board and planner", async () => {
    const f = await workspace();
    const parent = await task(f, "Plan milestone", {
      priority: "urgent",
      tags: ["Work", "Q4", "work"],
    });
    const child = await task(f, "Implement feature", {
      parentId: parent.id,
      priority: "high",
    });
    assert.deepEqual(parent.tags, ["work", "q4"]);
    assert.equal(child.parentId, parent.id);
    const updated = success(
      await f.app.interact(
        "task.update",
        {
          workspaceId: f.workspaceId,
          taskId: child.id,
          expectedVersion: child.version,
          patch: {
            status: "in_progress",
            notes: "Prototype",
            assignee: "alice",
          },
        },
        alice,
      ),
    ).task;
    assert.equal(updated.version, child.version + 1);
    const subtasks = success(
      await f.app.interact(
        "task.list",
        {
          workspaceId: f.workspaceId,
          projectId: f.projectId,
          parentId: parent.id,
        },
        alice,
      ),
    );
    assert.deepEqual(
      subtasks.items.map((t) => t.id),
      [child.id],
    );
    const board = success(
      await f.app.interact("task.board", { workspaceId: f.workspaceId }, alice),
    );
    assert.deepEqual(
      board.in_progress.map((t) => t.id),
      [child.id],
    );
    assert.deepEqual(
      success(
        await f.app.interact(
          "task.plan",
          { workspaceId: f.workspaceId },
          alice,
        ),
      ).items.map((t) => t.id),
      [parent.id, child.id],
    );
    assert.equal(
      success(
        await f.app.interact(
          "workspace.dashboard",
          { workspaceId: f.workspaceId },
          alice,
        ),
      ).total,
      2,
    );
  });
});

describe("TODO VERSION — stale writes recommend a fresh read and leave the task unchanged", () => {
  test.each([
    {
      name: "update",
      ref: "task.update",
      extra: { patch: { title: "Changed" } },
    },
    { name: "complete", ref: "task.complete", extra: {} },
    { name: "archive", ref: "task.archive", extra: {} },
  ])("$name", async ({ ref, extra }) => {
    const f = await workspace();
    const item = await task(f);
    const before = await events(f);
    const response = await f.app.follow(
      {
        ref,
        input: {
          workspaceId: f.workspaceId,
          taskId: item.id,
          expectedVersion: item.version + 1,
          ...extra,
        },
      },
      alice,
    );
    failure(response, "VERSION_CONFLICT");
    assert.deepEqual(response.context.next[0], {
      ref: "task.get",
      input: { workspaceId: f.workspaceId, taskId: item.id },
      guidance: { level: "recommended" },
    });
    assert.deepEqual(await read(f, item.id), item);
    assert.deepEqual(await events(f), before);
  });
});

describe("TODO DEPENDENCY — blocked work cannot complete and cycles cannot form", () => {
  test("complete prerequisite, then dependent; refusal offers the prerequisite", async () => {
    const f = await workspace();
    const design = await task(f, "Design");
    const implementation = await task(f, "Implement");
    const dependent = success(
      await f.app.interact(
        "task.dependency.add",
        {
          workspaceId: f.workspaceId,
          taskId: implementation.id,
          dependsOnId: design.id,
          expectedVersion: implementation.version,
        },
        alice,
      ),
    ).task;
    assert.equal(dependent.status, "blocked");
    const blocked = await f.app.interact(
      "task.complete",
      {
        workspaceId: f.workspaceId,
        taskId: dependent.id,
        expectedVersion: dependent.version,
      },
      alice,
    );
    failure(blocked, "DEPENDENCY_BLOCKED");
    assert.deepEqual(blocked.context.next[0].input, {
      workspaceId: f.workspaceId,
      taskId: design.id,
    });
    assert.deepEqual(await read(f, dependent.id), dependent);
    failure(
      await f.app.interact(
        "task.dependency.add",
        {
          workspaceId: f.workspaceId,
          taskId: design.id,
          dependsOnId: dependent.id,
          expectedVersion: design.version,
        },
        alice,
      ),
      "DEPENDENCY_CYCLE",
    );
    assert.deepEqual(await read(f, design.id), design);
    success(
      await f.app.interact(
        "task.complete",
        {
          workspaceId: f.workspaceId,
          taskId: design.id,
          expectedVersion: design.version,
        },
        alice,
      ),
    );
    assert.equal(
      success(
        await f.app.interact(
          "task.complete",
          {
            workspaceId: f.workspaceId,
            taskId: dependent.id,
            expectedVersion: dependent.version,
          },
          alice,
        ),
      ).task.status,
      "done",
    );
  });
});

describe("TODO LIFECYCLE — forward and reverse transitions increment versions", () => {
  test.each([
    {
      name: "archive then restore",
      first: "task.archive",
      second: "task.restore",
      property: "archived",
      intermediate: true,
      final: false,
    },
    {
      name: "complete then reopen",
      first: "task.complete",
      second: "task.reopen",
      property: "status",
      intermediate: "done",
      final: "todo",
    },
  ])("$name", async ({ first, second, property, intermediate, final }) => {
    const f = await workspace();
    const item = await task(f);
    const mutate = async (ref: string, expectedVersion: number) => {
      const response = await f.app.follow(
        {
          ref,
          input: {
            workspaceId: f.workspaceId,
            taskId: item.id,
            expectedVersion,
          },
        },
        alice,
      );
      return (success(response) as { task: typeof item }).task;
    };
    const next = await mutate(first, item.version);
    assert.equal((next as any)[property], intermediate);
    assert.equal(next.version, item.version + 1);
    const restored = await mutate(second, next.version);
    assert.equal((restored as any)[property], final);
    assert.equal(restored.version, item.version + 2);
  });
  test("recurring completion creates one successor with advanced due date and origin", async () => {
    const f = await workspace();
    const item = await task(f, "Daily", {
      recurrenceDays: 1,
      dueAt: "2030-01-01",
    });
    const result = success(
      await f.app.interact(
        "task.complete",
        {
          workspaceId: f.workspaceId,
          taskId: item.id,
          expectedVersion: item.version,
        },
        alice,
      ),
    );
    assert.ok(result.spawnedId);
    const spawned = await read(f, result.spawnedId);
    assert.equal(spawned.originId, item.id);
    assert.equal(spawned.dueAt, "2030-01-02T00:00:00.000Z");
    assert.equal(spawned.status, "todo");
    assert.equal(
      success(
        await f.app.interact(
          "task.list",
          { workspaceId: f.workspaceId },
          alice,
        ),
      ).total,
      2,
    );
  });
});

describe("TODO BULK — all validation precedes the first mutation", () => {
  test.each([
    { name: "stale second item", error: "VERSION_CONFLICT", mode: "stale" },
    { name: "duplicated task", error: "DUPLICATE_ITEM", mode: "duplicate" },
    { name: "empty second patch", error: "INVALID_DATA", mode: "empty" },
  ])("$name rejects the entire batch", async ({ error, mode }) => {
    const f = await workspace();
    const a = await task(f, "One");
    const b = await task(f, "Two");
    const before = await events(f);
    const response = await f.app.interact(
      "task.bulkUpdate",
      {
        workspaceId: f.workspaceId,
        updates: [
          {
            taskId: a.id,
            expectedVersion: a.version,
            patch: { priority: "urgent" },
          },
          {
            taskId: mode === "duplicate" ? a.id : b.id,
            expectedVersion: mode === "stale" ? 999 : b.version,
            patch: mode === "empty" ? {} : { priority: "high" },
          },
        ],
      },
      alice,
    );
    failure(response, error);
    assert.deepEqual(await read(f, a.id), a);
    assert.deepEqual(await read(f, b.id), b);
    assert.deepEqual(await events(f), before);
  });
  test("valid batch updates every item once", async () => {
    const f = await workspace();
    const a = await task(f, "One");
    const b = await task(f, "Two");
    const result = success(
      await f.app.interact(
        "task.bulkUpdate",
        {
          workspaceId: f.workspaceId,
          updates: [
            {
              taskId: a.id,
              expectedVersion: a.version,
              patch: { priority: "urgent" },
            },
            {
              taskId: b.id,
              expectedVersion: b.version,
              patch: { status: "in_progress" },
            },
          ],
        },
        alice,
      ),
    );
    assert.equal(result.count, 2);
    assert.deepEqual(
      result.items.map((t) => [t.id, t.version, t.priority, t.status]),
      [
        [a.id, 2, "urgent", "todo"],
        [b.id, 2, "medium", "in_progress"],
      ],
    );
  });
});

describe("TODO VIEW — saved filter is reusable and audit replay obeys cursor", () => {
  test("saved release filter returns only its matching task", async () => {
    const f = await workspace();
    await task(f, "Docs", { tags: ["docs"] });
    const release = await task(f, "Release", {
      tags: ["release"],
      priority: "urgent",
    });
    const { view } = success(
      await f.app.interact(
        "view.save",
        {
          workspaceId: f.workspaceId,
          name: "Release",
          query: { tag: "release", priority: "urgent" },
        },
        alice,
      ),
    );
    assert.deepEqual(
      success(
        await f.app.interact(
          "view.run",
          { workspaceId: f.workspaceId, viewId: view.id },
          alice,
        ),
      ).items.map((t) => t.id),
      [release.id],
    );
    assert.deepEqual(
      success(
        await f.app.interact(
          "view.list",
          { workspaceId: f.workspaceId },
          alice,
        ),
      ).views.map((v) => v.id),
      [view.id],
    );
  });
  test.each([
    {
      name: "from beginning",
      cursor: 0,
      sequences: [1, 2, 3, 4],
      types: [
        "workspace.created",
        "project.created",
        "task.created",
        "task.commented",
      ],
    },
    {
      name: "after third message",
      cursor: 3,
      sequences: [4],
      types: ["task.commented"],
    },
    { name: "after stream end", cursor: 4, sequences: [], types: [] },
  ])("audit replay $name", async ({ cursor, sequences, types }) => {
    const f = await workspace();
    const item = await task(f);
    const commented = success(
      await f.app.interact(
        "task.comment",
        { workspaceId: f.workspaceId, taskId: item.id, body: "Reviewed" },
        alice,
      ),
    ).task;
    assert.deepEqual(
      commented.comments?.map((c) => [c.author, c.body]),
      [["alice", "Reviewed"]],
    );
    const replay = await events(f, cursor);
    assert.deepEqual(
      replay.map((event) => event.seq),
      sequences,
    );
    assert.deepEqual(
      replay.map((event) => event.type),
      types,
    );
  });
});
