import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import type { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { ROOT_IN_BLOCK, ROOT_NONE, ROOT_ONLY } from "../../utils/rootLocals";
import type { LowerContext } from "../context";
import { documentTag } from "./documentTag";

export function rootLocalAnswer(name: string, at: number, ctx: LowerContext): string {
  const answer = ctx.rootLocals?.answer(name, at) ?? "";
  ctx.recordRead?.({ kind: "rootLocal", value: `${name}=${answer}`, node: name, from: at });
  return answer;
}

export function rootLocalAnswerIgnoringBlocks(name: string, at: number, ctx: LowerContext): string {
  const answer = ctx.rootLocals?.answerIgnoringBlocks(name, at) ?? "";
  ctx.recordRead?.({ kind: "rootLocalIgnoringBlocks", value: `${name}=${answer}`, node: name, from: at });
  return answer;
}

export function rootDeclarationAnswer(name: string, at: number, ctx: LowerContext): string {
  const answer = ctx.rootLocals?.declared(name, at) ?? "";
  ctx.recordRead?.({ kind: "rootDeclaration", value: `${name}=${answer}`, node: name, from: at });
  return answer;
}

export function answersDeclaration(answer: string): boolean {
  return answer !== "" && answer !== ROOT_NONE && answer !== ROOT_IN_BLOCK;
}

export function rootSlotName(name: string, answer: string, ctx: LowerContext): string | null {
  if (!answersDeclaration(answer) || answer === ROOT_ONLY) return null;
  return `${name}$${answer}$${documentTag(ctx.filePath)}`;
}

export function rootDeclarationSlot(name: string, at: number, ctx: LowerContext): string | null {
  if (ctx.functionScopeStack?.length || ctx.scopeDepth) return null;
  return rootSlotName(name, rootDeclarationAnswer(name, at, ctx), ctx);
}

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
