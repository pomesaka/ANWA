import { AnwaApp, type VerifiedCaller } from "../../src/anwa.ts";
import type { GuardDecision } from "../../src/contracts.ts";
import { schema } from "./contract.generated.ts";
import { TodoLogic } from "./logic.ts";

export function createTodo(): AnwaApp<typeof schema> {
  const logic = new TodoLogic();
  type Access = GuardDecision<"AUTH_REQUIRED" | "PERMISSION_DENIED">;
  const check = (
    caller: VerifiedCaller | null,
    workspaceId: string,
    role: "viewer" | "editor" | "owner",
  ): Access => {
    if (!caller)
      return {
        allowed: false,
        error: { code: "AUTH_REQUIRED", effects: "none" },
      };
    const member = logic.state
      .workspace(workspaceId)
      ?.members.get(caller.subject);
    if (!member)
      return {
        allowed: false,
        error: { code: "PERMISSION_DENIED", effects: "none" },
      };
    if (role === "owner" && member !== "owner")
      return {
        allowed: false,
        error: { code: "PERMISSION_DENIED", effects: "none" },
      };
    if (role === "editor" && member === "viewer")
      return {
        allowed: false,
        error: { code: "PERMISSION_DENIED", effects: "none" },
      };
    return { allowed: true };
  };
  const denied = () => [];
  return new AnwaApp(schema).bind(
    {
      "workspace.create": {
        run: async ({ input, caller }) => logic.workspaceCreate(input, caller!),
        onDenied: denied,
      },
      "workspace.list": {
        run: async ({ caller }) => logic.workspaceList(caller!),
        onDenied: denied,
      },
      "workspace.invite": {
        run: async ({ input, caller }) => logic.workspaceInvite(input, caller!),
        onDenied: denied,
      },
      "workspace.members": {
        run: async ({ input }) => logic.workspaceMembers(input),
        onDenied: denied,
      },
      "workspace.dashboard": {
        run: async ({ input }) => logic.workspaceDashboard(input),
        onDenied: denied,
      },
      "project.create": {
        run: async ({ input, caller }) => logic.projectCreate(input, caller!),
        onDenied: denied,
      },
      "project.list": {
        run: async ({ input }) => logic.projectList(input),
        onDenied: denied,
      },
      "project.update": {
        run: async ({ input, caller }) => logic.projectUpdate(input, caller!),
        onDenied: denied,
      },
      "task.create": {
        run: async ({ input, caller }) => logic.taskCreate(input, caller!),
        onDenied: denied,
      },
      "task.get": {
        run: async ({ input }) => logic.taskGet(input),
        onDenied: denied,
      },
      "task.list": {
        run: async ({ input }) => logic.taskList(input),
        onDenied: denied,
      },
      "task.update": {
        run: async ({ input, caller }) => logic.taskUpdate(input, caller!),
        onDenied: denied,
      },
      "task.complete": {
        run: async ({ input, caller }) => logic.taskComplete(input, caller!),
        onDenied: denied,
      },
      "task.reopen": {
        run: async ({ input, caller }) => logic.taskReopen(input, caller!),
        onDenied: denied,
      },
      "task.archive": {
        run: async ({ input, caller }) => logic.taskArchive(input, caller!),
        onDenied: denied,
      },
      "task.restore": {
        run: async ({ input, caller }) => logic.taskRestore(input, caller!),
        onDenied: denied,
      },
      "task.dependency.add": {
        run: async ({ input, caller }) => logic.dependencyAdd(input, caller!),
        onDenied: denied,
      },
      "task.dependency.remove": {
        run: async ({ input, caller }) =>
          logic.dependencyRemove(input, caller!),
        onDenied: denied,
      },
      "task.bulkUpdate": {
        run: async ({ input, caller }) => logic.taskBulkUpdate(input, caller!),
        onDenied: denied,
      },
      "task.search": {
        run: async ({ input }) => logic.taskSearch(input),
        onDenied: denied,
      },
      "task.board": {
        run: async ({ input }) => logic.taskBoard(input),
        onDenied: denied,
      },
      "task.plan": {
        run: async ({ input }) => logic.taskPlan(input),
        onDenied: denied,
      },
      "task.comment": {
        run: async ({ input, caller }) => logic.taskComment(input, caller!),
        onDenied: denied,
      },
      "view.save": {
        run: async ({ input, caller }) => logic.viewSave(input, caller!),
        onDenied: denied,
      },
      "view.list": {
        run: async ({ input }) => logic.viewList(input),
        onDenied: denied,
      },
      "view.run": {
        run: async ({ input }) => logic.viewRun(input),
        onDenied: denied,
      },
      "activity.events": {
        run: ({ input, cursor }) => logic.activityEvents(input, cursor),
      },
    },
    {
      // Only callers verified by the adapter can discover this app's capabilities.
      discoverable: ({ caller }) => caller !== null,
      guards: {
        requireCaller: async ({ caller }) =>
          caller
            ? { allowed: true }
            : {
                allowed: false,
                error: { code: "AUTH_REQUIRED", effects: "none" },
              },
        canReadWorkspace: async ({ input, caller }) =>
          check(caller, input.workspaceId, "viewer"),
        canWriteWorkspace: async ({ input, caller }) =>
          check(caller, input.workspaceId, "editor"),
        canManageWorkspace: async ({ input, caller }) =>
          check(caller, input.workspaceId, "owner"),
      },
    },
  );
}
