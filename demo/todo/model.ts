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
export interface TaskView extends Omit<Task, "status"> { status: Status }
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
export interface SearchResult { items: TaskView[]; total: number; offset: number; limit: number }

const priorityWeight: Record<Priority, number> = {low:1, medium:2, high:3, urgent:4};
export const isoNow = (): string => new Date().toISOString();
export const validDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(value)
  && Number.isFinite(Date.parse(value));
export const addDays = (value: string, days: number): string =>
  new Date(Date.parse(value) + days * 86400000).toISOString();
export const normalizeTags = (tags: readonly string[]): string[] =>
  [...new Set(tags.map(t=>t.trim().toLowerCase()).filter(Boolean))];
export const validPositive = (n: number): boolean => Number.isInteger(n) && n > 0;
export const validNonnegative = (n: number): boolean => Number.isInteger(n) && n >= 0;

export class TodoState {
  readonly workspaces = new Map<string, Workspace>();
  readonly projects = new Map<string, Project>();
  readonly tasks = new Map<string, Task>();
  readonly views = new Map<string, SavedView>();
  readonly activity = new Map<string, Audit[]>();
  private nextNumber = 1;

  newId(prefix: string): string { return prefix + "-" + this.nextNumber++; }
  workspace(id: string): Workspace | undefined { return this.workspaces.get(id); }
  project(workspaceId: string, projectId: string): Project | undefined {
    const p = this.projects.get(projectId);
    return p?.workspaceId === workspaceId ? p : undefined;
  }
  task(workspaceId: string, taskId: string): Task | undefined {
    const t = this.tasks.get(taskId);
    return t?.workspaceId === workspaceId ? t : undefined;
  }
  view(workspaceId: string, viewId: string): SavedView | undefined {
    const v = this.views.get(viewId);
    return v?.workspaceId === workspaceId ? v : undefined;
  }
  audit(workspaceId: string, actor: string, type: string, entity: string, entityId: string): void {
    const events = this.activity.get(workspaceId) ?? [];
    events.push({seq:events.length + 1, at:isoNow(), actor, type, entity, entityId});
    this.activity.set(workspaceId, events);
  }
  isBlocked(task: Task): boolean {
    return task.status !== "done" && task.dependencies.some(id =>
      this.tasks.get(id)?.status !== "done");
  }
  effectiveStatus(task: Task): Status {
    return task.status === "done" ? "done" : this.isBlocked(task) ? "blocked" : task.status;
  }
  snapshot(task: Task): TaskView {
    return {...task, status:this.effectiveStatus(task), tags:[...task.tags],
      dependencies:[...task.dependencies],comments:task.comments.map(c=>({...c}))};
  }
  touch(task: Task): void { task.version++; task.updatedAt = isoNow(); }
  tasksIn(workspaceId: string, includeArchived = false): Task[] {
    return [...this.tasks.values()].filter(t => t.workspaceId === workspaceId &&
      (includeArchived || !t.archived));
  }
  createsCycle(taskId: string, dependsOnId: string): boolean {
    if(taskId === dependsOnId) return true;
    const visiting = new Set<string>();
    const visit = (id: string): boolean => {
      if(id === taskId) return true;
      if(visiting.has(id)) return false;
      visiting.add(id);
      const task = this.tasks.get(id);
      return !!task?.dependencies.some(visit);
    };
    return visit(dependsOnId);
  }
  search(workspaceId: string, filter: SavedFilter, offset = 0, limit = 30): SearchResult {
    let items = this.tasksIn(workspaceId, filter.includeArchived);
    if(filter.text) {
      const text = filter.text.toLowerCase().trim();
      items = items.filter(t=>(t.title+" "+(t.notes??"")).toLowerCase().includes(text));
    }
    if(filter.projectId) items = items.filter(t=>t.projectId===filter.projectId);
    if(filter.status) items = items.filter(t=>this.effectiveStatus(t)===filter.status);
    if(filter.priority) items = items.filter(t=>t.priority===filter.priority);
    if(filter.tag) items = items.filter(t=>t.tags.includes(filter.tag!.toLowerCase().trim()));
    if(filter.assignee) items = items.filter(t=>t.assignee===filter.assignee);
    if(filter.dueBefore) items = items.filter(t=>t.dueAt!==undefined && t.dueAt<=filter.dueBefore!);
    if(filter.dueAfter) items = items.filter(t=>t.dueAt!==undefined && t.dueAt>=filter.dueAfter!);
    const order = filter.descending ? -1 : 1;
    const sortBy = filter.sortBy ?? "updatedAt";
    const rank = (t: Task): string | number => sortBy === "priority" ?
      priorityWeight[t.priority] : sortBy === "title" ? t.title.toLowerCase()
        : sortBy === "dueAt" ? t.dueAt ?? "9999-12-31" : t[sortBy];
    items.sort((a,b) => {
      const av=rank(a), bv=rank(b);
      const orderValue=av < bv ? -1 : av > bv ? 1 : 0;
      return order*orderValue || a.id.localeCompare(b.id);
    });
    return {items:items.slice(offset,offset+limit).map(t=>this.snapshot(t)),
      total:items.length, offset, limit};
  }
  priorityScore(task: Task): number {
    const due = task.dueAt ? Date.parse(task.dueAt)-Date.now() : Infinity;
    const urgency = due < 0 ? 200 : due < 86400000 ? 100 : due < 604800000 ? 40 : 0;
    return priorityWeight[task.priority]*100 + urgency;
  }
}
