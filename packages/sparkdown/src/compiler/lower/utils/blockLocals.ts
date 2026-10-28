import type { LowerContext } from "../context";

/**
 * Runs `lower`, which lowers the body of a block (an `if` arm, a `do`, a
 * loop), with a frame of the locals the block declares on
 * `blockLocalsStack`: `names`, a loop's variables, and those its statements
 * declare as they are lowered (`declareBlockLocals`).
 */
export function inBlockLocals<T>(
  ctx: LowerContext,
  names: readonly string[],
  lower: () => T,
): T {
  const stack = (ctx.blockLocalsStack ??= []);
  stack.push({ names: new Set(names), functions: ctx.functionScopeStack?.length ?? 0 });
  try {
    return lower();
  } finally {
    stack.pop();
  }
}

/** Adds `names`, which a statement of the innermost block being lowered
 *  declares, to that block's frame; a statement of a function written in
 *  the block declares none of the block's. */
export function declareBlockLocals(ctx: LowerContext, names: readonly string[]): void {
  const frame = ctx.blockLocalsStack?.[ctx.blockLocalsStack.length - 1];
  if (!frame || frame.functions !== (ctx.functionScopeStack?.length ?? 0)) return;
  for (const name of names) frame.names.add(name);
}

/** Whether a block being lowered declares `name` above the code being
 *  lowered. */
export function isBlockLocal(ctx: LowerContext, name: string): boolean {
  return ctx.blockLocalsStack?.some((frame) => frame.names.has(name)) ?? false;
}
