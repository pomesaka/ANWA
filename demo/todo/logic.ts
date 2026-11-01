import { fail, ok, reply, type NextInteraction, type VerifiedCaller } from "../../src/anwa.ts";
import type { InputOf } from "../../src/contracts.ts";
import { schema } from "./contract.generated.ts";
import {
  TodoState, type Role, type Workspace, type Task, type Project, type SavedFilter,
  type SavedView, type Priority, type StoredStatus,
  isoNow, validDate, addDays, normalizeTags, validPositive, validNonnegative
} from "./model.ts";

type Ref = keyof (typeof schema)["interactions"];
type Input<K extends Ref> = InputOf<(typeof schema)["interactions"][K]>;
const priority = new Set(["low","medium","high","urgent"]);
const now = () => isoNow();

export class TodoLogic {
  readonly state = new TodoState();

  private taskNext(workspaceId:string, taskId:string): NextInteraction[] {
    return [
      {ref:"task.get",input:{workspaceId,taskId},guidance:{level:"recommended"}},
      {ref:"task.plan",input:{workspaceId},guidance:{level:"available"}}
    ];
  }
  private projectNext(workspaceId:string,projectId:string): NextInteraction[] {
    return [
      {ref:"task.create",guidance:{level:"recommended"}},
      {ref:"task.list",input:{workspaceId,projectId},guidance:{level:"available"}}
    ];
  }
  private validPage(limit?:number,offset?:number):boolean {
    return (limit===undefined || (Number.isInteger(limit)&&limit>0&&limit<=100))
      && (offset===undefined || validNonnegative(offset));
  }
  private validDateField(value?:string):boolean {
    return value === undefined || value === "" || validDate(value);
  }
  private validMember(workspaceId:string,subject?:string):boolean {
    return !subject || !!this.state.workspace(workspaceId)?.members.has(subject);
  }
  private validPatch(workspaceId:string,patch:{
    title?:string;notes?:string;priority?:string;status?:string;dueAt?:string;
    tags?:readonly string[];assignee?:string;estimateMinutes?:number;recurrenceDays?:number
  }):boolean {
    if(patch.title !== undefined && !patch.title.trim())return false;
    if(patch.priority !== undefined && !priority.has(patch.priority))return false;
    if(patch.status !== undefined && !["todo","in_progress"].includes(patch.status))return false;
    if(!this.validDateField(patch.dueAt))return false;
    if(patch.tags && patch.tags.some(t=>!t.trim()))return false;
    if(!this.validMember(workspaceId,patch.assignee))return false;
    if(patch.estimateMinutes !== undefined && !validNonnegative(patch.estimateMinutes))return false;
    if(patch.recurrenceDays !== undefined && !validPositive(patch.recurrenceDays))return false;
    return true;
  }
  private applyPatch(task:Task,patch:{
    title?:string;notes?:string;priority?:string;status?:string;dueAt?:string;
    tags?:readonly string[];assignee?:string;estimateMinutes?:number;recurrenceDays?:number
  }):void {
    if(patch.title!==undefined)task.title=patch.title.trim();
    if(patch.notes!==undefined)task.notes=patch.notes;
    if(patch.priority!==undefined)task.priority=patch.priority as Priority;
    if(patch.status!==undefined)task.status=patch.status as StoredStatus;
    if(patch.dueAt!==undefined)task.dueAt=patch.dueAt||undefined;
    if(patch.tags!==undefined)task.tags=normalizeTags(patch.tags);
    if(patch.assignee!==undefined)task.assignee=patch.assignee||undefined;
    if(patch.estimateMinutes!==undefined)task.estimateMinutes=patch.estimateMinutes;
    if(patch.recurrenceDays!==undefined)task.recurrenceDays=patch.recurrenceDays;
    this.state.touch(task);
  }
  private conflict(workspaceId:string,taskId:string) {
    return reply(fail("VERSION_CONFLICT","Task version changed",{effects:"none"}),[
      {ref:"task.get",input:{workspaceId,taskId},guidance:{level:"recommended"}}
    ]);
  }
  private missingTask() {
    return reply(fail("TASK_NOT_FOUND","Task not found in workspace",{effects:"none"}));
  }
  private invalid(reason:string) {
    return reply(fail("INVALID_DATA",reason,{effects:"none"}));
  }
  private task(workspaceId:string,taskId:string) {return this.state.task(workspaceId,taskId);}
  private audit(workspaceId:string,caller:VerifiedCaller,type:string,entity:string,id:string):void {
    this.state.audit(workspaceId,caller.subject,type,entity,id);
  }

  workspaceCreate(input:Input<"workspace.create">,caller:VerifiedCaller) {
    if(!input.name.trim())return this.invalid("Workspace name required");
    const workspace:Workspace={id:this.state.newId("ws"),name:input.name.trim(),
      members:new Map([[caller.subject,"owner"]])};
    this.state.workspaces.set(workspace.id,workspace);
    this.audit(workspace.id,caller,"workspace.created","workspace",workspace.id);
    return reply(ok({workspace:{id:workspace.id,name:workspace.name,role:"owner" as const,members:1}}),[
      {ref:"project.create",guidance:{level:"recommended"}},
      {ref:"workspace.dashboard",input:{workspaceId:workspace.id},guidance:{level:"available"}}
    ]);
  }
  workspaceList(caller:VerifiedCaller) {
    const workspaces=[...this.state.workspaces.values()]
      .filter(w=>w.members.has(caller.subject))
      .map(w=>({id:w.id,name:w.name,role:w.members.get(caller.subject)!,members:w.members.size}));
    return reply(ok({workspaces}));
  }
  workspaceInvite(input:Input<"workspace.invite">,caller:VerifiedCaller) {
    const w=this.state.workspace(input.workspaceId)!;
    if(!input.subject.trim())return this.invalid("Member subject required");
    if(w.members.has(input.subject))return reply(fail("MEMBER_EXISTS","Member already invited"));
    w.members.set(input.subject,input.role as Role);
    this.audit(w.id,caller,"member.added","member",input.subject);
    return reply(ok({member:{subject:input.subject,role:input.role}}),[
      {ref:"workspace.members",input:{workspaceId:w.id},guidance:{level:"recommended"}}
    ]);
  }
  workspaceMembers(input:Input<"workspace.members">) {
    const w=this.state.workspace(input.workspaceId)!;
    return reply(ok({members:[...w.members.entries()].map(([subject,role])=>({subject,role}))}));
  }
  workspaceDashboard(input:Input<"workspace.dashboard">) {
    const tasks=this.state.tasksIn(input.workspaceId);
    const byStatus={todo:0,in_progress:0,blocked:0,done:0};
    let overdue=0,dueSoon=0;
    const cutoff=Date.now()+7*86400000;
    for(const t of tasks){
      const status=this.state.effectiveStatus(t);byStatus[status]++;
      if(status==="done"||!t.dueAt)continue;
      const due=Date.parse(t.dueAt);
      if(due<Date.now())overdue++;
      else if(due<=cutoff)dueSoon++;
    }
    const byProject=[...this.state.projects.values()]
      .filter(p=>p.workspaceId===input.workspaceId && !p.archived)
      .map(p=>({projectId:p.id,name:p.name,total:tasks.filter(t=>t.projectId===p.id).length,
        done:tasks.filter(t=>t.projectId===p.id&&t.status==="done").length}));
    return reply(ok({total:tasks.length,done:byStatus.done,overdue,dueSoon,byStatus,byProject}),[
      {ref:"task.plan",input:{workspaceId:input.workspaceId},guidance:{level:"recommended"}},
      {ref:"task.board",input:{workspaceId:input.workspaceId},guidance:{level:"available"}}
    ]);
  }
  projectCreate(input:Input<"project.create">,caller:VerifiedCaller) {
    if(!input.name.trim())return this.invalid("Project name required");
    const project:Project={id:this.state.newId("prj"),workspaceId:input.workspaceId,
      name:input.name.trim(),description:input.description??"",archived:false,version:1};
    this.state.projects.set(project.id,project);
    this.audit(input.workspaceId,caller,"project.created","project",project.id);
    return reply(ok({project:{...project}}),this.projectNext(input.workspaceId,project.id));
  }
  projectList(input:Input<"project.list">) {
    const projects=[...this.state.projects.values()]
      .filter(p=>p.workspaceId===input.workspaceId && (input.includeArchived || !p.archived))
      .map(p=>({...p}));
    return reply(ok({projects}));
  }
  projectUpdate(input:Input<"project.update">,caller:VerifiedCaller) {
    const p=this.state.project(input.workspaceId,input.projectId);
    if(!p)return reply(fail("PROJECT_NOT_FOUND","Project not found"));
    if(p.version!==input.expectedVersion)return reply(fail("VERSION_CONFLICT","Project version changed", {effects:"none"}),[
      {ref:"project.list",input:{workspaceId:input.workspaceId},guidance:{level:"recommended"}}
    ]);
    if(input.name!==undefined && !input.name.trim())return this.invalid("Project name required");
    if(input.name!==undefined)p.name=input.name.trim();
    if(input.description!==undefined)p.description=input.description;
    if(input.archived!==undefined)p.archived=input.archived;
    p.version++;
    this.audit(input.workspaceId,caller,"project.updated","project",p.id);
    return reply(ok({project:{...p}}),this.projectNext(input.workspaceId,p.id));
  }

  taskCreate(input:Input<"task.create">,caller:VerifiedCaller) {
    const p=this.state.project(input.workspaceId,input.projectId);
    if(!p||p.archived)return reply(fail("PROJECT_NOT_FOUND","Active project not found"));
    if(!input.title.trim()||!this.validDateField(input.dueAt)||
       (input.estimateMinutes!==undefined&&!validNonnegative(input.estimateMinutes))||
       (input.recurrenceDays!==undefined&&!validPositive(input.recurrenceDays))||
       !this.validMember(input.workspaceId,input.assignee)||
       (input.tags??[]).some(t=>!t.trim()))return this.invalid("Invalid task attributes");
    if(input.parentId){
      const parent=this.task(input.workspaceId,input.parentId);
      if(!parent||parent.projectId!==p.id||parent.archived)
        return reply(fail("INVALID_PARENT","Parent must be an active task in same project"));
    }
    const timestamp=now();
    const task:Task={id:this.state.newId("tsk"),workspaceId:input.workspaceId,
      projectId:p.id,title:input.title.trim(),notes:input.notes??"",status:"todo",
      priority:input.priority??"medium",dueAt:input.dueAt||undefined,
      tags:normalizeTags(input.tags??[]),assignee:input.assignee,estimateMinutes:input.estimateMinutes,
      recurrenceDays:input.recurrenceDays,parentId:input.parentId,
      dependencies:[],version:1,archived:false,createdAt:timestamp,updatedAt:timestamp,
      comments:[]};
    this.state.tasks.set(task.id,task);
    this.audit(input.workspaceId,caller,"task.created","task",task.id);
    return reply(ok({task:this.state.snapshot(task)}),this.taskNext(input.workspaceId,task.id));
  }
  taskGet(input:Input<"task.get">) {
    const t=this.task(input.workspaceId,input.taskId);
    return t?reply(ok({task:this.state.snapshot(t)})):this.missingTask();
  }
  taskList(input:Input<"task.list">) {
    if(!this.validPage(input.limit,input.offset))return this.invalid("Invalid pagination");
    let items=this.state.tasksIn(input.workspaceId,input.includeArchived);
    if(input.projectId)items=items.filter(t=>t.projectId===input.projectId);
    if(input.parentId)items=items.filter(t=>t.parentId===input.parentId);
    items.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
    const offset=input.offset??0,limit=input.limit??30,total=items.length;
    return reply(ok({items:items.slice(offset,offset+limit).map(t=>this.state.snapshot(t)),total,offset,limit}));
  }
  taskUpdate(input:Input<"task.update">,caller:VerifiedCaller) {
    const t=this.task(input.workspaceId,input.taskId);
    if(!t)return this.missingTask();
    if(t.archived)return reply(fail("ARCHIVED","Restore before editing"));
    if(t.version!==input.expectedVersion)return this.conflict(input.workspaceId,t.id);
    if(!Object.keys(input.patch).length || !this.validPatch(input.workspaceId,input.patch))
      return this.invalid("Invalid task patch");
    this.applyPatch(t,input.patch);
    this.audit(input.workspaceId,caller,"task.updated","task",t.id);
    return reply(ok({task:this.state.snapshot(t)}),this.taskNext(input.workspaceId,t.id));
  }

  taskComplete(input:Input<"task.complete">,caller:VerifiedCaller) {
    const t=this.task(input.workspaceId,input.taskId);
    if(!t)return this.missingTask();
    if(t.archived)return reply(fail("ARCHIVED","Archived task cannot be completed"));
    if(t.version!==input.expectedVersion)return this.conflict(input.workspaceId,t.id);
    if(t.status==="done")return reply(fail("ALREADY_DONE","Task already completed"));
    const unresolved=t.dependencies.filter(id=>this.state.tasks.get(id)?.status!=="done");
    if(unresolved.length)return reply(fail("DEPENDENCY_BLOCKED","Finish dependencies first",{effects:"none"}),
      unresolved.slice(0,5).map(taskId=>({ref:"task.get",input:{workspaceId:input.workspaceId,taskId},
        guidance:{level:"recommended"}})));
    t.status="done";t.completedAt=now();this.state.touch(t);
    this.audit(input.workspaceId,caller,"task.completed","task",t.id);
    let spawnedId: string|undefined;
    if(t.recurrenceDays) {
      const timestamp=now();
      const next:Task={...t,id:this.state.newId("tsk"),version:1,status:"todo",
        completedAt:undefined,originId:t.originId??t.id,dependencies:[],
        dueAt:addDays(t.dueAt??timestamp,t.recurrenceDays),
        archived:false,createdAt:timestamp,updatedAt:timestamp,comments:[],
        tags:[...t.tags]};
      this.state.tasks.set(next.id,next);
      this.audit(input.workspaceId,caller,"task.recurrence.created","task",next.id);
      spawnedId=next.id;
    }
    return reply(ok({task:this.state.snapshot(t),...(spawnedId?{spawnedId}:{})}),[
      ...this.taskNext(input.workspaceId,t.id),
      ...(spawnedId?[{ref:"task.get",input:{workspaceId:input.workspaceId,taskId:spawnedId},
        guidance:{level:"recommended" as const}}]:[])
    ]);
  }
  taskReopen(input:Input<"task.reopen">,caller:VerifiedCaller) {
    const t=this.task(input.workspaceId,input.taskId);
    if(!t)return this.missingTask();
    if(t.archived)return reply(fail("ARCHIVED","Restore before reopening"));
    if(t.version!==input.expectedVersion)return this.conflict(input.workspaceId,t.id);
    if(t.status!=="done")return reply(fail("NOT_DONE","Task is not complete"));
    t.status="todo";t.completedAt=undefined;this.state.touch(t);
    this.audit(input.workspaceId,caller,"task.reopened","task",t.id);
    return reply(ok({task:this.state.snapshot(t)}),this.taskNext(input.workspaceId,t.id));
  }
  taskArchive(input:Input<"task.archive">,caller:VerifiedCaller) {
    const t=this.task(input.workspaceId,input.taskId);
    if(!t)return this.missingTask();
    if(t.version!==input.expectedVersion)return this.conflict(input.workspaceId,t.id);
    if(t.archived)return reply(fail("ARCHIVED","Already archived"));
    t.archived=true;this.state.touch(t);
    this.audit(input.workspaceId,caller,"task.archived","task",t.id);
    return reply(ok({task:this.state.snapshot(t)}),[
      {ref:"task.restore",input:{workspaceId:input.workspaceId,taskId:t.id,expectedVersion:t.version},
        guidance:{level:"available"}}
    ]);
  }
  taskRestore(input:Input<"task.restore">,caller:VerifiedCaller) {
    const t=this.task(input.workspaceId,input.taskId);
    if(!t)return this.missingTask();
    if(t.version!==input.expectedVersion)return this.conflict(input.workspaceId,t.id);
    if(!t.archived)return this.invalid("Task is not archived");
    t.archived=false;this.state.touch(t);
    this.audit(input.workspaceId,caller,"task.restored","task",t.id);
    return reply(ok({task:this.state.snapshot(t)}),this.taskNext(input.workspaceId,t.id));
  }
  dependencyAdd(input:Input<"task.dependency.add">,caller:VerifiedCaller) {
    const t=this.task(input.workspaceId,input.taskId);
    const dep=this.task(input.workspaceId,input.dependsOnId);
    if(!t||!dep)return this.missingTask();
    if(t.archived)return reply(fail("ARCHIVED","Restore before editing dependencies"));
    if(t.version!==input.expectedVersion)return this.conflict(input.workspaceId,t.id);
    if(t.dependencies.includes(dep.id))return reply(fail("ALREADY_DEPENDENT","Already depends on task"));
    if(this.state.createsCycle(t.id,dep.id))return reply(fail("DEPENDENCY_CYCLE","Dependency cycle would form",{effects:"none"}),[
      {ref:"task.get",input:{workspaceId:input.workspaceId,taskId:dep.id},guidance:{level:"recommended"}}
    ]);
    t.dependencies.push(dep.id);this.state.touch(t);
    this.audit(input.workspaceId,caller,"dependency.added","task",t.id);
    return reply(ok({task:this.state.snapshot(t)}),[
      {ref:"task.get",input:{workspaceId:input.workspaceId,taskId:dep.id},guidance:{level:"recommended"}}
    ]);
  }
  dependencyRemove(input:Input<"task.dependency.remove">,caller:VerifiedCaller) {
    const t=this.task(input.workspaceId,input.taskId);
    if(!t)return this.missingTask();
    if(t.archived)return reply(fail("ARCHIVED","Restore before editing dependencies"));
    if(t.version!==input.expectedVersion)return this.conflict(input.workspaceId,t.id);
    if(!t.dependencies.includes(input.dependsOnId))
      return this.invalid("Dependency not found");
    t.dependencies=t.dependencies.filter(id=>id!==input.dependsOnId);
    this.state.touch(t);
    this.audit(input.workspaceId,caller,"dependency.removed","task",t.id);
    return reply(ok({task:this.state.snapshot(t)}),this.taskNext(input.workspaceId,t.id));
  }
  taskBulkUpdate(input:Input<"task.bulkUpdate">,caller:VerifiedCaller) {
    const updates=input.updates;
    if(!updates.length||updates.length>100)return this.invalid("Bulk update requires 1 to 100 tasks");
    const seen=new Set<string>(),staged: Array<{task:Task,patch:(typeof updates)[number]["patch"]}>=[];
    for(const update of updates) {
      if(seen.has(update.taskId))return reply(fail("DUPLICATE_ITEM","Duplicate task in batch"));
      seen.add(update.taskId);
      const t=this.task(input.workspaceId,update.taskId);
      if(!t)return this.missingTask();
      if(t.archived)return reply(fail("ARCHIVED","Cannot bulk edit archived tasks"));
      if(t.version!==update.expectedVersion)return this.conflict(input.workspaceId,t.id);
      if(!Object.keys(update.patch).length||!this.validPatch(input.workspaceId,update.patch))
        return this.invalid("Invalid bulk patch");
      staged.push({task:t,patch:update.patch});
    }
    // All checks above happen before the first mutation, giving an in-memory atomic batch.
    for(const {task,patch} of staged) {
      this.applyPatch(task,patch);
      this.audit(input.workspaceId,caller,"task.bulk.updated","task",task.id);
    }
    return reply(ok({items:staged.map(({task})=>this.state.snapshot(task)),count:staged.length}),[
      {ref:"task.board",input:{workspaceId:input.workspaceId},guidance:{level:"recommended"}}
    ]);
  }
  taskSearch(input:Input<"task.search">) {
    if(!this.validPage(input.limit,input.offset)||!this.validDateField(input.dueBefore)||
       !this.validDateField(input.dueAfter))return this.invalid("Invalid search filters");
    const result=this.state.search(input.workspaceId,input,input.offset??0,input.limit??30);
    return reply(ok(result),result.items.slice(0,3).map(t=>({
      ref:"task.get",input:{workspaceId:input.workspaceId,taskId:t.id},guidance:{level:"available"}
    })));
  }
  taskBoard(input:Input<"task.board">) {
    const groups:{todo:Task[];in_progress:Task[];blocked:Task[];done:Task[]}={
      todo:[],in_progress:[],blocked:[],done:[]};
    for(const t of this.state.tasksIn(input.workspaceId)) {
      if(input.projectId&&t.projectId!==input.projectId)continue;
      groups[this.state.effectiveStatus(t)].push(t);
    }
    return reply(ok({
      todo:groups.todo.map(t=>this.state.snapshot(t)),
      in_progress:groups.in_progress.map(t=>this.state.snapshot(t)),
      blocked:groups.blocked.map(t=>this.state.snapshot(t)),
      done:groups.done.map(t=>this.state.snapshot(t))
    }),[{ref:"task.plan",input:{workspaceId:input.workspaceId},guidance:{level:"recommended"}}]);
  }
  taskPlan(input:Input<"task.plan">) {
    const limit=input.limit??10;
    if(!this.validPage(limit,0))return this.invalid("Invalid plan size");
    const active=this.state.tasksIn(input.workspaceId).filter(t=>t.status!=="done");
    const blocked=active.filter(t=>this.state.isBlocked(t)).length;
    const ready=active.filter(t=>!this.state.isBlocked(t)&&
      (!input.assignee||t.assignee===input.assignee));
    ready.sort((a,b)=>this.state.priorityScore(b)-this.state.priorityScore(a)
      || a.id.localeCompare(b.id));
    const items=ready.slice(0,limit).map(t=>this.state.snapshot(t));
    return reply(ok({items,blocked}),items.slice(0,5).map(t=>({
      ref:"task.get",input:{workspaceId:input.workspaceId,taskId:t.id},
      guidance:{level:"recommended"}
    })));
  }
  taskComment(input:Input<"task.comment">,caller:VerifiedCaller) {
    const t=this.task(input.workspaceId,input.taskId);
    if(!t)return this.missingTask();
    if(t.archived)return reply(fail("ARCHIVED","Cannot comment on archived task"));
    if(!input.body.trim())return this.invalid("Comment cannot be empty");
    t.comments.push({author:caller.subject,body:input.body.trim(),at:now()});
    this.state.touch(t);
    this.audit(input.workspaceId,caller,"task.commented","task",t.id);
    return reply(ok({task:this.state.snapshot(t)}),this.taskNext(input.workspaceId,t.id));
  }

  viewSave(input:Input<"view.save">,caller:VerifiedCaller) {
    if(!input.name.trim() || !this.validDateField(input.query.dueBefore))
      return this.invalid("Invalid view parameters");
    const view:SavedView={id:this.state.newId("view"),workspaceId:input.workspaceId,
      name:input.name.trim(),query:{...input.query},creator:caller.subject};
    this.state.views.set(view.id,view);
    this.audit(input.workspaceId,caller,"view.saved","view",view.id);
    return reply(ok({view:{id:view.id,name:view.name,query:view.query,creator:view.creator}}),[
      {ref:"view.run",input:{workspaceId:input.workspaceId,viewId:view.id},
        guidance:{level:"recommended"}}
    ]);
  }
  viewList(input:Input<"view.list">) {
    return reply(ok({views:[...this.state.views.values()].filter(v=>v.workspaceId===input.workspaceId)
      .map(v=>({id:v.id,name:v.name,query:{...v.query},creator:v.creator}))}));
  }
  viewRun(input:Input<"view.run">) {
    if(!this.validPage(input.limit,input.offset))return this.invalid("Invalid view pagination");
    const view=this.state.view(input.workspaceId,input.viewId);
    if(!view)return reply(fail("VIEW_NOT_FOUND","Saved view does not exist"));
    const result=this.state.search(input.workspaceId,view.query,input.offset??0,input.limit??30);
    return reply(ok(result),result.items.slice(0,3).map(t=>({
      ref:"task.get",input:{workspaceId:input.workspaceId,taskId:t.id},guidance:{level:"available"}
    })));
  }
  /** A finite, cursor-based replay of audit messages; this is not a durable live stream. */
  async *activityEvents(input:Input<"activity.events">,cursor=0) {
    const events=this.state.activity.get(input.workspaceId)??[];
    if(!Number.isInteger(cursor)||cursor<0)throw Error("Invalid cursor");
    for(const event of events.slice(cursor))yield {...event};
  }
}
