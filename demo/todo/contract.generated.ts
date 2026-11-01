// AUTO-GENERATED from anwa.json; do not edit. Run bun run codegen.
import type { Manifest } from "../../src/schema-tools.ts";
export const schema = {
  anwa: "0.2",
  entrypoints: [
    "workspace.create",
    "workspace.list",
    "workspace.dashboard",
    "project.list",
    "task.search",
    "task.plan",
  ],
  interactions: {
    "workspace.create": {
      kind: "action",
      description: "Create a workspace owned by the verified caller.",
      guard: "requireCaller",
      input: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Concise title",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          workspace: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Workspace identifier",
              },
              name: {
                type: "string",
                description: "Concise title",
              },
              role: {
                type: "string",
                enum: ["owner", "editor", "viewer"],
                description: "Membership role",
              },
              members: {
                type: "integer",
                description: "Member count",
              },
            },
            required: ["id", "name", "role", "members"],
            additionalProperties: false,
          },
        },
        required: ["workspace"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        INVALID_DATA: "Invalid domain data or unsupported transition.",
      },
      hasSideEffects: true,
      idempotent: false,
    },
    "workspace.list": {
      kind: "query",
      description: "List workspaces accessible to the verified caller.",
      guard: "requireCaller",
      output: {
        type: "object",
        properties: {
          workspaces: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Workspace identifier",
                },
                name: {
                  type: "string",
                  description: "Concise title",
                },
                role: {
                  type: "string",
                  enum: ["owner", "editor", "viewer"],
                  description: "Membership role",
                },
                members: {
                  type: "integer",
                  description: "Member count",
                },
              },
              required: ["id", "name", "role", "members"],
              additionalProperties: false,
            },
          },
        },
        required: ["workspaces"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
      },
    },
    "workspace.invite": {
      kind: "action",
      description: "Add an editor or viewer to a workspace; owner only.",
      guard: "canManageWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          subject: {
            type: "string",
            description: "Member subject",
          },
          role: {
            type: "string",
            enum: ["editor", "viewer"],
            description: "Role",
          },
        },
        required: ["workspaceId", "subject", "role"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          member: {
            type: "object",
            properties: {
              subject: {
                type: "string",
                description: "Subject",
              },
              role: {
                type: "string",
                enum: ["editor", "viewer"],
                description: "Role",
              },
            },
            required: ["subject", "role"],
            additionalProperties: false,
          },
        },
        required: ["member"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        MEMBER_EXISTS: "Member is already in this workspace.",
        INVALID_DATA: "Invalid domain data or unsupported transition.",
      },
      hasSideEffects: true,
      idempotent: false,
    },
    "workspace.members": {
      kind: "query",
      description: "List the members and roles in a workspace.",
      guard: "canReadWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
        },
        required: ["workspaceId"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          members: {
            type: "array",
            items: {
              type: "object",
              properties: {
                subject: {
                  type: "string",
                  description: "Subject",
                },
                role: {
                  type: "string",
                  enum: ["owner", "editor", "viewer"],
                  description: "Role",
                },
              },
              required: ["subject", "role"],
              additionalProperties: false,
            },
          },
        },
        required: ["members"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
      },
    },
    "workspace.dashboard": {
      kind: "query",
      description:
        "Get task counts, overdue work, due-soon work and project progress.",
      guard: "canReadWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
        },
        required: ["workspaceId"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          total: {
            type: "integer",
            description: "Tasks",
          },
          done: {
            type: "integer",
            description: "Completed",
          },
          overdue: {
            type: "integer",
            description: "Overdue",
          },
          dueSoon: {
            type: "integer",
            description: "Due soon",
          },
          byStatus: {
            type: "object",
            properties: {
              todo: {
                type: "integer",
                description: "Todo",
              },
              in_progress: {
                type: "integer",
                description: "In progress",
              },
              blocked: {
                type: "integer",
                description: "Blocked",
              },
              done: {
                type: "integer",
                description: "Done",
              },
            },
            required: ["todo", "in_progress", "blocked", "done"],
            additionalProperties: false,
          },
          byProject: {
            type: "array",
            items: {
              type: "object",
              properties: {
                projectId: {
                  type: "string",
                  description: "Project identifier",
                },
                name: {
                  type: "string",
                  description: "Concise title",
                },
                total: {
                  type: "integer",
                  description: "Total",
                },
                done: {
                  type: "integer",
                  description: "Completed",
                },
              },
              required: ["projectId", "name", "total", "done"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "total",
          "done",
          "overdue",
          "dueSoon",
          "byStatus",
          "byProject",
        ],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
      },
    },
    "project.create": {
      kind: "action",
      description: "Create a project in a workspace.",
      guard: "canWriteWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          name: {
            type: "string",
            description: "Concise title",
          },
          description: {
            type: "string",
            description: "Description",
          },
        },
        required: ["workspaceId", "name"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          project: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Project identifier",
              },
              workspaceId: {
                type: "string",
                description: "Workspace identifier",
              },
              name: {
                type: "string",
                description: "Concise title",
              },
              description: {
                type: "string",
                description: "Description",
              },
              archived: {
                type: "boolean",
                description: "Archived",
              },
              version: {
                type: "integer",
                description: "Version",
              },
            },
            required: ["id", "workspaceId", "name", "archived", "version"],
            additionalProperties: false,
          },
        },
        required: ["project"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        INVALID_DATA: "Invalid domain data or unsupported transition.",
      },
      hasSideEffects: true,
      idempotent: false,
    },
    "project.list": {
      kind: "query",
      description: "List projects in a workspace.",
      guard: "canReadWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          includeArchived: {
            type: "boolean",
            description: "Include archived",
          },
        },
        required: ["workspaceId"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          projects: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Project identifier",
                },
                workspaceId: {
                  type: "string",
                  description: "Workspace identifier",
                },
                name: {
                  type: "string",
                  description: "Concise title",
                },
                description: {
                  type: "string",
                  description: "Description",
                },
                archived: {
                  type: "boolean",
                  description: "Archived",
                },
                version: {
                  type: "integer",
                  description: "Version",
                },
              },
              required: ["id", "workspaceId", "name", "archived", "version"],
              additionalProperties: false,
            },
          },
        },
        required: ["projects"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
      },
    },
    "project.update": {
      kind: "action",
      description:
        "Rename, describe or archive a project with optimistic concurrency.",
      guard: "canWriteWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          projectId: {
            type: "string",
            description: "Project identifier",
          },
          expectedVersion: {
            type: "integer",
            description: "Required current version",
          },
          name: {
            type: "string",
            description: "Concise title",
          },
          description: {
            type: "string",
            description: "Description",
          },
          archived: {
            type: "boolean",
            description: "Archived",
          },
        },
        required: ["workspaceId", "projectId", "expectedVersion"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          project: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Project identifier",
              },
              workspaceId: {
                type: "string",
                description: "Workspace identifier",
              },
              name: {
                type: "string",
                description: "Concise title",
              },
              description: {
                type: "string",
                description: "Description",
              },
              archived: {
                type: "boolean",
                description: "Archived",
              },
              version: {
                type: "integer",
                description: "Version",
              },
            },
            required: ["id", "workspaceId", "name", "archived", "version"],
            additionalProperties: false,
          },
        },
        required: ["project"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        PROJECT_NOT_FOUND: "Project not found in this workspace.",
        VERSION_CONFLICT: "Resource version changed. Re-read before updating.",
        INVALID_DATA: "Invalid domain data or unsupported transition.",
      },
      hasSideEffects: true,
      idempotent: false,
    },
    "task.create": {
      kind: "action",
      description:
        "Create a task, including an optional subtask, assignee, deadline, tags and recurring interval.",
      guard: "canWriteWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          projectId: {
            type: "string",
            description: "Project identifier",
          },
          title: {
            type: "string",
            description: "Concise title",
          },
          notes: {
            type: "string",
            description: "Notes",
          },
          parentId: {
            type: "string",
            description: "Task identifier",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "urgent"],
            description: "Task priority",
          },
          dueAt: {
            type: "string",
            description: "ISO due time",
          },
          tags: {
            type: "array",
            items: {
              type: "string",
              description: "Tag",
            },
          },
          assignee: {
            type: "string",
            description: "Member subject",
          },
          estimateMinutes: {
            type: "integer",
            description: "Minutes",
          },
          recurrenceDays: {
            type: "integer",
            description: "Interval days",
          },
        },
        required: ["workspaceId", "projectId", "title"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          task: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Task identifier",
              },
              workspaceId: {
                type: "string",
                description: "Workspace identifier",
              },
              projectId: {
                type: "string",
                description: "Project identifier",
              },
              title: {
                type: "string",
                description: "Concise title",
              },
              status: {
                type: "string",
                enum: ["todo", "in_progress", "blocked", "done"],
                description: "Current or computed effective status",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                description: "Task priority",
              },
              tags: {
                type: "array",
                items: {
                  type: "string",
                  description: "Tag",
                },
                description: "Tags",
              },
              dependencies: {
                type: "array",
                items: {
                  type: "string",
                  description: "Task identifier",
                },
                description: "Task dependencies",
              },
              archived: {
                type: "boolean",
                description: "Whether archived",
              },
              version: {
                type: "integer",
                description: "Optimistic concurrency version",
              },
              notes: {
                type: "string",
                description: "Notes",
              },
              parentId: {
                type: "string",
                description: "Task identifier",
              },
              dueAt: {
                type: "string",
                description: "ISO 8601 date/time",
              },
              assignee: {
                type: "string",
                description: "Member subject",
              },
              recurrenceDays: {
                type: "integer",
                description: "Recur every N days",
              },
              originId: {
                type: "string",
                description: "Task identifier",
              },
              completedAt: {
                type: "string",
                description: "ISO time",
              },
              createdAt: {
                type: "string",
                description: "ISO time",
              },
              updatedAt: {
                type: "string",
                description: "ISO time",
              },
              comments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    author: {
                      type: "string",
                      description: "Author",
                    },
                    body: {
                      type: "string",
                      description: "Comment",
                    },
                    at: {
                      type: "string",
                      description: "Time",
                    },
                  },
                  required: ["author", "body", "at"],
                  additionalProperties: false,
                },
                description: "Comments",
              },
            },
            required: [
              "id",
              "workspaceId",
              "projectId",
              "title",
              "status",
              "priority",
              "tags",
              "dependencies",
              "archived",
              "version",
            ],
            additionalProperties: false,
          },
        },
        required: ["task"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        PROJECT_NOT_FOUND: "Project not found in this workspace.",
        INVALID_PARENT: "Parent task is not valid for this project.",
        INVALID_DATA: "Invalid domain data or unsupported transition.",
      },
      hasSideEffects: true,
      idempotent: false,
    },
    "task.get": {
      kind: "query",
      description:
        "Read one task, its comments, effective blocked status and version.",
      guard: "canReadWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          taskId: {
            type: "string",
            description: "Task identifier",
          },
        },
        required: ["workspaceId", "taskId"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          task: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Task identifier",
              },
              workspaceId: {
                type: "string",
                description: "Workspace identifier",
              },
              projectId: {
                type: "string",
                description: "Project identifier",
              },
              title: {
                type: "string",
                description: "Concise title",
              },
              status: {
                type: "string",
                enum: ["todo", "in_progress", "blocked", "done"],
                description: "Current or computed effective status",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                description: "Task priority",
              },
              tags: {
                type: "array",
                items: {
                  type: "string",
                  description: "Tag",
                },
                description: "Tags",
              },
              dependencies: {
                type: "array",
                items: {
                  type: "string",
                  description: "Task identifier",
                },
                description: "Task dependencies",
              },
              archived: {
                type: "boolean",
                description: "Whether archived",
              },
              version: {
                type: "integer",
                description: "Optimistic concurrency version",
              },
              notes: {
                type: "string",
                description: "Notes",
              },
              parentId: {
                type: "string",
                description: "Task identifier",
              },
              dueAt: {
                type: "string",
                description: "ISO 8601 date/time",
              },
              assignee: {
                type: "string",
                description: "Member subject",
              },
              recurrenceDays: {
                type: "integer",
                description: "Recur every N days",
              },
              originId: {
                type: "string",
                description: "Task identifier",
              },
              completedAt: {
                type: "string",
                description: "ISO time",
              },
              createdAt: {
                type: "string",
                description: "ISO time",
              },
              updatedAt: {
                type: "string",
                description: "ISO time",
              },
              comments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    author: {
                      type: "string",
                      description: "Author",
                    },
                    body: {
                      type: "string",
                      description: "Comment",
                    },
                    at: {
                      type: "string",
                      description: "Time",
                    },
                  },
                  required: ["author", "body", "at"],
                  additionalProperties: false,
                },
                description: "Comments",
              },
            },
            required: [
              "id",
              "workspaceId",
              "projectId",
              "title",
              "status",
              "priority",
              "tags",
              "dependencies",
              "archived",
              "version",
            ],
            additionalProperties: false,
          },
        },
        required: ["task"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        TASK_NOT_FOUND: "Task not found in this workspace.",
      },
    },
    "task.list": {
      kind: "query",
      description:
        "List workspace tasks by project or parent, with pagination.",
      guard: "canReadWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          projectId: {
            type: "string",
            description: "Project identifier",
          },
          parentId: {
            type: "string",
            description: "Task identifier",
          },
          includeArchived: {
            type: "boolean",
            description: "Include archived",
          },
          limit: {
            type: "integer",
            description: "Page size",
          },
          offset: {
            type: "integer",
            description: "Offset",
          },
        },
        required: ["workspaceId"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Task identifier",
                },
                workspaceId: {
                  type: "string",
                  description: "Workspace identifier",
                },
                projectId: {
                  type: "string",
                  description: "Project identifier",
                },
                title: {
                  type: "string",
                  description: "Concise title",
                },
                status: {
                  type: "string",
                  enum: ["todo", "in_progress", "blocked", "done"],
                  description: "Current or computed effective status",
                },
                priority: {
                  type: "string",
                  enum: ["low", "medium", "high", "urgent"],
                  description: "Task priority",
                },
                tags: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Tag",
                  },
                  description: "Tags",
                },
                dependencies: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Task identifier",
                  },
                  description: "Task dependencies",
                },
                archived: {
                  type: "boolean",
                  description: "Whether archived",
                },
                version: {
                  type: "integer",
                  description: "Optimistic concurrency version",
                },
                notes: {
                  type: "string",
                  description: "Notes",
                },
                parentId: {
                  type: "string",
                  description: "Task identifier",
                },
                dueAt: {
                  type: "string",
                  description: "ISO 8601 date/time",
                },
                assignee: {
                  type: "string",
                  description: "Member subject",
                },
                recurrenceDays: {
                  type: "integer",
                  description: "Recur every N days",
                },
                originId: {
                  type: "string",
                  description: "Task identifier",
                },
                completedAt: {
                  type: "string",
                  description: "ISO time",
                },
                createdAt: {
                  type: "string",
                  description: "ISO time",
                },
                updatedAt: {
                  type: "string",
                  description: "ISO time",
                },
                comments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      author: {
                        type: "string",
                        description: "Author",
                      },
                      body: {
                        type: "string",
                        description: "Comment",
                      },
                      at: {
                        type: "string",
                        description: "Time",
                      },
                    },
                    required: ["author", "body", "at"],
                    additionalProperties: false,
                  },
                  description: "Comments",
                },
              },
              required: [
                "id",
                "workspaceId",
                "projectId",
                "title",
                "status",
                "priority",
                "tags",
                "dependencies",
                "archived",
                "version",
              ],
              additionalProperties: false,
            },
            description: "Matching tasks",
          },
          total: {
            type: "integer",
            description: "Total matches",
          },
          offset: {
            type: "integer",
            description: "Offset",
          },
          limit: {
            type: "integer",
            description: "Limit",
          },
        },
        required: ["items", "total", "offset", "limit"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        INVALID_DATA: "Invalid domain data or unsupported transition.",
      },
    },
    "task.update": {
      kind: "action",
      description:
        "Patch a task using optimistic concurrency; completion uses task.complete.",
      guard: "canWriteWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          taskId: {
            type: "string",
            description: "Task identifier",
          },
          expectedVersion: {
            type: "integer",
            description: "Version",
          },
          patch: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Concise title",
              },
              notes: {
                type: "string",
                description: "Notes, empty to clear",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                description: "Task priority",
              },
              status: {
                type: "string",
                enum: ["todo", "in_progress"],
                description: "Mutable status",
              },
              dueAt: {
                type: "string",
                description: "ISO date/time, empty to clear",
              },
              tags: {
                type: "array",
                items: {
                  type: "string",
                  description: "Tag",
                },
              },
              assignee: {
                type: "string",
                description: "Member subject, empty to clear",
              },
              estimateMinutes: {
                type: "integer",
                description: "Estimate minutes",
              },
              recurrenceDays: {
                type: "integer",
                description: "Recurrence interval days",
              },
            },
            required: [],
            additionalProperties: false,
          },
        },
        required: ["workspaceId", "taskId", "expectedVersion", "patch"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          task: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Task identifier",
              },
              workspaceId: {
                type: "string",
                description: "Workspace identifier",
              },
              projectId: {
                type: "string",
                description: "Project identifier",
              },
              title: {
                type: "string",
                description: "Concise title",
              },
              status: {
                type: "string",
                enum: ["todo", "in_progress", "blocked", "done"],
                description: "Current or computed effective status",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                description: "Task priority",
              },
              tags: {
                type: "array",
                items: {
                  type: "string",
                  description: "Tag",
                },
                description: "Tags",
              },
              dependencies: {
                type: "array",
                items: {
                  type: "string",
                  description: "Task identifier",
                },
                description: "Task dependencies",
              },
              archived: {
                type: "boolean",
                description: "Whether archived",
              },
              version: {
                type: "integer",
                description: "Optimistic concurrency version",
              },
              notes: {
                type: "string",
                description: "Notes",
              },
              parentId: {
                type: "string",
                description: "Task identifier",
              },
              dueAt: {
                type: "string",
                description: "ISO 8601 date/time",
              },
              assignee: {
                type: "string",
                description: "Member subject",
              },
              recurrenceDays: {
                type: "integer",
                description: "Recur every N days",
              },
              originId: {
                type: "string",
                description: "Task identifier",
              },
              completedAt: {
                type: "string",
                description: "ISO time",
              },
              createdAt: {
                type: "string",
                description: "ISO time",
              },
              updatedAt: {
                type: "string",
                description: "ISO time",
              },
              comments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    author: {
                      type: "string",
                      description: "Author",
                    },
                    body: {
                      type: "string",
                      description: "Comment",
                    },
                    at: {
                      type: "string",
                      description: "Time",
                    },
                  },
                  required: ["author", "body", "at"],
                  additionalProperties: false,
                },
                description: "Comments",
              },
            },
            required: [
              "id",
              "workspaceId",
              "projectId",
              "title",
              "status",
              "priority",
              "tags",
              "dependencies",
              "archived",
              "version",
            ],
            additionalProperties: false,
          },
        },
        required: ["task"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        TASK_NOT_FOUND: "Task not found in this workspace.",
        VERSION_CONFLICT: "Resource version changed. Re-read before updating.",
        INVALID_DATA: "Invalid domain data or unsupported transition.",
        ARCHIVED: "Task is archived and must be restored before editing.",
      },
      hasSideEffects: true,
      idempotent: false,
    },
    "task.complete": {
      kind: "action",
      description:
        "Complete a task if dependencies are satisfied; schedule next recurrence if configured.",
      guard: "canWriteWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          taskId: {
            type: "string",
            description: "Task identifier",
          },
          expectedVersion: {
            type: "integer",
            description: "Version",
          },
        },
        required: ["workspaceId", "taskId", "expectedVersion"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          task: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Task identifier",
              },
              workspaceId: {
                type: "string",
                description: "Workspace identifier",
              },
              projectId: {
                type: "string",
                description: "Project identifier",
              },
              title: {
                type: "string",
                description: "Concise title",
              },
              status: {
                type: "string",
                enum: ["todo", "in_progress", "blocked", "done"],
                description: "Current or computed effective status",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                description: "Task priority",
              },
              tags: {
                type: "array",
                items: {
                  type: "string",
                  description: "Tag",
                },
                description: "Tags",
              },
              dependencies: {
                type: "array",
                items: {
                  type: "string",
                  description: "Task identifier",
                },
                description: "Task dependencies",
              },
              archived: {
                type: "boolean",
                description: "Whether archived",
              },
              version: {
                type: "integer",
                description: "Optimistic concurrency version",
              },
              notes: {
                type: "string",
                description: "Notes",
              },
              parentId: {
                type: "string",
                description: "Task identifier",
              },
              dueAt: {
                type: "string",
                description: "ISO 8601 date/time",
              },
              assignee: {
                type: "string",
                description: "Member subject",
              },
              recurrenceDays: {
                type: "integer",
                description: "Recur every N days",
              },
              originId: {
                type: "string",
                description: "Task identifier",
              },
              completedAt: {
                type: "string",
                description: "ISO time",
              },
              createdAt: {
                type: "string",
                description: "ISO time",
              },
              updatedAt: {
                type: "string",
                description: "ISO time",
              },
              comments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    author: {
                      type: "string",
                      description: "Author",
                    },
                    body: {
                      type: "string",
                      description: "Comment",
                    },
                    at: {
                      type: "string",
                      description: "Time",
                    },
                  },
                  required: ["author", "body", "at"],
                  additionalProperties: false,
                },
                description: "Comments",
              },
            },
            required: [
              "id",
              "workspaceId",
              "projectId",
              "title",
              "status",
              "priority",
              "tags",
              "dependencies",
              "archived",
              "version",
            ],
            additionalProperties: false,
          },
          spawnedId: {
            type: "string",
            description: "Task identifier",
          },
        },
        required: ["task"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        TASK_NOT_FOUND: "Task not found in this workspace.",
        VERSION_CONFLICT: "Resource version changed. Re-read before updating.",
        DEPENDENCY_BLOCKED: "Uncompleted dependencies prevent completion.",
        ALREADY_DONE: "Task has already been completed.",
        ARCHIVED: "Task is archived and must be restored before editing.",
      },
      hasSideEffects: true,
      idempotent: false,
    },
    "task.reopen": {
      kind: "action",
      description: "Reopen a completed task with optimistic concurrency.",
      guard: "canWriteWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          taskId: {
            type: "string",
            description: "Task identifier",
          },
          expectedVersion: {
            type: "integer",
            description: "Version",
          },
        },
        required: ["workspaceId", "taskId", "expectedVersion"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          task: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Task identifier",
              },
              workspaceId: {
                type: "string",
                description: "Workspace identifier",
              },
              projectId: {
                type: "string",
                description: "Project identifier",
              },
              title: {
                type: "string",
                description: "Concise title",
              },
              status: {
                type: "string",
                enum: ["todo", "in_progress", "blocked", "done"],
                description: "Current or computed effective status",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                description: "Task priority",
              },
              tags: {
                type: "array",
                items: {
                  type: "string",
                  description: "Tag",
                },
                description: "Tags",
              },
              dependencies: {
                type: "array",
                items: {
                  type: "string",
                  description: "Task identifier",
                },
                description: "Task dependencies",
              },
              archived: {
                type: "boolean",
                description: "Whether archived",
              },
              version: {
                type: "integer",
                description: "Optimistic concurrency version",
              },
              notes: {
                type: "string",
                description: "Notes",
              },
              parentId: {
                type: "string",
                description: "Task identifier",
              },
              dueAt: {
                type: "string",
                description: "ISO 8601 date/time",
              },
              assignee: {
                type: "string",
                description: "Member subject",
              },
              recurrenceDays: {
                type: "integer",
                description: "Recur every N days",
              },
              originId: {
                type: "string",
                description: "Task identifier",
              },
              completedAt: {
                type: "string",
                description: "ISO time",
              },
              createdAt: {
                type: "string",
                description: "ISO time",
              },
              updatedAt: {
                type: "string",
                description: "ISO time",
              },
              comments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    author: {
                      type: "string",
                      description: "Author",
                    },
                    body: {
                      type: "string",
                      description: "Comment",
                    },
                    at: {
                      type: "string",
                      description: "Time",
                    },
                  },
                  required: ["author", "body", "at"],
                  additionalProperties: false,
                },
                description: "Comments",
              },
            },
            required: [
              "id",
              "workspaceId",
              "projectId",
              "title",
              "status",
              "priority",
              "tags",
              "dependencies",
              "archived",
              "version",
            ],
            additionalProperties: false,
          },
        },
        required: ["task"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        TASK_NOT_FOUND: "Task not found in this workspace.",
        VERSION_CONFLICT: "Resource version changed. Re-read before updating.",
        NOT_DONE: "Task is not completed.",
        ARCHIVED: "Task is archived and must be restored before editing.",
      },
      hasSideEffects: true,
      idempotent: false,
    },
    "task.archive": {
      kind: "action",
      description: "Archive a task without permanently deleting history.",
      guard: "canWriteWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          taskId: {
            type: "string",
            description: "Task identifier",
          },
          expectedVersion: {
            type: "integer",
            description: "Version",
          },
        },
        required: ["workspaceId", "taskId", "expectedVersion"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          task: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Task identifier",
              },
              workspaceId: {
                type: "string",
                description: "Workspace identifier",
              },
              projectId: {
                type: "string",
                description: "Project identifier",
              },
              title: {
                type: "string",
                description: "Concise title",
              },
              status: {
                type: "string",
                enum: ["todo", "in_progress", "blocked", "done"],
                description: "Current or computed effective status",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                description: "Task priority",
              },
              tags: {
                type: "array",
                items: {
                  type: "string",
                  description: "Tag",
                },
                description: "Tags",
              },
              dependencies: {
                type: "array",
                items: {
                  type: "string",
                  description: "Task identifier",
                },
                description: "Task dependencies",
              },
              archived: {
                type: "boolean",
                description: "Whether archived",
              },
              version: {
                type: "integer",
                description: "Optimistic concurrency version",
              },
              notes: {
                type: "string",
                description: "Notes",
              },
              parentId: {
                type: "string",
                description: "Task identifier",
              },
              dueAt: {
                type: "string",
                description: "ISO 8601 date/time",
              },
              assignee: {
                type: "string",
                description: "Member subject",
              },
              recurrenceDays: {
                type: "integer",
                description: "Recur every N days",
              },
              originId: {
                type: "string",
                description: "Task identifier",
              },
              completedAt: {
                type: "string",
                description: "ISO time",
              },
              createdAt: {
                type: "string",
                description: "ISO time",
              },
              updatedAt: {
                type: "string",
                description: "ISO time",
              },
              comments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    author: {
                      type: "string",
                      description: "Author",
                    },
                    body: {
                      type: "string",
                      description: "Comment",
                    },
                    at: {
                      type: "string",
                      description: "Time",
                    },
                  },
                  required: ["author", "body", "at"],
                  additionalProperties: false,
                },
                description: "Comments",
              },
            },
            required: [
              "id",
              "workspaceId",
              "projectId",
              "title",
              "status",
              "priority",
              "tags",
              "dependencies",
              "archived",
              "version",
            ],
            additionalProperties: false,
          },
        },
        required: ["task"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        TASK_NOT_FOUND: "Task not found in this workspace.",
        VERSION_CONFLICT: "Resource version changed. Re-read before updating.",
        ARCHIVED: "Task is archived and must be restored before editing.",
      },
      hasSideEffects: true,
      idempotent: false,
    },
    "task.restore": {
      kind: "action",
      description: "Restore an archived task.",
      guard: "canWriteWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          taskId: {
            type: "string",
            description: "Task identifier",
          },
          expectedVersion: {
            type: "integer",
            description: "Version",
          },
        },
        required: ["workspaceId", "taskId", "expectedVersion"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          task: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Task identifier",
              },
              workspaceId: {
                type: "string",
                description: "Workspace identifier",
              },
              projectId: {
                type: "string",
                description: "Project identifier",
              },
              title: {
                type: "string",
                description: "Concise title",
              },
              status: {
                type: "string",
                enum: ["todo", "in_progress", "blocked", "done"],
                description: "Current or computed effective status",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                description: "Task priority",
              },
              tags: {
                type: "array",
                items: {
                  type: "string",
                  description: "Tag",
                },
                description: "Tags",
              },
              dependencies: {
                type: "array",
                items: {
                  type: "string",
                  description: "Task identifier",
                },
                description: "Task dependencies",
              },
              archived: {
                type: "boolean",
                description: "Whether archived",
              },
              version: {
                type: "integer",
                description: "Optimistic concurrency version",
              },
              notes: {
                type: "string",
                description: "Notes",
              },
              parentId: {
                type: "string",
                description: "Task identifier",
              },
              dueAt: {
                type: "string",
                description: "ISO 8601 date/time",
              },
              assignee: {
                type: "string",
                description: "Member subject",
              },
              recurrenceDays: {
                type: "integer",
                description: "Recur every N days",
              },
              originId: {
                type: "string",
                description: "Task identifier",
              },
              completedAt: {
                type: "string",
                description: "ISO time",
              },
              createdAt: {
                type: "string",
                description: "ISO time",
              },
              updatedAt: {
                type: "string",
                description: "ISO time",
              },
              comments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    author: {
                      type: "string",
                      description: "Author",
                    },
                    body: {
                      type: "string",
                      description: "Comment",
                    },
                    at: {
                      type: "string",
                      description: "Time",
                    },
                  },
                  required: ["author", "body", "at"],
                  additionalProperties: false,
                },
                description: "Comments",
              },
            },
            required: [
              "id",
              "workspaceId",
              "projectId",
              "title",
              "status",
              "priority",
              "tags",
              "dependencies",
              "archived",
              "version",
            ],
            additionalProperties: false,
          },
        },
        required: ["task"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        TASK_NOT_FOUND: "Task not found in this workspace.",
        VERSION_CONFLICT: "Resource version changed. Re-read before updating.",
        INVALID_DATA: "Invalid domain data or unsupported transition.",
      },
      hasSideEffects: true,
      idempotent: false,
    },
    "task.dependency.add": {
      kind: "action",
      description:
        "Add a dependency after checking for cycles and cross-workspace access.",
      guard: "canWriteWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          taskId: {
            type: "string",
            description: "Task identifier",
          },
          dependsOnId: {
            type: "string",
            description: "Task identifier",
          },
          expectedVersion: {
            type: "integer",
            description: "Version",
          },
        },
        required: ["workspaceId", "taskId", "dependsOnId", "expectedVersion"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          task: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Task identifier",
              },
              workspaceId: {
                type: "string",
                description: "Workspace identifier",
              },
              projectId: {
                type: "string",
                description: "Project identifier",
              },
              title: {
                type: "string",
                description: "Concise title",
              },
              status: {
                type: "string",
                enum: ["todo", "in_progress", "blocked", "done"],
                description: "Current or computed effective status",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                description: "Task priority",
              },
              tags: {
                type: "array",
                items: {
                  type: "string",
                  description: "Tag",
                },
                description: "Tags",
              },
              dependencies: {
                type: "array",
                items: {
                  type: "string",
                  description: "Task identifier",
                },
                description: "Task dependencies",
              },
              archived: {
                type: "boolean",
                description: "Whether archived",
              },
              version: {
                type: "integer",
                description: "Optimistic concurrency version",
              },
              notes: {
                type: "string",
                description: "Notes",
              },
              parentId: {
                type: "string",
                description: "Task identifier",
              },
              dueAt: {
                type: "string",
                description: "ISO 8601 date/time",
              },
              assignee: {
                type: "string",
                description: "Member subject",
              },
              recurrenceDays: {
                type: "integer",
                description: "Recur every N days",
              },
              originId: {
                type: "string",
                description: "Task identifier",
              },
              completedAt: {
                type: "string",
                description: "ISO time",
              },
              createdAt: {
                type: "string",
                description: "ISO time",
              },
              updatedAt: {
                type: "string",
                description: "ISO time",
              },
              comments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    author: {
                      type: "string",
                      description: "Author",
                    },
                    body: {
                      type: "string",
                      description: "Comment",
                    },
                    at: {
                      type: "string",
                      description: "Time",
                    },
                  },
                  required: ["author", "body", "at"],
                  additionalProperties: false,
                },
                description: "Comments",
              },
            },
            required: [
              "id",
              "workspaceId",
              "projectId",
              "title",
              "status",
              "priority",
              "tags",
              "dependencies",
              "archived",
              "version",
            ],
            additionalProperties: false,
          },
        },
        required: ["task"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        TASK_NOT_FOUND: "Task not found in this workspace.",
        VERSION_CONFLICT: "Resource version changed. Re-read before updating.",
        DEPENDENCY_CYCLE: "The new dependency would create a cycle.",
        ALREADY_DEPENDENT: "Dependency is already present.",
        ARCHIVED: "Task is archived and must be restored before editing.",
      },
      hasSideEffects: true,
      idempotent: false,
    },
    "task.dependency.remove": {
      kind: "action",
      description: "Remove a task dependency using optimistic concurrency.",
      guard: "canWriteWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          taskId: {
            type: "string",
            description: "Task identifier",
          },
          dependsOnId: {
            type: "string",
            description: "Task identifier",
          },
          expectedVersion: {
            type: "integer",
            description: "Version",
          },
        },
        required: ["workspaceId", "taskId", "dependsOnId", "expectedVersion"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          task: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Task identifier",
              },
              workspaceId: {
                type: "string",
                description: "Workspace identifier",
              },
              projectId: {
                type: "string",
                description: "Project identifier",
              },
              title: {
                type: "string",
                description: "Concise title",
              },
              status: {
                type: "string",
                enum: ["todo", "in_progress", "blocked", "done"],
                description: "Current or computed effective status",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                description: "Task priority",
              },
              tags: {
                type: "array",
                items: {
                  type: "string",
                  description: "Tag",
                },
                description: "Tags",
              },
              dependencies: {
                type: "array",
                items: {
                  type: "string",
                  description: "Task identifier",
                },
                description: "Task dependencies",
              },
              archived: {
                type: "boolean",
                description: "Whether archived",
              },
              version: {
                type: "integer",
                description: "Optimistic concurrency version",
              },
              notes: {
                type: "string",
                description: "Notes",
              },
              parentId: {
                type: "string",
                description: "Task identifier",
              },
              dueAt: {
                type: "string",
                description: "ISO 8601 date/time",
              },
              assignee: {
                type: "string",
                description: "Member subject",
              },
              recurrenceDays: {
                type: "integer",
                description: "Recur every N days",
              },
              originId: {
                type: "string",
                description: "Task identifier",
              },
              completedAt: {
                type: "string",
                description: "ISO time",
              },
              createdAt: {
                type: "string",
                description: "ISO time",
              },
              updatedAt: {
                type: "string",
                description: "ISO time",
              },
              comments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    author: {
                      type: "string",
                      description: "Author",
                    },
                    body: {
                      type: "string",
                      description: "Comment",
                    },
                    at: {
                      type: "string",
                      description: "Time",
                    },
                  },
                  required: ["author", "body", "at"],
                  additionalProperties: false,
                },
                description: "Comments",
              },
            },
            required: [
              "id",
              "workspaceId",
              "projectId",
              "title",
              "status",
              "priority",
              "tags",
              "dependencies",
              "archived",
              "version",
            ],
            additionalProperties: false,
          },
        },
        required: ["task"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        TASK_NOT_FOUND: "Task not found in this workspace.",
        VERSION_CONFLICT: "Resource version changed. Re-read before updating.",
        INVALID_DATA: "Invalid domain data or unsupported transition.",
        ARCHIVED: "Task is archived and must be restored before editing.",
      },
      hasSideEffects: true,
      idempotent: false,
    },
    "task.bulkUpdate": {
      kind: "action",
      description:
        "Atomically validate and apply multiple task edits in the in-memory demo.",
      guard: "canWriteWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          updates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                taskId: {
                  type: "string",
                  description: "Task identifier",
                },
                expectedVersion: {
                  type: "integer",
                  description: "Version",
                },
                patch: {
                  type: "object",
                  properties: {
                    status: {
                      type: "string",
                      enum: ["todo", "in_progress"],
                      description: "Active state",
                    },
                    priority: {
                      type: "string",
                      enum: ["low", "medium", "high", "urgent"],
                      description: "Task priority",
                    },
                    dueAt: {
                      type: "string",
                      description: "ISO date or empty",
                    },
                    tags: {
                      type: "array",
                      items: {
                        type: "string",
                        description: "Tag",
                      },
                    },
                    assignee: {
                      type: "string",
                      description: "Member",
                    },
                    estimateMinutes: {
                      type: "integer",
                      description: "Minutes",
                    },
                  },
                  required: [],
                  additionalProperties: false,
                },
              },
              required: ["taskId", "expectedVersion", "patch"],
              additionalProperties: false,
            },
            description: "Updates",
          },
        },
        required: ["workspaceId", "updates"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Task identifier",
                },
                workspaceId: {
                  type: "string",
                  description: "Workspace identifier",
                },
                projectId: {
                  type: "string",
                  description: "Project identifier",
                },
                title: {
                  type: "string",
                  description: "Concise title",
                },
                status: {
                  type: "string",
                  enum: ["todo", "in_progress", "blocked", "done"],
                  description: "Current or computed effective status",
                },
                priority: {
                  type: "string",
                  enum: ["low", "medium", "high", "urgent"],
                  description: "Task priority",
                },
                tags: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Tag",
                  },
                  description: "Tags",
                },
                dependencies: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Task identifier",
                  },
                  description: "Task dependencies",
                },
                archived: {
                  type: "boolean",
                  description: "Whether archived",
                },
                version: {
                  type: "integer",
                  description: "Optimistic concurrency version",
                },
                notes: {
                  type: "string",
                  description: "Notes",
                },
                parentId: {
                  type: "string",
                  description: "Task identifier",
                },
                dueAt: {
                  type: "string",
                  description: "ISO 8601 date/time",
                },
                assignee: {
                  type: "string",
                  description: "Member subject",
                },
                recurrenceDays: {
                  type: "integer",
                  description: "Recur every N days",
                },
                originId: {
                  type: "string",
                  description: "Task identifier",
                },
                completedAt: {
                  type: "string",
                  description: "ISO time",
                },
                createdAt: {
                  type: "string",
                  description: "ISO time",
                },
                updatedAt: {
                  type: "string",
                  description: "ISO time",
                },
                comments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      author: {
                        type: "string",
                        description: "Author",
                      },
                      body: {
                        type: "string",
                        description: "Comment",
                      },
                      at: {
                        type: "string",
                        description: "Time",
                      },
                    },
                    required: ["author", "body", "at"],
                    additionalProperties: false,
                  },
                  description: "Comments",
                },
              },
              required: [
                "id",
                "workspaceId",
                "projectId",
                "title",
                "status",
                "priority",
                "tags",
                "dependencies",
                "archived",
                "version",
              ],
              additionalProperties: false,
            },
            description: "Changed tasks",
          },
          count: {
            type: "integer",
            description: "Count",
          },
        },
        required: ["items", "count"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        TASK_NOT_FOUND: "Task not found in this workspace.",
        VERSION_CONFLICT: "Resource version changed. Re-read before updating.",
        INVALID_DATA: "Invalid domain data or unsupported transition.",
        ARCHIVED: "Task is archived and must be restored before editing.",
        DUPLICATE_ITEM: "Repeated task identifier in bulk update.",
      },
      hasSideEffects: true,
      idempotent: false,
    },
    "task.search": {
      kind: "query",
      description:
        "Search tasks by text, status, priority, tag, assignment, deadlines, and sorting.",
      guard: "canReadWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          text: {
            type: "string",
            description: "Search title and notes",
          },
          projectId: {
            type: "string",
            description: "Project identifier",
          },
          status: {
            type: "string",
            enum: ["todo", "in_progress", "blocked", "done"],
            description: "Current or computed effective status",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "urgent"],
            description: "Task priority",
          },
          tag: {
            type: "string",
            description: "Tag",
          },
          assignee: {
            type: "string",
            description: "Assigned member subject",
          },
          dueBefore: {
            type: "string",
            description: "ISO date",
          },
          dueAfter: {
            type: "string",
            description: "ISO date",
          },
          includeArchived: {
            type: "boolean",
            description: "Include archived",
          },
          sortBy: {
            type: "string",
            enum: ["dueAt", "priority", "createdAt", "updatedAt", "title"],
            description: "Sort order",
          },
          descending: {
            type: "boolean",
            description: "Reverse sort",
          },
          limit: {
            type: "integer",
            description: "Page size (1 to 100)",
          },
          offset: {
            type: "integer",
            description: "Pagination offset",
          },
        },
        required: ["workspaceId"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Task identifier",
                },
                workspaceId: {
                  type: "string",
                  description: "Workspace identifier",
                },
                projectId: {
                  type: "string",
                  description: "Project identifier",
                },
                title: {
                  type: "string",
                  description: "Concise title",
                },
                status: {
                  type: "string",
                  enum: ["todo", "in_progress", "blocked", "done"],
                  description: "Current or computed effective status",
                },
                priority: {
                  type: "string",
                  enum: ["low", "medium", "high", "urgent"],
                  description: "Task priority",
                },
                tags: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Tag",
                  },
                  description: "Tags",
                },
                dependencies: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Task identifier",
                  },
                  description: "Task dependencies",
                },
                archived: {
                  type: "boolean",
                  description: "Whether archived",
                },
                version: {
                  type: "integer",
                  description: "Optimistic concurrency version",
                },
                notes: {
                  type: "string",
                  description: "Notes",
                },
                parentId: {
                  type: "string",
                  description: "Task identifier",
                },
                dueAt: {
                  type: "string",
                  description: "ISO 8601 date/time",
                },
                assignee: {
                  type: "string",
                  description: "Member subject",
                },
                recurrenceDays: {
                  type: "integer",
                  description: "Recur every N days",
                },
                originId: {
                  type: "string",
                  description: "Task identifier",
                },
                completedAt: {
                  type: "string",
                  description: "ISO time",
                },
                createdAt: {
                  type: "string",
                  description: "ISO time",
                },
                updatedAt: {
                  type: "string",
                  description: "ISO time",
                },
                comments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      author: {
                        type: "string",
                        description: "Author",
                      },
                      body: {
                        type: "string",
                        description: "Comment",
                      },
                      at: {
                        type: "string",
                        description: "Time",
                      },
                    },
                    required: ["author", "body", "at"],
                    additionalProperties: false,
                  },
                  description: "Comments",
                },
              },
              required: [
                "id",
                "workspaceId",
                "projectId",
                "title",
                "status",
                "priority",
                "tags",
                "dependencies",
                "archived",
                "version",
              ],
              additionalProperties: false,
            },
            description: "Matching tasks",
          },
          total: {
            type: "integer",
            description: "Total matches",
          },
          offset: {
            type: "integer",
            description: "Offset",
          },
          limit: {
            type: "integer",
            description: "Limit",
          },
        },
        required: ["items", "total", "offset", "limit"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        INVALID_DATA: "Invalid domain data or unsupported transition.",
      },
    },
    "task.board": {
      kind: "query",
      description:
        "Group tasks into kanban columns, including computed blocked tasks.",
      guard: "canReadWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          projectId: {
            type: "string",
            description: "Project identifier",
          },
        },
        required: ["workspaceId"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          todo: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Task identifier",
                },
                workspaceId: {
                  type: "string",
                  description: "Workspace identifier",
                },
                projectId: {
                  type: "string",
                  description: "Project identifier",
                },
                title: {
                  type: "string",
                  description: "Concise title",
                },
                status: {
                  type: "string",
                  enum: ["todo", "in_progress", "blocked", "done"],
                  description: "Current or computed effective status",
                },
                priority: {
                  type: "string",
                  enum: ["low", "medium", "high", "urgent"],
                  description: "Task priority",
                },
                tags: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Tag",
                  },
                  description: "Tags",
                },
                dependencies: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Task identifier",
                  },
                  description: "Task dependencies",
                },
                archived: {
                  type: "boolean",
                  description: "Whether archived",
                },
                version: {
                  type: "integer",
                  description: "Optimistic concurrency version",
                },
                notes: {
                  type: "string",
                  description: "Notes",
                },
                parentId: {
                  type: "string",
                  description: "Task identifier",
                },
                dueAt: {
                  type: "string",
                  description: "ISO 8601 date/time",
                },
                assignee: {
                  type: "string",
                  description: "Member subject",
                },
                recurrenceDays: {
                  type: "integer",
                  description: "Recur every N days",
                },
                originId: {
                  type: "string",
                  description: "Task identifier",
                },
                completedAt: {
                  type: "string",
                  description: "ISO time",
                },
                createdAt: {
                  type: "string",
                  description: "ISO time",
                },
                updatedAt: {
                  type: "string",
                  description: "ISO time",
                },
                comments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      author: {
                        type: "string",
                        description: "Author",
                      },
                      body: {
                        type: "string",
                        description: "Comment",
                      },
                      at: {
                        type: "string",
                        description: "Time",
                      },
                    },
                    required: ["author", "body", "at"],
                    additionalProperties: false,
                  },
                  description: "Comments",
                },
              },
              required: [
                "id",
                "workspaceId",
                "projectId",
                "title",
                "status",
                "priority",
                "tags",
                "dependencies",
                "archived",
                "version",
              ],
              additionalProperties: false,
            },
          },
          in_progress: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Task identifier",
                },
                workspaceId: {
                  type: "string",
                  description: "Workspace identifier",
                },
                projectId: {
                  type: "string",
                  description: "Project identifier",
                },
                title: {
                  type: "string",
                  description: "Concise title",
                },
                status: {
                  type: "string",
                  enum: ["todo", "in_progress", "blocked", "done"],
                  description: "Current or computed effective status",
                },
                priority: {
                  type: "string",
                  enum: ["low", "medium", "high", "urgent"],
                  description: "Task priority",
                },
                tags: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Tag",
                  },
                  description: "Tags",
                },
                dependencies: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Task identifier",
                  },
                  description: "Task dependencies",
                },
                archived: {
                  type: "boolean",
                  description: "Whether archived",
                },
                version: {
                  type: "integer",
                  description: "Optimistic concurrency version",
                },
                notes: {
                  type: "string",
                  description: "Notes",
                },
                parentId: {
                  type: "string",
                  description: "Task identifier",
                },
                dueAt: {
                  type: "string",
                  description: "ISO 8601 date/time",
                },
                assignee: {
                  type: "string",
                  description: "Member subject",
                },
                recurrenceDays: {
                  type: "integer",
                  description: "Recur every N days",
                },
                originId: {
                  type: "string",
                  description: "Task identifier",
                },
                completedAt: {
                  type: "string",
                  description: "ISO time",
                },
                createdAt: {
                  type: "string",
                  description: "ISO time",
                },
                updatedAt: {
                  type: "string",
                  description: "ISO time",
                },
                comments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      author: {
                        type: "string",
                        description: "Author",
                      },
                      body: {
                        type: "string",
                        description: "Comment",
                      },
                      at: {
                        type: "string",
                        description: "Time",
                      },
                    },
                    required: ["author", "body", "at"],
                    additionalProperties: false,
                  },
                  description: "Comments",
                },
              },
              required: [
                "id",
                "workspaceId",
                "projectId",
                "title",
                "status",
                "priority",
                "tags",
                "dependencies",
                "archived",
                "version",
              ],
              additionalProperties: false,
            },
          },
          blocked: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Task identifier",
                },
                workspaceId: {
                  type: "string",
                  description: "Workspace identifier",
                },
                projectId: {
                  type: "string",
                  description: "Project identifier",
                },
                title: {
                  type: "string",
                  description: "Concise title",
                },
                status: {
                  type: "string",
                  enum: ["todo", "in_progress", "blocked", "done"],
                  description: "Current or computed effective status",
                },
                priority: {
                  type: "string",
                  enum: ["low", "medium", "high", "urgent"],
                  description: "Task priority",
                },
                tags: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Tag",
                  },
                  description: "Tags",
                },
                dependencies: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Task identifier",
                  },
                  description: "Task dependencies",
                },
                archived: {
                  type: "boolean",
                  description: "Whether archived",
                },
                version: {
                  type: "integer",
                  description: "Optimistic concurrency version",
                },
                notes: {
                  type: "string",
                  description: "Notes",
                },
                parentId: {
                  type: "string",
                  description: "Task identifier",
                },
                dueAt: {
                  type: "string",
                  description: "ISO 8601 date/time",
                },
                assignee: {
                  type: "string",
                  description: "Member subject",
                },
                recurrenceDays: {
                  type: "integer",
                  description: "Recur every N days",
                },
                originId: {
                  type: "string",
                  description: "Task identifier",
                },
                completedAt: {
                  type: "string",
                  description: "ISO time",
                },
                createdAt: {
                  type: "string",
                  description: "ISO time",
                },
                updatedAt: {
                  type: "string",
                  description: "ISO time",
                },
                comments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      author: {
                        type: "string",
                        description: "Author",
                      },
                      body: {
                        type: "string",
                        description: "Comment",
                      },
                      at: {
                        type: "string",
                        description: "Time",
                      },
                    },
                    required: ["author", "body", "at"],
                    additionalProperties: false,
                  },
                  description: "Comments",
                },
              },
              required: [
                "id",
                "workspaceId",
                "projectId",
                "title",
                "status",
                "priority",
                "tags",
                "dependencies",
                "archived",
                "version",
              ],
              additionalProperties: false,
            },
          },
          done: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Task identifier",
                },
                workspaceId: {
                  type: "string",
                  description: "Workspace identifier",
                },
                projectId: {
                  type: "string",
                  description: "Project identifier",
                },
                title: {
                  type: "string",
                  description: "Concise title",
                },
                status: {
                  type: "string",
                  enum: ["todo", "in_progress", "blocked", "done"],
                  description: "Current or computed effective status",
                },
                priority: {
                  type: "string",
                  enum: ["low", "medium", "high", "urgent"],
                  description: "Task priority",
                },
                tags: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Tag",
                  },
                  description: "Tags",
                },
                dependencies: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Task identifier",
                  },
                  description: "Task dependencies",
                },
                archived: {
                  type: "boolean",
                  description: "Whether archived",
                },
                version: {
                  type: "integer",
                  description: "Optimistic concurrency version",
                },
                notes: {
                  type: "string",
                  description: "Notes",
                },
                parentId: {
                  type: "string",
                  description: "Task identifier",
                },
                dueAt: {
                  type: "string",
                  description: "ISO 8601 date/time",
                },
                assignee: {
                  type: "string",
                  description: "Member subject",
                },
                recurrenceDays: {
                  type: "integer",
                  description: "Recur every N days",
                },
                originId: {
                  type: "string",
                  description: "Task identifier",
                },
                completedAt: {
                  type: "string",
                  description: "ISO time",
                },
                createdAt: {
                  type: "string",
                  description: "ISO time",
                },
                updatedAt: {
                  type: "string",
                  description: "ISO time",
                },
                comments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      author: {
                        type: "string",
                        description: "Author",
                      },
                      body: {
                        type: "string",
                        description: "Comment",
                      },
                      at: {
                        type: "string",
                        description: "Time",
                      },
                    },
                    required: ["author", "body", "at"],
                    additionalProperties: false,
                  },
                  description: "Comments",
                },
              },
              required: [
                "id",
                "workspaceId",
                "projectId",
                "title",
                "status",
                "priority",
                "tags",
                "dependencies",
                "archived",
                "version",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["todo", "in_progress", "blocked", "done"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
      },
    },
    "task.plan": {
      kind: "query",
      description:
        "Find the most actionable tasks ranked by urgency, priority and dependencies.",
      guard: "canReadWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          assignee: {
            type: "string",
            description: "Member",
          },
          limit: {
            type: "integer",
            description: "Count",
          },
        },
        required: ["workspaceId"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Task identifier",
                },
                workspaceId: {
                  type: "string",
                  description: "Workspace identifier",
                },
                projectId: {
                  type: "string",
                  description: "Project identifier",
                },
                title: {
                  type: "string",
                  description: "Concise title",
                },
                status: {
                  type: "string",
                  enum: ["todo", "in_progress", "blocked", "done"],
                  description: "Current or computed effective status",
                },
                priority: {
                  type: "string",
                  enum: ["low", "medium", "high", "urgent"],
                  description: "Task priority",
                },
                tags: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Tag",
                  },
                  description: "Tags",
                },
                dependencies: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Task identifier",
                  },
                  description: "Task dependencies",
                },
                archived: {
                  type: "boolean",
                  description: "Whether archived",
                },
                version: {
                  type: "integer",
                  description: "Optimistic concurrency version",
                },
                notes: {
                  type: "string",
                  description: "Notes",
                },
                parentId: {
                  type: "string",
                  description: "Task identifier",
                },
                dueAt: {
                  type: "string",
                  description: "ISO 8601 date/time",
                },
                assignee: {
                  type: "string",
                  description: "Member subject",
                },
                recurrenceDays: {
                  type: "integer",
                  description: "Recur every N days",
                },
                originId: {
                  type: "string",
                  description: "Task identifier",
                },
                completedAt: {
                  type: "string",
                  description: "ISO time",
                },
                createdAt: {
                  type: "string",
                  description: "ISO time",
                },
                updatedAt: {
                  type: "string",
                  description: "ISO time",
                },
                comments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      author: {
                        type: "string",
                        description: "Author",
                      },
                      body: {
                        type: "string",
                        description: "Comment",
                      },
                      at: {
                        type: "string",
                        description: "Time",
                      },
                    },
                    required: ["author", "body", "at"],
                    additionalProperties: false,
                  },
                  description: "Comments",
                },
              },
              required: [
                "id",
                "workspaceId",
                "projectId",
                "title",
                "status",
                "priority",
                "tags",
                "dependencies",
                "archived",
                "version",
              ],
              additionalProperties: false,
            },
          },
          blocked: {
            type: "integer",
            description: "Blocked count",
          },
        },
        required: ["items", "blocked"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        INVALID_DATA: "Invalid domain data or unsupported transition.",
      },
    },
    "task.comment": {
      kind: "action",
      description: "Append an attributed comment to an accessible task.",
      guard: "canReadWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          taskId: {
            type: "string",
            description: "Task identifier",
          },
          body: {
            type: "string",
            description: "Comment body",
          },
        },
        required: ["workspaceId", "taskId", "body"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          task: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Task identifier",
              },
              workspaceId: {
                type: "string",
                description: "Workspace identifier",
              },
              projectId: {
                type: "string",
                description: "Project identifier",
              },
              title: {
                type: "string",
                description: "Concise title",
              },
              status: {
                type: "string",
                enum: ["todo", "in_progress", "blocked", "done"],
                description: "Current or computed effective status",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                description: "Task priority",
              },
              tags: {
                type: "array",
                items: {
                  type: "string",
                  description: "Tag",
                },
                description: "Tags",
              },
              dependencies: {
                type: "array",
                items: {
                  type: "string",
                  description: "Task identifier",
                },
                description: "Task dependencies",
              },
              archived: {
                type: "boolean",
                description: "Whether archived",
              },
              version: {
                type: "integer",
                description: "Optimistic concurrency version",
              },
              notes: {
                type: "string",
                description: "Notes",
              },
              parentId: {
                type: "string",
                description: "Task identifier",
              },
              dueAt: {
                type: "string",
                description: "ISO 8601 date/time",
              },
              assignee: {
                type: "string",
                description: "Member subject",
              },
              recurrenceDays: {
                type: "integer",
                description: "Recur every N days",
              },
              originId: {
                type: "string",
                description: "Task identifier",
              },
              completedAt: {
                type: "string",
                description: "ISO time",
              },
              createdAt: {
                type: "string",
                description: "ISO time",
              },
              updatedAt: {
                type: "string",
                description: "ISO time",
              },
              comments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    author: {
                      type: "string",
                      description: "Author",
                    },
                    body: {
                      type: "string",
                      description: "Comment",
                    },
                    at: {
                      type: "string",
                      description: "Time",
                    },
                  },
                  required: ["author", "body", "at"],
                  additionalProperties: false,
                },
                description: "Comments",
              },
            },
            required: [
              "id",
              "workspaceId",
              "projectId",
              "title",
              "status",
              "priority",
              "tags",
              "dependencies",
              "archived",
              "version",
            ],
            additionalProperties: false,
          },
        },
        required: ["task"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        TASK_NOT_FOUND: "Task not found in this workspace.",
        INVALID_DATA: "Invalid domain data or unsupported transition.",
        ARCHIVED: "Task is archived and must be restored before editing.",
      },
      hasSideEffects: true,
      idempotent: false,
    },
    "view.save": {
      kind: "action",
      description: "Save reusable task search criteria in a workspace.",
      guard: "canWriteWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          name: {
            type: "string",
            description: "Concise title",
          },
          query: {
            type: "object",
            properties: {
              text: {
                type: "string",
                description: "Search phrase",
              },
              projectId: {
                type: "string",
                description: "Project identifier",
              },
              status: {
                type: "string",
                enum: ["todo", "in_progress", "blocked", "done"],
                description: "Current or computed effective status",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                description: "Task priority",
              },
              tag: {
                type: "string",
                description: "Tag",
              },
              assignee: {
                type: "string",
                description: "Assigned member",
              },
              dueBefore: {
                type: "string",
                description: "Date",
              },
              includeArchived: {
                type: "boolean",
                description: "Archived",
              },
              sortBy: {
                type: "string",
                enum: ["dueAt", "priority", "createdAt", "updatedAt", "title"],
                description: "Sort",
              },
              descending: {
                type: "boolean",
                description: "Descending",
              },
            },
            required: [],
            additionalProperties: false,
          },
        },
        required: ["workspaceId", "name", "query"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          view: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "View ID",
              },
              name: {
                type: "string",
                description: "Concise title",
              },
              query: {
                type: "object",
                properties: {
                  text: {
                    type: "string",
                    description: "Search phrase",
                  },
                  projectId: {
                    type: "string",
                    description: "Project identifier",
                  },
                  status: {
                    type: "string",
                    enum: ["todo", "in_progress", "blocked", "done"],
                    description: "Current or computed effective status",
                  },
                  priority: {
                    type: "string",
                    enum: ["low", "medium", "high", "urgent"],
                    description: "Task priority",
                  },
                  tag: {
                    type: "string",
                    description: "Tag",
                  },
                  assignee: {
                    type: "string",
                    description: "Assigned member",
                  },
                  dueBefore: {
                    type: "string",
                    description: "Date",
                  },
                  includeArchived: {
                    type: "boolean",
                    description: "Archived",
                  },
                  sortBy: {
                    type: "string",
                    enum: [
                      "dueAt",
                      "priority",
                      "createdAt",
                      "updatedAt",
                      "title",
                    ],
                    description: "Sort",
                  },
                  descending: {
                    type: "boolean",
                    description: "Descending",
                  },
                },
                required: [],
                additionalProperties: false,
              },
              creator: {
                type: "string",
                description: "Creator",
              },
            },
            required: ["id", "name", "query", "creator"],
            additionalProperties: false,
          },
        },
        required: ["view"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        INVALID_DATA: "Invalid domain data or unsupported transition.",
      },
      hasSideEffects: true,
      idempotent: false,
    },
    "view.list": {
      kind: "query",
      description: "List saved task views.",
      guard: "canReadWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
        },
        required: ["workspaceId"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          views: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "View ID",
                },
                name: {
                  type: "string",
                  description: "Concise title",
                },
                query: {
                  type: "object",
                  properties: {
                    text: {
                      type: "string",
                      description: "Search phrase",
                    },
                    projectId: {
                      type: "string",
                      description: "Project identifier",
                    },
                    status: {
                      type: "string",
                      enum: ["todo", "in_progress", "blocked", "done"],
                      description: "Current or computed effective status",
                    },
                    priority: {
                      type: "string",
                      enum: ["low", "medium", "high", "urgent"],
                      description: "Task priority",
                    },
                    tag: {
                      type: "string",
                      description: "Tag",
                    },
                    assignee: {
                      type: "string",
                      description: "Assigned member",
                    },
                    dueBefore: {
                      type: "string",
                      description: "Date",
                    },
                    includeArchived: {
                      type: "boolean",
                      description: "Archived",
                    },
                    sortBy: {
                      type: "string",
                      enum: [
                        "dueAt",
                        "priority",
                        "createdAt",
                        "updatedAt",
                        "title",
                      ],
                      description: "Sort",
                    },
                    descending: {
                      type: "boolean",
                      description: "Descending",
                    },
                  },
                  required: [],
                  additionalProperties: false,
                },
                creator: {
                  type: "string",
                  description: "Creator",
                },
              },
              required: ["id", "name", "query", "creator"],
              additionalProperties: false,
            },
          },
        },
        required: ["views"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
      },
    },
    "view.run": {
      kind: "query",
      description: "Run a saved task search with optional pagination.",
      guard: "canReadWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
          viewId: {
            type: "string",
            description: "View identifier",
          },
          limit: {
            type: "integer",
            description: "Count",
          },
          offset: {
            type: "integer",
            description: "Offset",
          },
        },
        required: ["workspaceId", "viewId"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Task identifier",
                },
                workspaceId: {
                  type: "string",
                  description: "Workspace identifier",
                },
                projectId: {
                  type: "string",
                  description: "Project identifier",
                },
                title: {
                  type: "string",
                  description: "Concise title",
                },
                status: {
                  type: "string",
                  enum: ["todo", "in_progress", "blocked", "done"],
                  description: "Current or computed effective status",
                },
                priority: {
                  type: "string",
                  enum: ["low", "medium", "high", "urgent"],
                  description: "Task priority",
                },
                tags: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Tag",
                  },
                  description: "Tags",
                },
                dependencies: {
                  type: "array",
                  items: {
                    type: "string",
                    description: "Task identifier",
                  },
                  description: "Task dependencies",
                },
                archived: {
                  type: "boolean",
                  description: "Whether archived",
                },
                version: {
                  type: "integer",
                  description: "Optimistic concurrency version",
                },
                notes: {
                  type: "string",
                  description: "Notes",
                },
                parentId: {
                  type: "string",
                  description: "Task identifier",
                },
                dueAt: {
                  type: "string",
                  description: "ISO 8601 date/time",
                },
                assignee: {
                  type: "string",
                  description: "Member subject",
                },
                recurrenceDays: {
                  type: "integer",
                  description: "Recur every N days",
                },
                originId: {
                  type: "string",
                  description: "Task identifier",
                },
                completedAt: {
                  type: "string",
                  description: "ISO time",
                },
                createdAt: {
                  type: "string",
                  description: "ISO time",
                },
                updatedAt: {
                  type: "string",
                  description: "ISO time",
                },
                comments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      author: {
                        type: "string",
                        description: "Author",
                      },
                      body: {
                        type: "string",
                        description: "Comment",
                      },
                      at: {
                        type: "string",
                        description: "Time",
                      },
                    },
                    required: ["author", "body", "at"],
                    additionalProperties: false,
                  },
                  description: "Comments",
                },
              },
              required: [
                "id",
                "workspaceId",
                "projectId",
                "title",
                "status",
                "priority",
                "tags",
                "dependencies",
                "archived",
                "version",
              ],
              additionalProperties: false,
            },
            description: "Matching tasks",
          },
          total: {
            type: "integer",
            description: "Total matches",
          },
          offset: {
            type: "integer",
            description: "Offset",
          },
          limit: {
            type: "integer",
            description: "Limit",
          },
        },
        required: ["items", "total", "offset", "limit"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
        VIEW_NOT_FOUND: "Saved view not found.",
        INVALID_DATA: "Invalid domain data or unsupported transition.",
      },
    },
    "activity.events": {
      kind: "event",
      description:
        "Observe a finite replay of workspace audit events from an optional cursor.",
      guard: "canReadWorkspace",
      input: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            description: "Workspace identifier",
          },
        },
        required: ["workspaceId"],
        additionalProperties: false,
      },
      errors: {
        AUTH_REQUIRED: "A verified caller is required.",
        PERMISSION_DENIED:
          "Caller lacks permission to access or modify this workspace.",
      },
    },
  },
} as const satisfies Manifest;
