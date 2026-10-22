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

/**
 * Lowers an alternator Luau code uses as a value or writes as a statement
 * (`local line = cycle | "a" | "b" end`, I-1284; `queue` / `| touch()` /
 * `end` in a function's body, I-1397) as a displayed one runs: through the
 * display lowerers, whose `Sequence` or `Conditional` selects the arm with
 * the counting of the alternator's own symbol, and whose arms here each push
 * one value (`lowerArms` `valued`). The value is the selected arm's, or nil
 * for an empty arm or one no `match` arm takes; a statement (`discarded`)
 * pops it after the arm's statements ran. Null for an alternator with no arm.
 * Unless `exitsAllowed` (a statement, or the sole value of a `local`, where
 * nothing waits on the evaluation stack), a `break`, `continue` or `return`
 * in an arm is an error (`reportArmExits`).
 */
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
  // An alternator with no arm is an error its lowerer reports, and lowers to
  // nothing.
  return alternator ? new AlternatorExpression(alternator, discarded) : null;
}

/**
 * How an alternator Luau code holds runs its arms (`lowerArms`): each pushes
 * one value, and with `"value"` an arm may not leave its loop or function,
 * since the expression around the alternator has values waiting on the
 * evaluation stack that the exit would leave there (`reportArmExits`);
 * with `"exits"` it may.
 */
export type ValuedArms = "value" | "exits";

/**
 * The alternators a statement runs with nothing waiting on the evaluation
 * stack, as the sole value of a `local` (`local v = cycle | break end`) or
 * as a statement (`armRunAlternator`), whose arms may leave their loop or
 * function; `lowerLuauStatement` records them.
 */
export const soleLocalAlternators = new WeakSet<AstNode>();
