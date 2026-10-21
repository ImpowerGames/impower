import { ROOT_ONLY } from "../../utils/rootLocals";
import type { LowerContext } from "../context";
import { documentTag } from "./documentTag";

/**
 * The `local` of the root frame's own scope that code written at `at` reads
 * `name` from (`RootLocals.answer`), recorded as a `rootLocal` read so the
 * chunk is lowered again when a `local` written, removed or moved above it
 * changes the answer: `ROOT_ONLY`, a declaration's ordinal, or "" for none.
 */
export function rootLocalAnswer(name: string, at: number, ctx: LowerContext): string {
  const answer = ctx.rootLocals?.answer(name, at) ?? "";
  ctx.recordRead?.({ kind: "rootLocal", value: `${name}=${answer}`, node: name, from: at });
  return answer;
}

/**
 * What the root-frame declaration of `name` written at `at` is known by
 * (`RootLocals.declared`), recorded as a `rootDeclaration` read: "" for a
 * declaration of another scope.
 */
export function rootDeclarationAnswer(name: string, at: number, ctx: LowerContext): string {
  const answer = ctx.rootLocals?.declared(name, at) ?? "";
  ctx.recordRead?.({ kind: "rootDeclaration", value: `${name}=${answer}`, node: name, from: at });
  return answer;
}

/**
 * The root frame's slot that keeps the binding of one declaration of a name
 * the document declares more than once in that scope (`name$<ordinal>$<tag>`),
 * or null for an answer that needs none: the only declaration of its name,
 * whose binding is the scope's own, or no declaration at all. The slot holds
 * the cell of the declaration's binding (`RootBinding`), so a later
 * declaration of the name, which replaces the binding, leaves it to the code
 * written between them. No name an author writes holds a `$`, and the
 * document's tag keeps the slots of two scripts' scenes apart.
 */
export function rootSlotName(name: string, answer: string, ctx: LowerContext): string | null {
  if (!answer || answer === ROOT_ONLY) return null;
  return `${name}$${answer}$${documentTag(ctx.filePath)}`;
}

/**
 * The slot a `local` declaration of `name` written at `at` stores the cell of
 * its binding in (`VariableAssignment.rootSlot`): one of the root frame's own
 * scope, outside every function and block, whose name that scope declares
 * more than once. Null for any other.
 */
export function rootDeclarationSlot(name: string, at: number, ctx: LowerContext): string | null {
  if (ctx.functionScopeStack?.length || ctx.scopeDepth) return null;
  return rootSlotName(name, rootDeclarationAnswer(name, at, ctx), ctx);
}
