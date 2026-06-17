import { type SyntaxNode } from "@lezer/common";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { Gather } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { UnaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/UnaryExpression";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerExpressionFromContainer } from "../expression/lowerExpression";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInScope } from "../utils/wrapInScope";

// `repeat BODY until cond` — Luau's "do-while-not".
//
// Body runs ONCE first, then the condition is checked. If FALSE, loop
// back. If TRUE, fall through.
//
// Compiles to a single-scope-wrapped sequence of labeled gathers:
//
//   BeginScope
//     - (__repeat_<off>_loop)
//       BODY (break → -> __repeat_<off>_break; continue → -> __repeat_<off>_continue)
//       -> __repeat_<off>_continue
//     - (__repeat_<off>_continue)
//       { not cond:
//         -> __repeat_<off>_loop
//       }
//     - (__repeat_<off>_break)
//   EndScope
//
// `break` diverts to the break gather; control falls through past it
// to the EndScope. `continue` diverts to the continue gather where
// the until-condition runs (still inside the same scope, so the
// condition can see body locals — re-declared locals overwrite their
// slot in the single scope, observably equivalent to Luau's per-
// iteration fresh scope for the common case of straightforward
// `local x = ...` declarations).
//
// Limitation vs strict Luau: closures created on different iterations
// share the SAME upvalue slot (single-scope means there's only one).
// Lua semantics give each iteration a FRESH slot, so a per-iteration
// closure captures a unique upvalue. We accept this divergence for
// now — it surfaces only with the unusual pattern of constructing
// distinct closures from the same body across iterations.
//
// Grammar shape (siblings, not nested):
//   LuauRepeatLoop   — body content, ends at `until` keyword
//   LuauUntilStatement — the condition expression
// `lowerLuauRepeatLoop` peeks at the next sibling to grab the
// condition; the `LuauUntilStatement` dispatch case is a no-op so
// it isn't lowered twice.

const REPEAT_BODY_SKIP: ReadonlySet<string> = new Set([
  "LuauRepeatKeyword",
  "LuauComment",
]);

export function lowerLuauRepeatLoop(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const bodyContent =
    findChildByName(nodeRef.node, "LuauRepeatLoop_content") ?? nodeRef.node;
  const untilNode = findNextUntilSibling(nodeRef.node);
  if (!untilNode) return {};
  const condContent =
    findChildByName(untilNode, "LuauUntilStatement_content") ?? untilNode;
  const condExpr = lowerExpressionFromContainer(condContent, ctx);
  if (!condExpr) return {};

  const loopLabel = `__repeat_${nodeRef.node.from}_loop`;
  const continueLabel = `__repeat_${nodeRef.node.from}_continue`;
  const breakLabel = `__repeat_${nodeRef.node.from}_break`;

  // The body runs inside the loop's own scope wrap (see the
  // `wrapInScope` in the return) — count it in `scopeDepth` so
  // `break`/`continue` inside nested scoped blocks know how many
  // EndScopes to emit before diverting.
  ctx.scopeDepth = (ctx.scopeDepth ?? 0) + 1;
  ctx.loopStack?.push({
    continueLabel,
    breakLabel,
    scopeDepth: ctx.scopeDepth,
  });
  const bodyStatements = lowerStatements(bodyContent, ctx, REPEAT_BODY_SKIP);
  ctx.loopStack?.pop();
  ctx.scopeDepth--;

  // not cond — when until-condition is FALSE we want to loop, when
  // TRUE we want to exit. Inverting lets us reuse a single-branch
  // conditional shape (no else branch needed).
  const notCond = new UnaryExpression(condExpr as Expression, "not");

  // Loop body gather: runs the body, then falls through to the
  // continue gather. The body's `break` / `continue` lowerers emit
  // diverts to the respective labels.
  const loopGather = new Gather(new Identifier(loopLabel), 1);
  for (const stmt of bodyStatements) loopGather.AddContent(stmt);
  loopGather.AddContent(new Divert([new Identifier(continueLabel)]));

  // Continue gather: where the until-condition runs. If cond is
  // false, jump back to the loop head. If true, fall through to the
  // break gather (loop exit).
  const continueGather = new Gather(new Identifier(continueLabel), 1);
  const loopBackBranch = new ConditionalSingleBranch([
    new Divert([new Identifier(loopLabel)]),
  ]);
  loopBackBranch.ownExpression = notCond;
  loopBackBranch.isElse = false;
  continueGather.AddContent(
    new Conditional(null as never, [loopBackBranch]),
  );

  // Break gather: sentinel for natural exit and `break` divert.
  const breakGather = new Gather(new Identifier(breakLabel), 1);

  return {
    content: wrapInScope([loopGather, continueGather, breakGather]),
  };
}

// Walk forward from `repeatNode` through whitespace / newline / etc.
// sibling nodes, returning the first `LuauUntilStatement` encountered
// or null if there isn't one.
function findNextUntilSibling(repeatNode: SyntaxNode): SyntaxNode | null {
  let n: SyntaxNode | null = repeatNode.nextSibling;
  while (n) {
    if (n.name === "LuauUntilStatement") return n;
    if (
      n.name !== "Newline" &&
      n.name !== "OptionalWhitespace" &&
      n.name !== "RequiredWhitespace" &&
      n.name !== "ExtraWhitespace" &&
      n.name !== "LuauComment"
    ) {
      return null;
    }
    n = n.nextSibling;
  }
  return null;
}

// Sibling consumed by `lowerLuauRepeatLoop`. The dispatch case for
// `LuauUntilStatement` calls this so the standalone-until node is
// handled here (there is no parser fallback — the grammar+lowerers are
// the only path).
export function lowerLuauUntilStatement(
  _nodeRef: SparkdownSyntaxNodeRef,
  _ctx: LowerContext,
): CompiledBlock {
  return {};
}

