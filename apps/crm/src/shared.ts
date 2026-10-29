import { HookVetoError, NotFoundError, z, type EntityStoreAccessor, type KernelContext } from '@embody/core';

export const deny = (message: string): never => { throw new HookVetoError(message); };
export function entity<S extends z.ZodType>(ctx: KernelContext, name: string, _schema: S) {
  return ctx.entities[name] as unknown as EntityStoreAccessor<z.output<S>>;
}
export async function reference<T>(promise: Promise<T>, name: string): Promise<T> {
  try { return await promise; } catch (error) {
    if (error instanceof NotFoundError) return deny(`${name} must exist in this organization.`);
    throw error;
  }
}
export const noDelete = () => deny('CRM history cannot be deleted. Archive accounts or close opportunities instead.');
