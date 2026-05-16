import { ReturnType } from "../../../inkjs/compiler/Parser/ParsedHierarchy/ReturnType";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerExpressionFromContainer } from "../expression/lowerExpression";

// `return X` (inside a function body) → ReturnType { expr }
// `return`   (no value)               → ReturnType { null } — produces Void
//
// `ReturnType.GenerateRuntimeObject` emits: evaluate(expr), then PopFunction.
// The function's caller picks the return value off the evaluation stack.

export function lowerLuauReturnStatement(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const expr = lowerExpressionFromContainer(nodeRef.node, ctx);
  return { content: [new ReturnType(expr ?? null)] };
}
