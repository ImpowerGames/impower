import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import type { SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import type {
  CompiledBlock,
  InkDiagnostic,
} from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import {
  buildDivert,
  divertLoadShapeProblem,
  withDivertLoad,
} from "../utils/buildDivert";
import { statementSource } from "../utils/statementSource";
import { unreachableAfter } from "./lowerDoneOrFin";
import { wrapInWeave } from "../utils/wrapInWeave";

export function emptyDivertDiagnostic(
  node: { from: number; to: number },
  ctx: LowerContext,
): InkDiagnostic {
  return {
    message: "Empty diverts (->) are only valid on choices (e.g. `* ->`).",
    severity: ErrorType.Warning,
    source: statementSource(node, ctx),
  };
}

export function lowerDivert(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const objects = buildDivert(nodeRef.node, ctx);
  const block = wrapInWeave(withDivertLoad(nodeRef.node, objects, ctx));
  const source = statementSource(nodeRef, ctx);
  if (objects.length === 0) {
    const hasTarget = !!getDescendent("DivertTarget", nodeRef.node);
    const hasTunnelMark = !!getDescendent("TunnelMark", nodeRef.node);
    if (!hasTarget && !hasTunnelMark) {
      block.diagnostics = [emptyDivertDiagnostic(nodeRef, ctx)];
    }
  }
  const loadProblem = divertLoadShapeProblem(nodeRef.node);
  if (loadProblem) {
    block.diagnostics = [
      ...(block.diagnostics ?? []),
      { message: loadProblem, severity: ErrorType.Warning, source },
    ];
  }
  if (nodeRef.name === "Divert" && leavesFlow(nodeRef.node)) {
    const unreachable = unreachableAfter(nodeRef, ctx);
    if (unreachable) {
      block.diagnostics = [...(block.diagnostics ?? []), unreachable];
    }
  }
  return block;
}

function leavesFlow(divert: SyntaxNode): boolean {
  const begin = divert.getChild("Divert_begin");
  if (begin && getDescendent("TunnelMark", begin)) {
    return true;
  }
  const content = divert.getChild("Divert_content");
  if (!content?.getChild("DivertTarget")) {
    return false;
  }
  let tunnel = content.getChild("Tunnel");
  while (tunnel) {
    const inner = tunnel.getChild("Tunnel_content");
    if (!inner?.getChild("DivertTarget")) {
      return false;
    }
    tunnel = inner.getChild("Tunnel");
  }
  return true;
}
