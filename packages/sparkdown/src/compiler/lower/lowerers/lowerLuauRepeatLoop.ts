import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { Gather } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { UnaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/UnaryExpression";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { AstStatRepeat } from "../../typecheck/Ast";
import type { LowerContext } from "../context";
import { shadowSiblingSubFlow } from "../expression/bindings";
import { lowerExpression } from "../expression/lowerExpression";
import { blockLocalNames } from "../expression/lowerFunction";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInScope } from "../utils/wrapInScope";
import { wrapInWeave } from "../utils/wrapInWeave";
import { lineTextSpan, makeSource } from "../utils/validateDefineStructure";
import { untilReadIntoStatement } from "../utils/validateBlockEnds";
import { ErrorType } from "../../../inkjs/engine/Error";
import { syntheticId } from "../utils/documentTag";
import {
  extendStatement,
  recordLoop,
  openBody,
} from "../utils/statementShape";
import { statementNodeAt, type StatementSite } from "./lowerLuauStatement";

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
// `<off>` is `syntheticId`: the document tag, `$`, then the loop's offset in
// the document. The rename pass recognizes these names by that `$`.
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
// The converter reads the two as one statement (`lowerLuauStatementNode`
// reads the `until` line with the loop, and a block's walk skips it as a
// node the loop continues into); the `LuauUntilStatement` dispatch case
// lowers to nothing so it isn't lowered twice.

const REPEAT_BODY_SKIP: ReadonlySet<string> = nodeNameSet([
  "LuauRepeatKeyword",
  "LuauComment",
]);

const REPEAT_NODES = nodeNameSet(["LuauRepeatLoop", "LuauSparkdownRepeatLoop", "LuauSparkdownExplicitRepeatLoop"]);

export function lowerLuauRepeatLoop(
  stat: AstStatRepeat,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const node = statementNodeAt(stat, site, REPEAT_NODES, ctx);
  if (!node) return {};
  const bodyContent =
    findChildByName(node, `${node.name}_content`) ?? node;
  const untilNode = findNextUntilSibling(node);
  if (!untilNode) {
    reportUnpairedUntil(node, ctx);
    return {};
  }
  // The condition sees the locals its body declares, as Luau scopes them:
  // each hides a variadic function of its name in the condition as in the
  // rest of the body (`shadowSiblingSubFlow`), from a block of their own
  // that ends with the condition.
  ctx.blockEndStack?.push([]);
  for (const name of blockLocalNames(stat.body)) {
    shadowSiblingSubFlow(name, ctx);
  }
  const condExpr = lowerExpression(stat.condition, site.source, ctx);
  ctx.blockEndStack?.pop()?.forEach((end) => end());
  if (!condExpr) return {};

  const id = syntheticId(node.from, ctx);
  const loopLabel = `__repeat_${id}_loop`;
  const continueLabel = `__repeat_${id}_continue`;
  const breakLabel = `__repeat_${id}_break`;

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
  const body = openBody(
    ctx,
    node.from,
    bodyContent === node ? node.from : bodyContent.from,
    untilNode.from,
  );
  // The `until` line is a sibling node, and a part of this statement.
  extendStatement(ctx, untilNode.to);
  const bodyStatements = lowerStatements(
    bodyContent,
    ctx,
    REPEAT_BODY_SKIP,
    body,
  );
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
  const toContinue = new Divert([new Identifier(continueLabel)]);
  loopGather.AddContent(toContinue);

  // Continue gather: where the until-condition runs. If cond is
  // false, jump back to the loop head. If true, fall through to the
  // break gather (loop exit).
  const continueGather = new Gather(new Identifier(continueLabel), 1);
  const toLoop = new Divert([new Identifier(loopLabel)]);
  const loopBackBranch = new ConditionalSingleBranch([toLoop]);
  loopBackBranch.ownExpression = notCond;
  loopBackBranch.isElse = false;
  continueGather.AddContent(
    new Conditional(null as never, [loopBackBranch]),
  );

  // Break gather: sentinel for natural exit and `break` divert.
  const breakGather = new Gather(new Identifier(breakLabel), 1);

  const scoped = wrapInScope([loopGather, continueGather, breakGather]);
  if (body) {
    recordLoop(scoped[0]!, {
      kind: "repeat",
      body,
      objects: scoped,
      test: loopBackBranch,
      init: [],
    }, [loopGather, continueGather, breakGather, toContinue, toLoop]);
  }
  // A chunk's content reaches the enclosing scene or top-level flow only
  // as a Weave; inside a body, `lowerStatements` unwraps it again.
  return wrapInWeave(scoped);
}

// Walk forward from `repeatNode` through whitespace / newline / etc.
// sibling nodes, returning the first `LuauUntilStatement` encountered
// or null if there isn't one.
export function findNextUntilSibling(repeatNode: SyntaxNode): SyntaxNode | null {
  let n: SyntaxNode | null = repeatNode.nextSibling;
  while (n) {
    if (isExplicitRuleName(n.name, "LuauUntilStatement") || n.name === "LuauSparkdownExplicitUntilStatement") return n;
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

const UNPAIRED_UNTIL =
  "This `repeat` loop could not be read up to its `until`, so it and the lines after it in its block are left out. Put `until` on its own line.";

// A loop with no `until` after it whose `until` the grammar read into one of
// its statements (#1092). `validateBlockEnds` leaves that loop alone, since
// its `until` is not missing, so the loop that is dropped here says so. Both
// count the loop's `until`s the same way (`untilReadIntoStatement`).
function reportUnpairedUntil(repeat: SyntaxNode, ctx: LowerContext): void {
  if (!untilReadIntoStatement(repeat)) return;
  const line = lineTextSpan(repeat.from, repeat.to, ctx);
  if (!line) return;
  ctx.diagnostics?.push({
    message: UNPAIRED_UNTIL,
    severity: ErrorType.Error,
    source: makeSource(line.from, line.to, ctx),
  });
}
