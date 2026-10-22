import { type SyntaxNode } from "@lezer/common";
import { AlternatorExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/AlternatorExpression";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { explicitRuleNames } from "../../utils/explicitRuleNames";
import type { LowerContext } from "../context";
import { lowerSparkdownConditionalAlternatorBlock } from "../lowerers/lowerSparkdownConditionalAlternatorBlock";
import { lowerSparkdownSequentialAlternatorBlock } from "../lowerers/lowerSparkdownSequentialAlternatorBlock";
import { forwardBlockDiagnostics, unwrapBlockContent } from "./unwrapBlock";

const CONDITIONAL_ALTERNATORS: ReadonlySet<string> = new Set(
  [
    "LuauConditionalAlternatorBlock",
    "LuauConditionalAlternatorLineStart",
  ].flatMap(explicitRuleNames),
);

/**
 * Lowers an alternator Luau code uses as a value or writes as a statement
 * (`local line = cycle | "a" | "b" end`, I-1284; `queue` / `| touch()` /
 * `end` in a function's body, I-1397) as a displayed one runs: through the
 * display lowerers, whose `Sequence` or `Conditional` selects the arm with
 * the counting of the alternator's own symbol, and whose arms here each push
 * one value (`lowerArms` `valued`). The value is the selected arm's, or nil
 * for an empty arm or one no `match` arm takes; a statement (`discarded`)
 * pops it after the arm's statements ran. Null for an alternator with no arm.
 */
export function lowerAlternatorValue(
  node: SyntaxNode,
  ctx: LowerContext,
  discarded = false,
): AlternatorExpression | null {
  const nodeRef = {
    from: node.from,
    to: node.to,
    name: node.name,
    type: node.type,
    node,
  } as unknown as SparkdownSyntaxNodeRef;
  const block = CONDITIONAL_ALTERNATORS.has(node.name)
    ? lowerSparkdownConditionalAlternatorBlock(nodeRef, ctx, true)
    : lowerSparkdownSequentialAlternatorBlock(nodeRef, ctx, true);
  forwardBlockDiagnostics(block, ctx);
  const [alternator] = unwrapBlockContent(block);
  // An alternator with no arm is an error its lowerer reports, and lowers to
  // nothing.
  return alternator ? new AlternatorExpression(alternator, discarded) : null;
}
