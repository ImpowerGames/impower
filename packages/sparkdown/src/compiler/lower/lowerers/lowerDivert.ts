import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
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
import { wrapInWeave } from "../utils/wrapInWeave";

// `->` with no target outside of a choice is meaningless: there's nothing to
// divert to. Inkjs's parser emits the same diagnostic. Inside a choice, `* ->`
// is the fallback-choice form and `lowerChoice` handles it without one.
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
  return block;
}
