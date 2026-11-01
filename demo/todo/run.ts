import { createTodo } from "./index.ts";
import type { InteractionResponse } from "../../src/anwa.ts";

const alice = { caller: { subject: "alice" } } as const;
const bob = { caller: { subject: "bob" } } as const;
const app = createTodo();
const show = (title: string, value: unknown) =>
  console.log("\n" + title + "\n" + JSON.stringify(value, null, 2));
function get<T>(response: InteractionResponse<T>): T {
  if(response.outcome.kind!=="settled" || !response.outcome.result.ok)
    throw Error("Unexpected failure: "+JSON.stringify(response.outcome));
  return response.outcome.result.value;
}

show("Authenticated catalog (27 Interactions)", app.catalog(alice));
const workspace = get(await app.interact("workspace.create",{name:"Launch team"},alice)).workspace;
show("New workspace",workspace);
get(await app.interact("workspace.invite",{
  workspaceId:workspace.id,subject:"bob",role:"editor"
},alice));
const project = get(await app.interact("project.create",{
  workspaceId:workspace.id,name:"2026 Product Launch",description:"Launch readiness"
},alice)).project;

const design=get(await app.interact("task.create",{
  workspaceId:workspace.id,projectId:project.id,title:"Approve product design",
  priority:"high",tags:["design","launch"]
},alice)).task;
const launch=get(await app.interact("task.create",{
  workspaceId:workspace.id,projectId:project.id,title:"Publish release",
  dueAt:"2026-11-05",priority:"urgent",tags:["launch"],
  assignee:"bob",recurrenceDays:7
},alice)).task;
get(await app.interact("task.dependency.add",{
  workspaceId:workspace.id,taskId:launch.id,dependsOnId:design.id,
  expectedVersion:launch.version
},bob));

const blocked = await app.interact("task.complete",{
  workspaceId:workspace.id,taskId:launch.id,expectedVersion:launch.version+1
},bob);
show("Dependency blocks release (with next options)",blocked);
get(await app.interact("task.complete",{
  workspaceId:workspace.id,taskId:design.id,expectedVersion:design.version
},alice));
const completed=get(await app.interact("task.complete",{
  workspaceId:workspace.id,taskId:launch.id,expectedVersion:launch.version+1
},bob));
show("Release completed; next occurrence created",completed);

show("Workspace dashboard",get(await app.interact("workspace.dashboard",{
  workspaceId:workspace.id
},alice)));
show("Suggested next tasks",get(await app.interact("task.plan",{
  workspaceId:workspace.id
},bob)));
const saved=get(await app.interact("view.save",{
  workspaceId:workspace.id,name:"Launch priorities",query:{tag:"launch",sortBy:"priority"}
},alice)).view;
show("Reusable saved view",get(await app.interact("view.run",{
  workspaceId:workspace.id,viewId:saved.id
},bob)));

const events=[];
for await (const e of app.observe("activity.events",{workspaceId:workspace.id},{cursor:0},alice))
  events.push(e);
show("Audit activity replay",events);
show("Anonymous catalog (denied by default)",app.catalog());
