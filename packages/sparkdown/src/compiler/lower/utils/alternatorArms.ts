import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { type SyntaxNode } from "@lezer/common";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
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
import { containerValueNodes, lowerExpressionFromNodes } from "../expression/lowerExpression";
import { lower } from "../lower";
import { forwardBlockDiagnostics, unwrapBlockContent } from "./unwrapBlock";
import { findChildByName } from "../../utils/findChildByName";
import { isTrivia } from "../../lint/luauTree";
import { reportReadingErrors, reportSyntaxErrors } from "../expression/lowerFunction";
import { documentText, readBlockAst, readExpressionAst } from "./luauAst";
import { nextLuauToken } from "../../typecheck/readLuauAst";
import { enclosingAlternator, isLuauNodeName, LUAU_STATEMENTS } from "../../typecheck/LuauUnitNodes";
import {
  AstExprSparkdownConditionalAlternator,
  AstExprSparkdownSequentialAlternator,
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
// via the main dispatcher and unwrapped from their `Weave` containers.
export function lowerArms(
  content: SyntaxNode | null,
  ctx: LowerContext,
): AlternatorArm[] {
  const arms: AlternatorArm[] = [];
  if (!content) return arms;
  // A candidate in Luau code holds its separators and arms in its
  // `LuauAlternatorArms` (I-1310); a story alternator holds them itself.
  const candidate = content.parent;
  const armsNode = candidate && ALTERNATOR_CANDIDATES.has(candidate.name) ? alternatorArms(candidate) : null;
  if (armsNode) content = armsNode.getChild(`${armsNode.name}_content`) ?? armsNode;
  let current: AlternatorArm | null = null;
  // The current arm's Luau nodes, for its errors (`reportArmReading`):
  // not a line of story or a divert, which lower as Sparkdown's own.
  let armNodes: SyntaxNode[] = [];
  const reportArm = () => {
    reportArmReading(armNodes, ctx, false);
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
  const lead = armsNode && candidate ? headSeparator(candidate) : null;
  if (lead) current = startArm(lead);

  let child = content.firstChild;
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
 * lowers them.
 */
function armParts(nodes: readonly SyntaxNode[]): { statement: boolean; nodes: SyntaxNode[] }[] {
  const parts: { statement: boolean; nodes: SyntaxNode[] }[] = [];
  for (const node of nodes) {
    const last = parts[parts.length - 1];
    if (isArmAssignment(node)) parts.push({ statement: false, nodes: containerValueNodes(node) });
    else if (LUAU_STATEMENTS.has(node.name)) parts.push({ statement: true, nodes: [node] });
    else if (CONTINUATIONS.has(node.name) && last && !last.statement) last.nodes.push(node);
    else parts.push({ statement: false, nodes: [node] });
  }
  return parts;
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
 * it are the reading's to report, as everywhere (I-1435).
 */
export function reportAlternatorHead(candidate: SyntaxNode, ctx: LowerContext): void {
  const nodes = alternatorHeadNodes(candidate).filter((node) => !isTrivia(node));
  if (nodes.length === 0) return;
  // A sequential alternator's head holds what an arm holds; a `match`'s
  // is its one condition.
  if (SEQUENTIAL_ALTERNATORS.has(candidate.name)) return reportArmReading(nodes, ctx, true);
  const reading = readExpressionAst(nodes, ctx, tokenAfter(nodes, ctx));
  if (!reading) return;
  reportReadingErrors(reading.source.errors, nodes[0]!, ctx, "expression");
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
  return nextLuauToken(last.to, documentText(ctx), alternator.to)?.from;
}

/**
 * Reports the errors of an alternator that Luau code uses as a value
 * (`store s = cycle | `a {} b` | 2 end`), which no lowerer lowers: its
 * head's and each arm's, as `lowerArms` reports an arm's for one it
 * lowers, and those of each alternator they hold.
 */
export function reportAlternatorValue(candidate: SyntaxNode, ctx: LowerContext): void {
  reportAlternatorHead(candidate, ctx);
  const armsNode = ALTERNATOR_CANDIDATES.has(candidate.name) ? alternatorArms(candidate) : null;
  const content = armsNode ? (armsNode.getChild(`${armsNode.name}_content`) ?? armsNode) : findChildByName(candidate, `${candidate.name}_content`);
  let nodes: SyntaxNode[] = [];
  // The arms begin with the first arm's body where the head took its
  // separator (I-1408).
  let inArm = !!armsNode && headSeparator(candidate) !== null;
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (child.name === "LuauAlternatorSeparator") {
      reportArmReading(nodes, ctx, true);
      nodes = [];
      inArm = true;
    } else if (inArm && !isTrivia(child)) {
      nodes.push(child);
    }
  }
  reportArmReading(nodes, ctx, true);
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
