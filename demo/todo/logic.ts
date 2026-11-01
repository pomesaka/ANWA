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
