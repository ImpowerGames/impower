import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getDescendents } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendents";
import { statementSource } from "./statementSource";
import { type SyntaxNode } from "@lezer/common";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { CallValueExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/CallValueExpression";
import type { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { NullExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NullExpression";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { emptyDivertDiagnostic } from "../lowerers/lowerDivert";
import { lowerDivertPath } from "./lowerDivertPath";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import {
  LegacyTag,
  Tag,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Tag";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { TunnelOnwards } from "../../../inkjs/compiler/Parser/ParsedHierarchy/TunnelOnwards";
import { Tag as RuntimeTag } from "../../../runtime/Tag";
import { buildDisplayCall, separateTags } from "./displayCall";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { asOneValue, containerValueNodes, lowerExpression, lowerExpressionFromNodes } from "../expression/lowerExpression";
import { lower } from "../lower";
import { LUAU_STATEMENT_NODES, lowerLuauStatementNode } from "../lowerers/lowerLuauStatement";
import { forwardBlockDiagnostics, unwrapBlockContent } from "./unwrapBlock";
import { wrapInScope } from "./wrapInScope";
import type { ValuedArms } from "./alternatorValue";
import { ErrorType } from "../../../runtime/Error";
import { makeSource } from "./validateDefineStructure";
import { findChildByName } from "../../utils/findChildByName";
import { isTrivia } from "../../lint/luauTree";
import { reportReadingErrors, reportSyntaxErrors } from "../expression/lowerFunction";
import { documentText, offsetAt, readBlockAst, readExpressionAst } from "./luauAst";
import { enclosingUnclosedIslandEnd } from "../../utils/storyIslands";
import { nextLuauToken, readLuauBlock, readLuauExpression } from "../../typecheck/readLuauAst";
import { enclosingAlternator, isLuauNodeName, LUAU_STATEMENTS } from "../../typecheck/LuauUnitNodes";
import {
  AstExprCall,
  AstExprFunction,
  AstExprGroup,
  AstStatError,
  AstExprSparkdownConditionalAlternator,
  AstExprSparkdownSequentialAlternator,
  AstStatBreak,
  AstStatContinue,
  AstStatExpr,
  AstStatFor,
  AstStatForIn,
  AstStatLocal,
  AstStatRepeat,
  AstStatReturn,
  AstStatSparkdownExplicit,
  AstStatWhile,
  visitAst,
  type AstNode,
} from "../../typecheck/Ast";
import { containsUnreadToken } from "../../utils/unreadTokens";
import { ALTERNATOR_CANDIDATES, alternatorArms, alternatorHeadNodes, headSeparator } from "../../utils/alternatorDecision";

// The values an inline alternator's arm can hold (`{queue|A|B|C end}`):
// a literal, a name or path, a parenthesized value, a table, a divert
// target, a function value or an if expression.
const ARM_VALUES = nodeNameSet([
  "LuauNumericDecimal",
  "LuauNumericHex",
  "LuauNumericBinary",
  "LuauBoolean",
  "LuauNil",
  "LuauRegexLiteral",
  "LuauDoubleQuotedString",
  "LuauSingleQuotedString",
  "LuauMultilineString",
  "LuauInterpolatedString",
  "LuauAccessPath",
  "LuauParenthetical",
  "LuauTable",
  "LuauDivertTargetLiteral",
  "LuauFunctionDefinition",
  "LuauTernaryExpression",
]);

// Build a statement-form `Divert` ParsedObject from a
// `LuauDivertTargetLiteral` syntax node. Mirrors what
// `expression/lowerExpression.ts > lowerDivertTargetLiteral` does for
// the value form, but produces a bare `Divert` (which executes as
// flow control) instead of wrapping in `DivertTarget` (which produces
// the target's symbol value and prints it to the output stream). Used by
// the inline-alternator arm path so `{chain | -> next | other end}`
// transfers control on arm 1 instead of printing the target as a value.
function buildDivertFromTargetLiteral(
  node: SyntaxNode,
  ctx: LowerContext,
): Divert | null {
  const parts = lowerDivertPath(node, ctx);
  if (parts.length === 0) return null;
  return new Divert(parts);
}

// The source range of the `->` when an inline arm's expression is a bare `->`
// with no target, which the expression grammar parses as a
// `LuauArithmeticOperation`.
function emptyDivertRange(
  node: SyntaxNode,
  ctx: LowerContext,
): { from: number; to: number } | null {
  if (!isExplicitRuleName(node.name, "LuauArithmeticOperation")) return null;
  const text = ctx.read(node.from, node.to);
  if (text.trim() !== "->") return null;
  // value-level: the text of one LuauArithmeticOperation node, locating its operator
  const from = node.from + text.indexOf("->");
  return { from, to: from + 2 };
}

export interface AlternatorArm {
  // Bare-identifier key for conditional arms (`| warrior = ...`). null for
  // sequential arms (`| body`).
  key: string | null;
  body: ParsedObject[];
}

// Walks the content of an alternator block, partitioning children into arms
// delimited by `LuauAlternatorSeparator`. Each arm's body nodes are lowered
// via the main dispatcher and unwrapped from their `Weave` containers. With
// `valued`, for an alternator Luau code uses as a value or writes as a
// statement (I-1284, I-1397), each arm pushes one value instead of writing
// what it holds (`valueArmBody`).
export function lowerArms(
  content: SyntaxNode | null,
  ctx: LowerContext,
  valued: ValuedArms | false = false,
): AlternatorArm[] {
  const arms: AlternatorArm[] = [];
  if (!content) return arms;
  // A candidate in Luau code holds its separators and arms in its
  // `LuauAlternatorArms` (I-1310); a story alternator holds them itself.
  const candidate = content.parent && ALTERNATOR_CANDIDATES.has(content.parent.name) ? content.parent : null;
  const armsNode = candidate ? alternatorArms(candidate) : null;
  // Where the head took the first arm's separator and that arm is empty
  // (I-1408), the arms hold no content (`end| end`), or the candidate holds
  // no arms at all (`end|}`).
  const armsContent = candidate ? (armsNode?.getChild(`${armsNode.name}_content`) ?? null) : content;
  let current: AlternatorArm | null = null;
  // The current arm's Luau nodes, for its errors (`reportArmReading`):
  // not a line of story or a divert, which lower as Sparkdown's own.
  let armNodes: SyntaxNode[] = [];
  // A valued alternator's arms are read where Luau code reads it, which
  // reports their errors (`reportNestedAlternators`).
  const reportArm = () => {
    if (valued && current) current.body = valueArmBody(armNodes, ctx, valued);
    else reportArmReading(armNodes, ctx, false);
    armNodes = [];
  };
  const startArm = (separator: SyntaxNode): AlternatorArm => {
    const keyNode = getDescendent("LuauAlternatorAssignmentName", separator);
    const arm = { key: keyNode ? ctx.read(keyNode.from, keyNode.to).trim() : null, body: [] };
    arms.push(arm);
    return arm;
  };
  // The head took the first arm's separator where an `end` stands against
  // its `|` (I-1408), and the arms begin with that arm's body.
  const lead = candidate ? headSeparator(candidate) : null;
  if (lead) current = startArm(lead);

  let child = armsContent?.firstChild ?? null;
  while (child) {
    if (child.name === "LuauAlternatorSeparator") {
      reportArm();
      current = startArm(child);
    } else if (
      current &&
      (child.name === "LuauSparkdownInlineGluedAlternatorArm" ||
        child.name === "LuauSparkdownAlternatorArm")
    ) {
      // Wrapped alternator arms used by:
      //   - inline-glued form (`..queue|A|B|C..`)
      //   - single-line block form (`queue | A | B | C end`)
      // The arm's `_content` may contain plain text (Word / Space /
      // Punctuation children) and / or `ArmTag` annotations
      // (`# tag content`). We walk the children: text-shaped children
      // accumulate into a single `Text` ParsedObject (preserving
      // whitespace between words), and `ArmTag` children emit a tag the
      // runtime collects into `currentTags` when the arm runs (see
      // `lowerArmContent`).
      // For the single-line block form the arm's text is a `display()`
      // call, so each visit is a display line of its own, matching the
      // multi-line block-form arm shape (which routes through
      // `ImplicitAction`). The inline-glued form is spliced into
      // surrounding text; the caller's display lowerer handles line breaks.
      const armContent = findChildByName(child, `${child.name}_content`);
      if (armContent) {
        if (child.name !== "LuauSparkdownAlternatorArm") {
          lowerArmContent(armContent, current.body, ctx, true);
        } else {
          const parts: ParsedObject[] = [];
          lowerArmContent(armContent, parts, ctx);
          current.body.push(...armLineAsDisplayCall(parts, ctx));
        }
      }
    } else if (current && valued) {
      // A valued arm is lowered whole where it ends (`reportArm`).
      if (isLuauNodeName(child.name) && !isTrivia(child)) armNodes.push(child);
    } else if (current) {
      // Special case: inline alternators (`LuauSequentialAlternatorBlock`,
      // no Sparkdown prefix) use `#LuauExpression` for arm content. A
      // `-> target` literal inside an arm would normally lower as a
      // `LuauDivertTargetLiteral` value expression (producing a
      // symbol value printed to the output stream — not what the
      // author meant). Detect the divert-shape and route it through the
      // statement-form divert lowerer so the chosen arm's runtime
      // transfers control instead of emitting the target as a value.
      // Both the bare `LuauDivertTargetLiteral` and a wrapping
      // `LuauAccessPath > LuauDivertTargetLiteral` shape can occur
      // depending on how the grammar's expression matcher segments the
      // token stream.
      const divertLiteral =
        isExplicitRuleName(child.name, "LuauDivertTargetLiteral")
          ? child
          : getDescendent(["LuauDivertTargetLiteral", "LuauSparkdownExplicitDivertTargetLiteral"], child);
      if (divertLiteral) {
        const divert = buildDivertFromTargetLiteral(divertLiteral, ctx);
        if (divert) {
          current.body.push(divert);
          child = child.nextSibling;
          continue;
        }
      }
      // A `->` with no target does not match `LuauDivertTargetLiteral`, so
      // the expression grammar parses it as an arithmetic operation that
      // lowers to nothing. It reports the empty-divert warning the other
      // alternator forms report, and the arm stays empty.
      const emptyDivert = emptyDivertRange(child, ctx);
      if (emptyDivert) {
        ctx.diagnostics?.push(emptyDivertDiagnostic(emptyDivert, ctx));
        child = child.nextSibling;
        continue;
      }

      if (isLuauNodeName(child.name)) armNodes.push(child);
      const block = lower(child as unknown as SparkdownSyntaxNodeRef, ctx);
      // A statement can lower to diagnostics alone, such as an empty divert.
      forwardBlockDiagnostics(block, ctx);
      if (block?.content) {
        current.body.push(...unwrapBlockContent(block));
      } else {
        // `lower()` returned `undefined` — the child isn't a top-level
        // statement node. This is the common case in *inline* alternators
        // (`{queue|A|B|C end}`), where each arm body is a bare expression
        // (LuauAccessPath, LuauNumber, LuauString, ...). Lower as a value
        // expression and mark `outputWhenComplete` so its result emits
        // into the surrounding output stream — same behavior as a normal
        // `{expr}` interpolation, just nested inside the alternator's
        // chosen arm. Its errors are the reading of the value it begins,
        // with the operations that continue it (`reportArmReading`).
        const expr = ARM_VALUES.has(child.name)
          ? lowerExpressionFromNodes([child], ctx, null)
          : null;
        if (expr) {
          expr.outputWhenComplete = true;
          current.body.push(expr);
        }
      }
    }
    child = child.nextSibling;
  }
  reportArm();
  return arms;
}

// The operations that continue the value before them in an arm (`x .. y`,
// `x + 1`), which the grammar gives nodes of their own.
const CONTINUATIONS = nodeNameSet([
  "LuauArithmeticOperation",
  "LuauCompareOperation",
  "LuauConcatOperation",
  "LuauLogicalOperation",
  "LuauTypeCastOperation",
]);

/**
 * What an arm holds as it runs: each value, a node with the operations that
 * continue it (`cycle | x .. y | 2 end`), each Luau statement, and a
 * `match` arm's value after its `=` (its pattern is a value before it). Two
 * nodes side by side are two values (`| second visit |`), as `lowerArms`
 * lowers them. With `functionValues`, a function with no name
 * (`| function() return 3 end`) is a value, as it is where an arm gives one
 * (`valueArmBody`); otherwise it is read as the statement its node is.
 */
function armParts(nodes: readonly SyntaxNode[], functionValues = false): { statement: boolean; nodes: SyntaxNode[] }[] {
  const parts: { statement: boolean; nodes: SyntaxNode[] }[] = [];
  for (const node of nodes) {
    const last = parts[parts.length - 1];
    // A function's attributes before it (`@native function() end`) are
    // part of it.
    const attributed = last && last.nodes.length > 0 && last.nodes.every(isAttribute) && isExplicitRuleName(node.name, "LuauFunctionDefinition");
    if (attributed) {
      last.nodes.push(node);
      last.statement = !(functionValues && isFunctionValue(node));
    } else if (isArmAssignment(node)) parts.push({ statement: false, nodes: containerValueNodes(node) });
    else if (functionValues && isFunctionValue(node)) parts.push({ statement: false, nodes: [node] });
    else if (LUAU_STATEMENTS.has(node.name)) parts.push({ statement: true, nodes: [node] });
    else if (CONTINUATIONS.has(node.name) && last && !last.statement) last.nodes.push(node);
    else parts.push({ statement: false, nodes: [node] });
  }
  return parts;
}

/**
 * What a valued arm runs (`lowerArms`): each statement it holds and each call
 * it holds before its last value, whose result is discarded, then its last
 * value adjusted to one value (`asOneValue`), as an if expression's arm is,
 * or nil where it holds none (an empty arm, or one that ends with a
 * statement), as an empty displayed arm shows nothing. A value before the
 * last that is no call has nothing to run, and nothing reads it. Its errors
 * are reported by the reading of the Luau code that holds the alternator
 * (`reportAlternatorValue`), not here.
 */
function valueArmBody(nodes: readonly SyntaxNode[], ctx: LowerContext, mode: ValuedArms): ParsedObject[] {
  const body: ParsedObject[] = [];
  const parts = armParts(nodes, true);
  if (mode === "value") {
    for (const part of parts) {
      if (part.statement) reportArmExits(readLuauBlock(part.nodes, documentText(ctx)).root, ctx);
    }
  }
  // An arm that declares holds its locals for itself, as a `do` block does
  // (`lowerLuauDoBlock`): the names they hide are the enclosing scope's
  // again after it.
  const scoped = parts.some((part) => part.statement);
  if (scoped) {
    ctx.blockEndStack?.push([]);
    ctx.scopeDepth = (ctx.scopeDepth ?? 0) + 1;
  }
  let value: Expression | null = null;
  for (const [k, part] of parts.entries()) {
    if (part.statement) {
      // A function's attributes before it are part of it; the function
      // statement lowers from its own node (`armParts`).
      const node = part.nodes[part.nodes.length - 1]!;
      const until = parts[k + 1];
      if (until && k + 1 === parts.length - 1 && until.statement && isExplicitRuleName(until.nodes[0]!.name, "LuauUntilCondition")) {
        const trailing = untilTrailingValue(node, until.nodes[0]!, ctx);
        if (trailing) value = asOneValue(trailing);
      }
      const block = LUAU_STATEMENT_NODES.has(node.name)
        ? lowerLuauStatementNode(node, ctx, false)
        : lower(node as unknown as SparkdownSyntaxNodeRef, ctx);
      forwardBlockDiagnostics(block, ctx);
      body.push(...unwrapBlockContent(block));
      continue;
    }
    if (part.nodes.length === 0) continue;
    const expr = lowerExpressionFromNodes(part.nodes, ctx, null, tokenAfter(part.nodes, ctx));
    if (!expr) continue;
    if (k === parts.length - 1) {
      value = asOneValue(expr);
    } else if (expr instanceof FunctionCall || expr instanceof CallValueExpression) {
      expr.shouldPopReturnedValue = true;
      body.push(expr);
    }
  }
  body.push(value ?? new NullExpression());
  if (!scoped) return body;
  ctx.scopeDepth = (ctx.scopeDepth ?? 1) - 1;
  ctx.blockEndStack?.pop()?.forEach((end) => end());
  return wrapInScope(body);
}

const EXIT_KEYWORDS = new Map<unknown, string>([
  [AstStatBreak, "break"],
  [AstStatContinue, "continue"],
  [AstStatReturn, "return"],
]);

/**
 * Reports each `break`, `continue` and `return` that would leave an arm of
 * an alternator used as a value (`valueArmBody` with `"value"`): the
 * expression around the alternator has values waiting on the evaluation
 * stack, which leaving it would leave there. A `return` in a function
 * written in the arm returns from that function, and a `break` or
 * `continue` of a loop written in the arm stays in it. An alternator the
 * arm runs as a statement, or as the sole value of a `local`
 * (`armRunAlternator`), is part of the arm, and its arms are read in turn;
 * one the arm uses as a value reports its own.
 */
function reportArmExits(root: AstNode, ctx: LowerContext): void {
  const walk = (node: AstNode, loops: number) => {
    visitAst(node, {
      visit: (inner) => {
        if (inner === node) return true;
        if (inner instanceof AstExprFunction) return false;
        if (inner instanceof AstStatWhile || inner instanceof AstStatRepeat || inner instanceof AstStatFor || inner instanceof AstStatForIn) {
          walk(inner.body, loops + 1);
          return false;
        }
        const keyword = EXIT_KEYWORDS.get(inner.constructor);
        if (keyword && (keyword === "return" || loops === 0)) {
          const from = offsetAt(inner.location.begin, ctx);
          ctx.diagnostics?.push({
            message: "`" + keyword + "` cannot leave an arm of an alternator used as a value; write the alternator as a statement",
            severity: ErrorType.Error,
            source: makeSource(from, from + keyword.length, ctx),
          });
        }
        const runs = armRunAlternator(inner);
        if (runs) {
          for (const scope of alternatorScopesOf(runs, ctx) ?? []) for (const part of scope.parts) walk(part, loops);
          return false;
        }
        // An alternator used as a value is lowered on its own, and reports
        // its own arms' exits.
        return !(inner instanceof AstExprSparkdownSequentialAlternator || inner instanceof AstExprSparkdownConditionalAlternator);
      },
    });
  };
  walk(root, 0);
}

/**
 * The alternator a statement runs where nothing waits on the evaluation
 * stack: a statement alternator, or the sole value of a `local`
 * (`soleLocalAlternators`).
 */
export function armRunAlternator(node: AstNode): AstExprSparkdownSequentialAlternator | AstExprSparkdownConditionalAlternator | null {
  const stat = node instanceof AstStatSparkdownExplicit ? node.statement : node;
  let value =
    stat instanceof AstStatExpr ? stat.expr
    : stat instanceof AstStatLocal && stat.values.length === 1 ? stat.values[0]
    : undefined;
  // Parentheses around it hold nothing on the stack either.
  while (value instanceof AstExprGroup) value = value.expr;
  return value instanceof AstExprSparkdownSequentialAlternator || value instanceof AstExprSparkdownConditionalAlternator ? value : null;
}

/**
 * The value a `repeat` loop's `until` line ends with, after its condition,
 * as the last of an arm (`| local n = 0 repeat n = n + 1 until n == 2 n`):
 * the grammar's `until` line runs to its line's end, and Luau reads the
 * value after the condition as a statement of its own, which an arm gives
 * as its value. Null where the line holds no such value.
 */
function untilTrailingValue(repeatNode: SyntaxNode, untilNode: SyntaxNode, ctx: LowerContext): Expression | null {
  if (!isExplicitRuleName(repeatNode.name, "LuauRepeatLoop")) return null;
  const unit = readLuauBlock([repeatNode, untilNode], documentText(ctx));
  const last = unit.statements[unit.statements.length - 1]?.statement;
  if (!(last instanceof AstStatError) || last.statements.length > 0 || last.expressions.length !== 1) return null;
  let top = untilNode;
  while (top.parent) top = top.parent;
  return lowerExpression(last.expressions[0]!, { top, errors: unit.errors }, ctx);
}

/** Whether a node of an arm is a function's attribute (`@native`). */
function isAttribute(node: SyntaxNode): boolean {
  return isExplicitRuleName(node.name, "LuauAttribute");
}

/** Whether a node of an arm is a function with no name, a value (`| function() return 3 end`). */
function isFunctionValue(node: SyntaxNode): boolean {
  if (!isExplicitRuleName(node.name, "LuauFunctionDefinition")) return false;
  const content = findChildByName(node, `${node.name}_content`);
  return !content || !findChildByName(content, "LuauFunctionDeclarationName");
}

/**
 * Reports the errors of an alternator's arm. The type checker reads an
 * alternator as a value of any type, not its arms, so an arm holding a
 * token no rule read (`cycle "a" | ! end`, `cycle "a" | (!b) end`) has every
 * error of its reading as an expression (I-1310). Otherwise each value the
 * arm holds (`armParts`) has every error of its reading
 * (`reportReadingErrors` "expression"), which ends at the `|` or `end` after
 * the value (`tokenAfter`, I-1445): a backtick string's own (I-1435),
 * `cycle | (1 2) | 3 end`'s and `cycle | x. | 3 end`'s. A statement in the
 * arm is read where it is lowered (`lowerLuauStatementNode`); in an arm
 * nobody lowers (`unlowered`, `reportAlternatorValue`), it is read here for
 * its string's errors. Each alternator a part holds is read in turn by the
 * part's reading (`readExpressionAst`).
 */
function reportArmReading(nodes: readonly SyntaxNode[], ctx: LowerContext, unlowered: boolean): void {
  if (nodes.length === 0) return;
  if (nodes.some(containsUnreadToken)) {
    reportSyntaxErrors(readExpressionAst(nodes, ctx)?.source.errors ?? [], ctx);
    return;
  }
  for (const part of armParts(nodes)) {
    if (part.nodes.length === 0) continue;
    if (part.statement) {
      if (!unlowered) continue;
      const reading = readBlockAst(part.nodes, ctx);
      if (reading) reportReadingErrors(reading.source.errors, part.nodes[0]!, ctx, "string");
      continue;
    }
    const reading = readExpressionAst(part.nodes, ctx, tokenAfter(part.nodes, ctx));
    if (!reading) continue;
    reportReadingErrors(reading.source.errors, part.nodes[0]!, ctx, "expression");
  }
}

/**
 * Reports the errors of each alternator a lowerer's reading holds
 * (`reportAlternatorValue`), which the reading reads as one opaque value,
 * whether or not lowering reaches it: `(cycle | 1 | 2 end) .. (cycle | ... end)`
 * lowers no further than its first alternator, and an alternator in another's
 * head or arm or in a tag's braces is not lowered at all. The reading funnel
 * calls it (`readExpressionAst`, `readBlockAst`, `closureBodyAst`).
 */
export function reportNestedAlternators(expr: AstNode, ctx: LowerContext): void {
  const report = (node: AstExprSparkdownSequentialAlternator | AstExprSparkdownConditionalAlternator) => {
    const candidate = node.source.node as SyntaxNode | undefined;
    if (candidate) reportAlternatorValue(candidate, ctx);
    return false;
  };
  visitAst(expr, { visit: () => true, visitSparkdownSequentialAlternator: report, visitSparkdownConditionalAlternator: report });
}

// A `match` arm's `= value`, and the alternators whose head holds what an
// arm holds rather than a condition.
const ARM_ASSIGNMENTS = nodeNameSet(["LuauAssignmentOperation", "LuauSparkdownAssignmentOperation"]);
const SEQUENTIAL_ALTERNATORS = nodeNameSet(["LuauSequentialAlternatorBlock", "LuauSequentialAlternatorLineStart", "LuauSparkdownSequentialAlternatorBlock"]);

/** Whether a node of an arm is a `match` arm's `= value`. */
function isArmAssignment(node: SyntaxNode): boolean {
  return ARM_ASSIGNMENTS.has(node.name);
}

/**
 * Reports the errors of an alternator's head, what stands between its word
 * and its first `|` (`cycle `a {} b` | 1 end`, a `match`'s condition),
 * read as an expression (`reportReadingErrors` "expression"),
 * where no lowerer lowers it: a sequential alternator's head, and any head
 * of an alternator Luau code uses as a value. A backtick string's errors in
 * it are the reading's to report, as everywhere (I-1435). A sequential
 * alternator's head takes no value, so anything in it is an error at its
 * range, and the alternator runs as if it had none (I-1446).
 */
export function reportAlternatorHead(candidate: SyntaxNode, ctx: LowerContext): void {
  const head = candidate.name === "LuauSparkdownSequentialAlternatorBlock" ? storyHeadNodes(candidate) : alternatorHeadNodes(candidate);
  const nodes = head.filter((node) => !isTrivia(node));
  if (nodes.length === 0) return;
  // A sequential alternator's head holds what an arm holds; a `match`'s
  // is its one condition.
  if (SEQUENTIAL_ALTERNATORS.has(candidate.name)) {
    reportArmReading(nodes.filter((node) => isLuauNodeName(node.name)), ctx, true);
    const begin = candidate.getChild(`${candidate.name}_begin`);
    // Its own keywords, not those of an alternator its head holds.
    const keywords = (begin ? getDescendents("LuauControlKeyword", begin) : [])
      .filter((k) => k.to <= nodes[0]!.from)
      .map((k) => ctx.read(k.from, k.to).trim());
    const message = `A \`${keywords.join(" ") || "queue"}\` takes no value before its first \`|\`; write its arms as \`| ...\``;
    const source = statementSource({ from: nodes[0]!.from, to: nodes[nodes.length - 1]!.to }, ctx);
    // More than one reading can hold the same alternator (a function body's),
    // and each reports it (`reportNestedAlternators`): it is reported once.
    const reported = ctx.diagnostics?.some(
      (d) =>
        d.message === message &&
        d.source?.startLineNumber === source.startLineNumber &&
        d.source?.startCharacterNumber === source.startCharacterNumber,
    );
    if (!reported) ctx.diagnostics?.push({ message, severity: ErrorType.Error, source });
    return;
  }
  const reading = readExpressionAst(nodes, ctx, tokenAfter(nodes, ctx));
  if (!reading) return;
  reportReadingErrors(reading.source.errors, nodes[0]!, ctx, "expression");
}

// A story block alternator's head: its content's nodes before the first `|`
// (`chain x` on the keyword's line, story text that `lowerArms` never reaches).
function storyHeadNodes(alternator: SyntaxNode): SyntaxNode[] {
  const nodes: SyntaxNode[] = [];
  const content = alternator.getChild(`${alternator.name}_content`);
  for (let child = content?.firstChild ?? null; child && child.name !== "LuauAlternatorSeparator"; child = child.nextSibling) {
    nodes.push(child);
  }
  return nodes;
}

/**
 * The offset of the token that ends a value of an alternator's head or arm,
 * where its reading meets its end of input (`readExpressionAst`): the `|`,
 * the `end` or the next value after it, within the alternator
 * (`enclosingAlternator`, a story `match`'s too).
 */
export function tokenAfter(nodes: readonly SyntaxNode[], ctx: LowerContext): number | undefined {
  const last = nodes[nodes.length - 1];
  if (!last) return undefined;
  const alternator = enclosingAlternator(last.parent);
  if (!alternator) return undefined;
  // In a story statement cut at its unclosed bracket's line, the reading
  // ends at the cut (`enclosingUnclosedIslandEnd`, I-1532).
  const text = documentText(ctx);
  const cut = enclosingUnclosedIslandEnd(alternator, text);
  return nextLuauToken(last.to, text, cut !== undefined ? Math.min(cut, alternator.to) : alternator.to)?.from;
}

/**
 * Reports the errors of an alternator that Luau code uses as a value
 * (`store s = cycle | `a {} b` | 2 end`), which no lowerer lowers: its
 * head's and each arm's, as `lowerArms` reports an arm's for one it
 * lowers, and those of each alternator they hold.
 */
export function reportAlternatorValue(candidate: SyntaxNode, ctx: LowerContext): void {
  reportAlternatorHead(candidate, ctx);
  for (const nodes of armNodesOf(candidate, documentText(ctx))) reportArmReading(nodes, ctx, true);
}

/** The nodes each arm of an alternator holds, trivia left out, in order. */
function armNodesOf(candidate: SyntaxNode, text: string): SyntaxNode[][] {
  const isCandidate = ALTERNATOR_CANDIDATES.has(candidate.name);
  const armsNode = isCandidate ? alternatorArms(candidate) : null;
  // An empty first arm whose separator the head took leaves no content, or
  // no arms (`lowerArms`).
  const content = isCandidate ? (armsNode?.getChild(`${armsNode.name}_content`) ?? null) : findChildByName(candidate, `${candidate.name}_content`);
  const arms: SyntaxNode[][] = [];
  let nodes: SyntaxNode[] = [];
  // The arms begin with the first arm's body where the head took its
  // separator (I-1408).
  let inArm = isCandidate && headSeparator(candidate) !== null;
  // The arms the tree reads on the story lines after a story statement's
  // unclosed bracket are story, not the alternator's (I-1532).
  const cut = enclosingUnclosedIslandEnd(candidate, text);
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (cut !== undefined && child.from >= cut) break;
    if (child.name === "LuauAlternatorSeparator") {
      if (inArm) arms.push(nodes);
      nodes = [];
      inArm = true;
    } else if (inArm && !isTrivia(child)) {
      nodes.push(child);
    }
  }
  arms.push(nodes);
  return arms;
}

/**
 * The condition of an alternator Luau code uses as a value: its own
 * condition node, or where the grammar gives it none (a declaration's value
 * at the top level, `local v = match 1 | a = 2 end`), what its head holds
 * before its first `|`. A condition node of an alternator in its head or arms
 * is not its own.
 */
export function valuedConditionNodes(candidate: SyntaxNode): SyntaxNode[] {
  const condNode = getDescendent("LuauConditionalAlternatorCondition", candidate) ?? null;
  let owner = condNode?.parent ?? null;
  while (owner && !ALTERNATOR_CANDIDATES.has(owner.name)) owner = owner.parent;
  if (condNode && owner && owner.from === candidate.from && owner.name === candidate.name) {
    return containerValueNodes(condNode);
  }
  return alternatorHeadNodes(candidate).filter((node) => !isTrivia(node));
}

/**
 * What an alternator Luau code uses as a value or writes as a statement
 * runs, read as Luau on its own, as `valueArmBody` lowers it: a `match`'s
 * condition, and each arm's statements, the calls before its last value and
 * its last value (`armParts`); not a sequential alternator's head, which is
 * no arm (I-1446), nor a value before an arm's last that is no call, which
 * nothing reads. The reading of the code around it holds the alternator as
 * one opaque value (`AstExprSparkdownSequentialAlternator`), so the scans
 * of what that code declares and reads (`freeVariables`,
 * `immediateBodyDeclarations`, `functionBindings`) read these too. They are
 * grouped by the scope they share, the condition's and then each arm's, in
 * order, with the document range of each: a statement's locals are in scope
 * for the parts of its arm after it, which are read on their own. Reports
 * nothing: the reading around it reports their errors
 * (`reportNestedAlternators`).
 */
export function alternatorPartsAst(candidate: SyntaxNode, text: string): AlternatorScope[] {
  const groups: AlternatorScope[] = [];
  const readParts = (nodes: readonly SyntaxNode[]) => {
    const parts = armParts(nodes, true).filter((part) => part.nodes.length > 0);
    const group: AstNode[] = [];
    for (const [k, part] of parts.entries()) {
      if (part.statement) {
        group.push(readLuauBlock(part.nodes, text).root);
        continue;
      }
      const expr = readLuauExpression(part.nodes, text).expr;
      if (k === parts.length - 1 || expr instanceof AstExprCall) group.push(expr);
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (group.length > 0 && first && last) groups.push({ from: first.from, to: last.to, parts: group });
  };
  if (!SEQUENTIAL_ALTERNATORS.has(candidate.name)) {
    const condition = valuedConditionNodes(candidate);
    if (condition.length > 0) readParts(condition);
  }
  for (const nodes of armNodesOf(candidate, text)) readParts(nodes);
  return groups;
}

/**
 * The scopes of an alternator Luau code reads as one opaque value
 * (`alternatorPartsAst`), or null for any other node: what the scans of a
 * function's declarations and reads walk into.
 */
export function alternatorScopesOf(node: AstNode, ctx: LowerContext): AlternatorScope[] | null {
  if (!(node instanceof AstExprSparkdownSequentialAlternator || node instanceof AstExprSparkdownConditionalAlternator)) return null;
  const candidate = node.source.node as SyntaxNode | undefined;
  return candidate ? alternatorPartsAst(candidate, documentText(ctx)) : [];
}

/** The Luau one scope of an alternator runs (`alternatorPartsAst`), and its document range. */
export interface AlternatorScope {
  from: number;
  to: number;
  parts: AstNode[];
}

// A single-line block arm is a display line of its own: a `display({ text })`
// call on the default target carrying the arm's tags, and a divert after the
// call, which holds the line open (`open`) as a mid-line divert does. An arm with no
// text keeps its tags on the stream.
function armLineAsDisplayCall(
  parts: ParsedObject[],
  ctx: LowerContext,
): ParsedObject[] {
  const text: ParsedObject[] = [];
  const tail: ParsedObject[] = [];
  const tagObjects: ParsedObject[] = [];
  let inTag = false;
  for (const obj of parts) {
    if (obj instanceof Tag) {
      inTag = obj.isStart;
      tagObjects.push(obj);
    } else if (inTag) {
      tagObjects.push(obj);
    } else if (tail.length === 0 && obj instanceof Text) {
      text.push(obj);
    } else {
      tail.push(obj);
    }
  }
  const out: ParsedObject[] = [];
  if (text.length === 0) {
    out.push(...tagObjects);
  } else {
    const { tags } = separateTags(tagObjects);
    // An arm whose tail is a divert holds its line open for the first line
    // the divert reaches.
    const open =
      tail.length > 0 &&
      tail.every(
        (obj) => obj instanceof Divert || obj instanceof TunnelOnwards,
      );
    out.push(
      buildDisplayCall(undefined, undefined, text, null, ctx, tags, { open }),
    );
  }
  if (text.length === 0 || tail.length > 0) {
    out.push(...tail, new Text("\n"));
  }
  return out;
}

// Kept exported here for the lowerers that import it from this module.
export { findChildByName };

// Walks the children of a `LuauSparkdown*AlternatorArm_content` node
// and emits the arm body into `out`. Splits the arm's content into
// runs of plain text (Word / Space / Punctuation / etc.) and `ArmTag`
// annotations:
//   - Text runs become a single `Text` ParsedObject (trailing
//     whitespace stripped from the final run to drop the
//     pre-boundary space that the arm rule's end-pattern leaves on
//     the trailing content).
//   - `ArmTag` nodes emit `Tag(true)` + `Text(tagContent)` +
//     `Tag(false)` so the runtime collects them into `currentTags`
//     via the `BeginTag` / `EndTag` control-command pair. An inline-glued
//     arm runs inside the captured string of its line's `display()` call,
//     where an `EndTag` is taken for a choice label's tag, so with
//     `inString` its tag is instead a runtime `Tag` object: the string's
//     `EndString` moves it out to the output stream, where it lands in the
//     step's `currentTags`.
function lowerArmContent(
  armContent: SyntaxNode,
  out: ParsedObject[],
  ctx: LowerContext,
  inString = false,
): void {
  let textBuf = "";
  const flushText = (trim: boolean): void => {
    let text = textBuf;
    // value-level: buffered display text, trimming its trailing whitespace
    if (trim) text = text.replace(/\s+$/, "");
    if (text.length > 0) out.push(new Text(text));
    textBuf = "";
  };
  let child = armContent.firstChild;
  while (child) {
    if (child.name === "ArmTag") {
      // Strip the trailing whitespace that's part of the surrounding
      // text run; don't trim mid-arm leading whitespace that belongs
      // to the text immediately before the tag.
      flushText(true);
      // `ArmTagContent` lives one level inside the auto-generated `_c3`
      // capture wrapper, so use `getDescendent` rather than the direct
      // child lookup.
      const tagContent = getDescendent("ArmTagContent", child);
      const raw = tagContent
        ? ctx.read(tagContent.from, tagContent.to).trim()
        : "";
      if (raw.length > 0 && inString) {
        out.push(new LegacyTag(new RuntimeTag(raw)));
      } else if (raw.length > 0) {
        out.push(new Tag(true));
        out.push(new Text(raw));
        out.push(new Tag(false));
      }
    } else if (child.name === "ArmDivert") {
      // Structural divert inside the arm — route through the main
      // dispatcher so `-> target` becomes a real `Divert` ParsedObject
      // (with proper path resolution, argument lowering, and
      // `isTunnel` flag handling) rather than literal text. This is
      // what makes the flat-weave-style "alternator arm pivots to
      // another path" idiom work in sparkdown:
      //   {chain | -> next_scene | other_text end}
      // The arm's `ArmDivert` grammar rule has the same captures as the
      // standard `Divert` rule but with an end pattern that respects
      // alternator-arm boundaries (`|`, `end`, NL). The lowerer
      // dispatch (`lower.ts`) treats `ArmDivert` exactly like `Divert`.
      flushText(true);
      const block = lower(child as unknown as SparkdownSyntaxNodeRef, ctx);
      forwardBlockDiagnostics(block, ctx);
      out.push(...unwrapBlockContent(block));
    } else {
      // Plain text child (Word / Space / Punctuation / Escape /
      // interpolation result, etc.). Accumulate the raw source text;
      // the runtime concatenates Text runs into the output stream.
      textBuf += ctx.read(child.from, child.to);
    }
    child = child.nextSibling;
  }
  flushText(true);
}
