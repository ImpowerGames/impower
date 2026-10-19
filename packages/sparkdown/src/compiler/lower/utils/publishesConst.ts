import type { LowerContext } from "../context";

/**
 * Whether a `const` lowered here is the story's published constant: one
 * written outside every function, which the story declares with its globals
 * and the compiler reports on itself. A `const` inside a function, at any
 * depth of its blocks, is Luau's: a local of its block that cannot be
 * reassigned, which Luau's reading reports on (`isLuauConst` in
 * `readLuauAst.ts`). A `run` file's text is the body of the function a `run`
 * calls, so its `const`s are Luau's too.
 */
export function publishesConst(ctx: LowerContext): boolean {
  return !ctx.functionScopeStack?.length;
}
