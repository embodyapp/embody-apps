import { definePlugin, HookVetoError, NotFoundError, z, type EntityRecord, type EntityStoreAccessor, type KernelContext } from "@embody/core";
import { boardInputSchema, boardSchema, moveTaskInputSchema, taskStatusSchema } from './board-schema.js';

const text = z.string().trim().min(1);
// Zod 4 .default() survives .partial(), resetting omitted fields in generated updates.
// Preprocessing defaults applies them on create without inserting them into patches.
const defaulted = <S extends z.ZodType>(schema: S, value: z.output<S>) => z.preprocess(input => input === undefined ? value : input, schema);
export const projectSchema = z.object({ name: text, description: defaulted(z.string(), "") });
export const taskSchema = z.object({
  projectId: z.uuid(), parentTaskId: defaulted(z.uuid().nullable(), null),
  title: text, description: defaulted(z.string(), ""), definitionOfDone: text,
  status: defaulted(z.enum(["todo", "in_progress", "done", "canceled"]), "todo"),
  blockerIds: defaulted(z.array(z.uuid()).max(100), []), cancellationReason: defaulted(text.nullable(), null),
});
export const commentSchema = z.object({
  taskId: z.uuid(), body: text, authorId: z.string().default(""), authorType: z.enum(["human", "agent", "system"]).default("system"),
  sequence: z.number().int().nonnegative().default(0),
});
type Task = z.output<typeof taskSchema>;
type Comment = z.output<typeof commentSchema>;
const stores = (ctx: KernelContext) => ctx.entities as unknown as {
  project: EntityStoreAccessor<z.output<typeof projectSchema>>;
  task: EntityStoreAccessor<Task>;
  comment: EntityStoreAccessor<Comment>;
};
const deny = (message: string): never => { throw new HookVetoError(message); };
async function requireReference<T>(read: Promise<T>, kind: string): Promise<T> {
  try { return await read; } catch (error) {
    if (error instanceof NotFoundError) return deny(`${kind} was not found in this organization.`);
    throw error;
  }
}
// Full, bounded scans: reject rather than silently validate a truncated graph.
async function projectTasks(ctx: KernelContext, projectId: string) {
  const records: EntityRecord<Task>[] = [];
  for (let offset = 0; offset <= 1000; offset += 100) {
    const page = await stores(ctx).task.list({ filter: { projectId }, limit: 100, offset });
    records.push(...page);
    if (records.length > 1000) deny("Project exceeds the v1 graph limit of 1000 tasks.");
    if (page.length < 100) return records;
  }
  return records;
}
async function validateTask(data: Task, ctx: KernelContext, id?: string) {
  if (data.status === "canceled" && !data.cancellationReason) deny("Cancellation requires a nonempty reason.");
  if (data.status !== "canceled" && data.cancellationReason !== null) deny("Non-canceled tasks must clear cancellationReason explicitly.");
  await requireReference(stores(ctx).project.get(data.projectId), "Project");
  if (new Set(data.blockerIds).size !== data.blockerIds.length) deny("Duplicate blocker IDs are not allowed.");
  const records = await projectTasks(ctx, data.projectId);
  if (!id && records.length >= 1000) deny("Project exceeds the v1 graph limit of 1000 tasks.");
  const graph = new Map(records.map(r => [r.id, r.data]));
  for (const ref of [...data.blockerIds, ...(data.parentTaskId ? [data.parentTaskId] : [])]) {
    if (ref === id) deny("Task cannot reference itself.");
    if (!graph.has(ref)) deny("Referenced task must exist in the same project.");
  }
  if (id) {
    graph.set(id, data);
    for (const kind of ["blockerIds", "parentTaskId"] as const) {
      const pending = kind === "blockerIds" ? [...data.blockerIds] : data.parentTaskId ? [data.parentTaskId] : [];
      const visited = new Set<string>();
      while (pending.length) {
        const next = pending.pop()!;
        if (next === id) deny(`${kind === "blockerIds" ? "Dependency" : "Hierarchy"} would introduce a cycle.`);
        if (visited.has(next)) continue;
        visited.add(next);
        const node = graph.get(next);
        if (!node) return deny("Referenced task must exist in the same project.");
        pending.push(...(kind === "blockerIds" ? node.blockerIds : node.parentTaskId ? [node.parentTaskId] : []));
      }
    }
  }
}
async function addComment(ctx: KernelContext, taskId: string, body: string) {
  return stores(ctx).comment.create({ taskId, body, authorId: ctx.principal.actorId, authorType: ctx.principal.actorType, sequence: 0 });
}
const taskRecord = z.object({ id: z.uuid(), data: taskSchema });
const taskCreate = z.object({ data: taskSchema });
const taskUpdate = z.object({ current: taskRecord, patch: taskSchema.partial() });
function requireOwner(ctx: KernelContext) {
  if (ctx.principal.actorType !== "human" || !ctx.principal.roles.includes("owner")) deny("Deletion requires a human owner role.");
}
export default definePlugin({
  id: "tracker", version: "0.1.0",
  entities: {
    project: { description: "A project containing independently tracked tasks.", schema: projectSchema },
    task: { description: "Work with explicit completion criteria. Blockers and children are informational, not completion gates.", schema: taskSchema, indexes: ["projectId", "status", "parentTaskId"] },
    comment: { description: "Append-only discussion and evidence attributed to the caller.", schema: commentSchema, indexes: ["taskId", "sequence"], defaultSort: { field: "sequence", direction: "asc" } },
  },
  actions: {
    moveTask: {
      description: 'Move a task between board columns. Supply its last-read expectedStatus; refresh if it changed. Cancellation requires a reason. Reopening clears that reason and preserves attributed history through the existing task hooks.',
      input: moveTaskInputSchema,
      output: z.object({ id: z.uuid(), status: taskStatusSchema }),
      handler: async ({ id, status, expectedStatus, cancellationReason }: z.output<typeof moveTaskInputSchema>, ctx: KernelContext) => {
        const current = await stores(ctx).task.get(id);
        if (current.data.status !== expectedStatus) deny('Task status changed. Refresh the board before moving it.');
        if (status === 'canceled' && !cancellationReason) deny('Cancellation requires a nonempty reason.');
        const updated = await stores(ctx).task.update(id, { status, cancellationReason: status === 'canceled' ? cancellationReason : null });
        return { id: updated.id, status: updated.data.status };
      },
    },
    getBoard: {
      description: 'Read a tenant-scoped page of tasks with a GenUI board. Optionally filter by project; nextOffset identifies the next page. Blocker IDs are informational and may be outside this page.',
      input: boardInputSchema,
      output: boardSchema,
      handler: async ({ projectId, offset, limit }: z.output<typeof boardInputSchema>, ctx: KernelContext) => {
        const project = projectId ? await stores(ctx).project.get(projectId) : null;
        const query = { ...(projectId ? { filter: { projectId } } : {}), offset, limit };
        const tasks = await stores(ctx).task.list(query);
        const more = await stores(ctx).task.list({ ...query, offset: offset + tasks.length, limit: 1 });
        return { title: project?.data.name ?? 'All projects', projectId: projectId ?? null,
          offset, limit, nextOffset: more.length ? offset + tasks.length : null,
          tasks: tasks.map(task => ({ id: task.id, ...task.data })) };
      },
    },
    addComment: {
      description: "Append discussion or evidence. Authorship and chronological sequence are server supplied.",
      input: z.object({ taskId: z.uuid(), body: text }).strict(),
      handler: ({ taskId, body }: { taskId: string; body: string }, ctx: KernelContext) => addComment(ctx, taskId, body),
    },
    getTaskContext: {
      description: "Read task, project, all blockers (maximum 100), and a page of direct children. Comments use comment.list filtered by taskId.",
      input: z.object({ taskId: z.uuid(), childrenOffset: z.number().int().nonnegative().default(0), childrenLimit: z.number().int().min(1).max(100).default(20) }),
      handler: async ({ taskId, childrenOffset, childrenLimit }: { taskId: string; childrenOffset: number; childrenLimit: number }, ctx: KernelContext) => {
        const task = await stores(ctx).task.get(taskId);
        const project = await stores(ctx).project.get(task.data.projectId);
        const blockers = await stores(ctx).task.getMany(task.data.blockerIds);
        const unresolvedBlockerIds = blockers.filter(b => b.data.status !== "done").map(b => b.id);
        const children = await stores(ctx).task.list({ filter: { parentTaskId: taskId }, limit: childrenLimit, offset: childrenOffset });
        const childrenTruncated = (await stores(ctx).task.list({ filter: { parentTaskId: taskId }, limit: 1, offset: childrenOffset + children.length })).length > 0;
        return { task, project, blockers, unresolvedBlockerIds, isBlocked: unresolvedBlockerIds.length > 0,
          children, childrenTruncated, nextChildrenOffset: childrenTruncated ? childrenOffset + children.length : null };
      },
    },
  },
  hooks: {
    "tracker.comment.beforeCreate": async (payload, ctx) => {
      const { data } = z.object({ data: commentSchema }).parse(payload);
      await requireReference(stores(ctx).task.get(data.taskId), "Task");
      const last = await stores(ctx).comment.list({ filter: { taskId: data.taskId }, sort: { field: "sequence", direction: "desc" }, limit: 1 });
      // Embody supplies the normalized object that it then persists. Replace all trusted fields.
      Object.assign((payload as { data: Comment }).data, { authorId: ctx.principal.actorId, authorType: ctx.principal.actorType, sequence: (last[0]?.data.sequence ?? 0) + 1 });
    },
    "tracker.comment.beforeUpdate": () => deny("Comments are append-only."),
    "tracker.comment.beforeDelete": () => deny("Comments are append-only."),
    "tracker.task.afterCreate": async (payload, ctx) => {
      const { record } = z.object({ record: taskRecord }).parse(payload);
      if (record.data.status === "canceled") await addComment(ctx, record.id, `Canceled: ${record.data.cancellationReason}`);
    },
    "tracker.task.afterUpdate": async (payload, ctx) => {
      const { current, updated } = z.object({ current: taskRecord, updated: taskRecord }).parse(payload);
      if (updated.data.status === "canceled" && (current.data.status !== "canceled" || current.data.cancellationReason !== updated.data.cancellationReason)) {
        await addComment(ctx, updated.id, `Canceled: ${updated.data.cancellationReason}`);
      } else if (current.data.status === "canceled" && updated.data.status !== "canceled") {
        await addComment(ctx, updated.id, `Reopened from canceled. Previous reason: ${current.data.cancellationReason}`);
      }
    },
    "tracker.task.beforeCreate": async (payload, ctx) => {
      await validateTask(taskCreate.parse(payload).data, ctx);
    },
    "tracker.task.beforeUpdate": async (payload, ctx) => {
      const { current, patch } = taskUpdate.parse(payload);
      const data = taskSchema.parse({ ...current.data, ...patch });
      if (data.projectId !== current.data.projectId) deny("Task projectId is immutable.");
      await validateTask(data, ctx, current.id);
    },
    "tracker.task.beforeDelete": async (payload, ctx) => {
      requireOwner(ctx);
      const { current } = z.object({ current: taskRecord }).parse(payload);
      const records = await projectTasks(ctx, current.data.projectId);
      if (records.some(r => r.data.parentTaskId === current.id || r.data.blockerIds.includes(current.id)) ||
          (await stores(ctx).comment.list({ filter: { taskId: current.id }, limit: 1 })).length) {
        deny("Task cannot be deleted while comments or task references exist.");
      }
    },
    "tracker.project.beforeDelete": async (payload, ctx) => {
      requireOwner(ctx);
      const { current } = z.object({ current: z.object({ id: z.uuid() }) }).parse(payload);
      if ((await stores(ctx).task.list({ filter: { projectId: current.id }, limit: 1 })).length) deny("Project cannot be deleted while it contains tasks.");
    },
  },
});
