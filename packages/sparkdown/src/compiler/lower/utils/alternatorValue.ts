import { type SyntaxNode } from "@lezer/common";
import { AlternatorExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/AlternatorExpression";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { explicitRuleNames } from "../../utils/explicitRuleNames";
import type { LowerContext } from "../context";
import type { AstNode } from "../../typecheck/Ast";
import { lowerSparkdownConditionalAlternatorBlock } from "../lowerers/lowerSparkdownConditionalAlternatorBlock";
import { lowerSparkdownSequentialAlternatorBlock } from "../lowerers/lowerSparkdownSequentialAlternatorBlock";
import { forwardBlockDiagnostics, unwrapBlockContent } from "./unwrapBlock";

const CONDITIONAL_ALTERNATORS: ReadonlySet<string> = new Set(
  [
    "LuauConditionalAlternatorBlock",
    "LuauConditionalAlternatorLineStart",
  ].flatMap(explicitRuleNames),
);

export function lowerAlternatorValue(
  node: SyntaxNode,
  ctx: LowerContext,
  discarded = false,
  exitsAllowed = discarded,
): AlternatorExpression | null {
  const nodeRef = {
    from: node.from,
    to: node.to,
    name: node.name,
    type: node.type,
    node,
  } as unknown as SparkdownSyntaxNodeRef;
  const mode: ValuedArms = exitsAllowed ? "exits" : "value";
  const block = CONDITIONAL_ALTERNATORS.has(node.name)
    ? lowerSparkdownConditionalAlternatorBlock(nodeRef, ctx, mode)
    : lowerSparkdownSequentialAlternatorBlock(nodeRef, ctx, mode);
  forwardBlockDiagnostics(block, ctx);
  const [alternator] = unwrapBlockContent(block);
  return alternator ? new AlternatorExpression(alternator, discarded) : null;
}

export type ValuedArms = "value" | "exits";

export const soleLocalAlternators = new WeakSet<AstNode>();
