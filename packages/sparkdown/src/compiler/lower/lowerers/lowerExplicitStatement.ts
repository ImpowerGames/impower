import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import {
  AstStatLocal,
  AstStatSparkdownExplicit,
  AstStatSparkdownStore,
} from "../../typecheck/Ast";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import { stampDebugMetadata } from "../utils/debugMetadata";
import { rangeOf } from "../utils/luauAst";
import { lowerLuauStatement, type StatementSite } from "./lowerLuauStatement";

/**
 * A statement marked with `&`, which writes Luau where narrative would
 * stand: `& x = expr`, `& obj.field += expr`, `& a, b = 99, 100`,
 * `& foo()` (a call whose value is discarded), and `& store x = 5`,
 * `& const x = 5`, `& local x = 5`, which declare as the unmarked
 * declarations do. The statement it marks lowers as that statement does.
 * The validators of its node report a redundant `&` in a function body and
 * what its list leaves missing (`validateStatementNode`).
 */
export function lowerExplicitStatement(
  stat: AstStatSparkdownExplicit,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const marked = stat.statement;
  const block = lowerLuauStatement(marked, site, ctx);
  // A statement's weave is unwrapped wherever its content is placed (the
  // enclosing flow's weave, a choice body, an alternator arm), so the weave's
  // range, stamped by `lower()`, no longer reaches the statements it held.
  // Give them the line's range themselves: `program.pathLocations` then has
  // rows for the line, so a runtime error it raises is reported on it and
  // PLAY, a preview or a breakpoint on it resolves to it. A `& local`
  // declaration runs in the flow like any other logic line and is stamped
  // too. A `& store` or `& const` declaration is hoisted out of the flow into
  // the story's global declarations, as its implicit form is, so it is not a
  // place in the flow and gets no rows.
  const hoisted =
    marked instanceof AstStatSparkdownStore ||
    (marked instanceof AstStatLocal && marked.isConst);
  const weave = block.content?.[0];
  if (weave instanceof Weave && !hoisted) {
    const range = rangeOf(stat.location, ctx);
    stampDebugMetadata(weave.content, range.from, range.to, ctx);
  }
  return block;
}
