import { match } from "ts-pattern";
/**
 * In-memory state model for the advanced Todo demo.
 * Not part of ANWA Core and not a persistent or transactional implementation.
 */
export type Role = "owner" | "editor" | "viewer";
export type Priority = "low" | "medium" | "high" | "urgent";
export type StoredStatus = "todo" | "in_progress" | "done";
export type Status = StoredStatus | "blocked";
export interface Workspace {
  id: string;
  name: string;
  members: Map<string, Role>;
}
export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  archived: boolean;
  version: number;
}
export interface Comment {
  author: string;
  body: string;
  at: string;
}
export interface Task {
  id: string;
  workspaceId: string;
  projectId: string;
  parentId?: string;
  title: string;
  notes?: string;
  status: StoredStatus;
  priority: Priority;
  dueAt?: string;
  tags: string[];
  assignee?: string;
  estimateMinutes?: number;
  recurrenceDays?: number;
  originId?: string;
  dependencies: string[];
  version: number;
  archived: boolean;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  comments: Comment[];
}
export interface TaskView extends Omit<Task, "status"> {
  status: Status;
}
export interface Audit {
  seq: number;
  at: string;
  actor: string;
  type: string;
  entity: string;
  entityId: string;
}
export interface SavedFilter {
  text?: string;
  projectId?: string;
  status?: Status;
  priority?: Priority;
  tag?: string;
  assignee?: string;
  dueBefore?: string;
  dueAfter?: string;
  includeArchived?: boolean;
  sortBy?: "dueAt" | "priority" | "createdAt" | "updatedAt" | "title";
  descending?: boolean;
}
export interface SavedView {
  id: string;
  workspaceId: string;
  name: string;
  query: SavedFilter;
  creator: string;
}
export interface SearchResult {
  items: TaskView[];
  total: number;
  offset: number;
  limit: number;
}

const priorityWeight: Record<Priority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};
export const isoNow = (): string => new Date().toISOString();
export const validDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(value) &&
  Number.isFinite(Date.parse(value));
export const addDays = (value: string, days: number): string =>
  new Date(Date.parse(value) + days * 86400000).toISOString();
export const normalizeTags = (tags: readonly string[]): string[] => [
  ...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean)),
];
export const validPositive = (n: number): boolean =>
  Number.isInteger(n) && n > 0;
export const validNonnegative = (n: number): boolean =>
  Number.isInteger(n) && n >= 0;

function compareRank(a: string | number, b: string | number): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function createTodoState() {
  const workspaces = new Map<string, Workspace>();

  const projects = new Map<string, Project>();

  const tasks = new Map<string, Task>();

  const views = new Map<string, SavedView>();

  const activity = new Map<string, Audit[]>();

  let nextNumber = 1;

  function newId(prefix: string): string {
    return prefix + "-" + nextNumber++;
  }

  function workspace(id: string): Workspace | undefined {
    return workspaces.get(id);
  }

  function project(
    workspaceId: string,
    projectId: string,
  ): Project | undefined {
    const p = projects.get(projectId);
    return p?.workspaceId === workspaceId ? p : undefined;
  }

  function task(workspaceId: string, taskId: string): Task | undefined {
    const t = tasks.get(taskId);
    return t?.workspaceId === workspaceId ? t : undefined;
  }

  function view(workspaceId: string, viewId: string): SavedView | undefined {
    const v = views.get(viewId);
    return v?.workspaceId === workspaceId ? v : undefined;
  }

  function audit(
    workspaceId: string,
    actor: string,
    type: string,
    entity: string,
    entityId: string,
  ): void {
    const events = activity.get(workspaceId) ?? [];
    events.push({
      seq: events.length + 1,
      at: isoNow(),
      actor,
      type,
      entity,
      entityId,
    });
    activity.set(workspaceId, events);
  }

  function isBlocked(task: Task): boolean {
    return (
      task.status !== "done" &&
      task.dependencies.some((id) => tasks.get(id)?.status !== "done")
    );
  }

  function effectiveStatus(task: Task): Status {
    if (task.status === "done") return "done";
    return isBlocked(task) ? "blocked" : task.status;
  }

  function snapshot(task: Task): TaskView {
    // JSON has no undefined fields; optional values must be omitted, not emitted as undefined.
    const raw = {
      ...task,
      status: effectiveStatus(task),
      tags: [...task.tags],
      dependencies: [...task.dependencies],
      comments: task.comments.map((c) => ({ ...c })),
    };
    return Object.fromEntries(
      Object.entries(raw).filter(([, value]) => value !== undefined),
    ) as unknown as TaskView;
  }

  function touch(task: Task): void {
    task.version++;
    task.updatedAt = isoNow();
  }

  function tasksIn(workspaceId: string, includeArchived = false): Task[] {
    return [...tasks.values()].filter(
      (t) => t.workspaceId === workspaceId && (includeArchived || !t.archived),
    );
  }

  function createsCycle(taskId: string, dependsOnId: string): boolean {
    if (taskId === dependsOnId) return true;
    const visiting = new Set<string>();
    const visit = (id: string): boolean => {
      if (id === taskId) return true;
      if (visiting.has(id)) return false;
      visiting.add(id);
      const task = tasks.get(id);
      return !!task?.dependencies.some(visit);
    };
    return visit(dependsOnId);
  }

  function search(
    workspaceId: string,
    filter: SavedFilter,
    offset = 0,
    limit = 30,
  ): SearchResult {
    let items = tasksIn(workspaceId, filter.includeArchived);
    if (filter.text) {
      const text = filter.text.toLowerCase().trim();
      items = items.filter((t) =>
        (t.title + " " + (t.notes ?? "")).toLowerCase().includes(text),
      );
    }
    if (filter.projectId)
      items = items.filter((t) => t.projectId === filter.projectId);
    if (filter.status)
      items = items.filter((t) => effectiveStatus(t) === filter.status);
    if (filter.priority)
      items = items.filter((t) => t.priority === filter.priority);
    if (filter.tag)
      items = items.filter((t) =>
        t.tags.includes(filter.tag!.toLowerCase().trim()),
      );
    if (filter.assignee)
      items = items.filter((t) => t.assignee === filter.assignee);
    if (filter.dueBefore)
      items = items.filter(
        (t) => t.dueAt !== undefined && t.dueAt <= filter.dueBefore!,
      );
    if (filter.dueAfter)
      items = items.filter(
        (t) => t.dueAt !== undefined && t.dueAt >= filter.dueAfter!,
      );
    const order = filter.descending ? -1 : 1;
    const sortBy = filter.sortBy ?? "updatedAt";
    const rank = (task: Task): string | number =>
      match(sortBy)
        .with("priority", () => priorityWeight[task.priority])
        .with("title", () => task.title.toLowerCase())
        .with("dueAt", () => task.dueAt ?? "9999-12-31")
        .with("createdAt", "updatedAt", (key) => task[key])
        .exhaustive();
    items.sort((a, b) => {
      const av = rank(a),
        bv = rank(b);
      const orderValue = compareRank(av, bv);
      return order * orderValue || a.id.localeCompare(b.id);
    });
    return {
      items: items.slice(offset, offset + limit).map((t) => snapshot(t)),
      total: items.length,
      offset,
      limit,
    };
  }

  function priorityScore(task: Task): number {
    const due = task.dueAt ? Date.parse(task.dueAt) - Date.now() : Infinity;
    const urgency =
      [
        { before: 0, points: 200 },
        { before: 86400000, points: 100 },
        { before: 604800000, points: 40 },
      ].find((rule) => due < rule.before)?.points ?? 0;
    return priorityWeight[task.priority] * 100 + urgency;
  }

  return {
    workspaces,
    projects,
    tasks,
    views,
    activity,
    newId,
    workspace,
    project,
    task,
    view,
    audit,
    isBlocked,
    effectiveStatus,
    snapshot,
    touch,
    tasksIn,
    createsCycle,
    search,
    priorityScore,
  };
}
export type TodoState = ReturnType<typeof createTodoState>;
