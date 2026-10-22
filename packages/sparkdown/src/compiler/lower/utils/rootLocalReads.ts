import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import type { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { ROOT_IN_BLOCK, ROOT_NONE, ROOT_ONLY } from "../../utils/rootLocals";
import type { LowerContext } from "../context";
import { documentTag } from "./documentTag";

/**
 * The `local` of the root frame's own scope that code written at `at` reads
 * `name` from (`RootLocals.answer`), recorded as a `rootLocal` read so the
 * chunk is lowered again when a `local` written, removed or moved above it
 * changes the answer (`RootLocals.answer`).
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

/** Whether an answer names a declaration in scope (`RootLocals.answer`), which
 *  a function's entry binds. Inside a block (`ROOT_IN_BLOCK`), none does. */
export function answersDeclaration(answer: string): boolean {
  return answer !== "" && answer !== ROOT_NONE && answer !== ROOT_IN_BLOCK;
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
  if (!answersDeclaration(answer) || answer === ROOT_ONLY) return null;
  return `${name}$${answer}$${documentTag(ctx.filePath)}`;
}

/**
 * The slot a declaration of `name` written at `at` stores the cell of its
 * binding in (`VariableAssignment.rootSlot`, a flow's parameter's
 * `Argument.rootSlot`): one of the root frame's own scope, outside every
 * function and block, whose name the document declares there more than once.
 * Null for any other.
 */
export function rootDeclarationSlot(name: string, at: number, ctx: LowerContext): string | null {
  if (ctx.functionScopeStack?.length || ctx.scopeDepth) return null;
  return rootSlotName(name, rootDeclarationAnswer(name, at, ctx), ctx);
}

/** Gives each parameter of the scene or branch whose header is `header` the
 *  slot that keeps the binding its entry makes in the root frame's own scope
 *  (`rootDeclarationSlot`, `Argument.rootSlot`), in the order
 *  `lowerArguments` read them. */
export function markRootParameters(header: SyntaxNode, args: readonly Argument[], ctx: LowerContext): void {
  const params = getDescendent("LuauFunctionParameters", header);
  const nodes = params ? getDescendents("LuauFunctionParameter", params) : [];
  nodes.forEach((node, i) => {
    const arg = args[i];
    const name = arg?.identifier?.name;
    if (arg && name && !arg.isVararg) {
      arg.rootSlot = rootDeclarationSlot(name, node.from, ctx);
    }
  });
}
