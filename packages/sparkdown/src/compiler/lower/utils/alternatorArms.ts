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

function buildDivertFromTargetLiteral(
  node: SyntaxNode,
  ctx: LowerContext,
): Divert | null {
  const parts = lowerDivertPath(node, ctx);
  if (parts.length === 0) return null;
  return new Divert(parts);
}

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
  key: string | null;
  body: ParsedObject[];
}

export function lowerArms(
  content: SyntaxNode | null,
  ctx: LowerContext,
  valued: ValuedArms | false = false,
): AlternatorArm[] {
  const arms: AlternatorArm[] = [];
  if (!content) return arms;
  const candidate = content.parent && ALTERNATOR_CANDIDATES.has(content.parent.name) ? content.parent : null;
  const armsNode = candidate ? alternatorArms(candidate) : null;
  const armsContent = candidate ? (armsNode?.getChild(`${armsNode.name}_content`) ?? null) : content;
  let current: AlternatorArm | null = null;
  let armNodes: SyntaxNode[] = [];
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
      if (isLuauNodeName(child.name) && !isTrivia(child)) armNodes.push(child);
    } else if (current) {
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
      const emptyDivert = emptyDivertRange(child, ctx);
      if (emptyDivert) {
        ctx.diagnostics?.push(emptyDivertDiagnostic(emptyDivert, ctx));
        child = child.nextSibling;
        continue;
      }

      if (isLuauNodeName(child.name)) armNodes.push(child);
      const block = lower(child as unknown as SparkdownSyntaxNodeRef, ctx);
      forwardBlockDiagnostics(block, ctx);
      if (block?.content) {
        current.body.push(...unwrapBlockContent(block));
      } else {
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

const CONTINUATIONS = nodeNameSet([
  "LuauArithmeticOperation",
  "LuauCompareOperation",
  "LuauConcatOperation",
  "LuauLogicalOperation",
  "LuauTypeCastOperation",
]);

function armParts(nodes: readonly SyntaxNode[], functionValues = false): { statement: boolean; nodes: SyntaxNode[] }[] {
  const parts: { statement: boolean; nodes: SyntaxNode[] }[] = [];
  for (const node of nodes) {
    const last = parts[parts.length - 1];
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

function valueArmBody(nodes: readonly SyntaxNode[], ctx: LowerContext, mode: ValuedArms): ParsedObject[] {
  const body: ParsedObject[] = [];
  const parts = armParts(nodes, true);
  if (mode === "value") {
    for (const part of parts) {
      if (part.statement) reportArmExits(readLuauBlock(part.nodes, documentText(ctx)).root, ctx);
    }
  }
  const scoped = parts.some((part) => part.statement);
  if (scoped) {
    ctx.scopeDepth = (ctx.scopeDepth ?? 0) + 1;
  }
  let value: Expression | null = null;
  for (const [k, part] of parts.entries()) {
    if (part.statement) {
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
  return wrapInScope(body);
}

const EXIT_KEYWORDS = new Map<unknown, string>([
  [AstStatBreak, "break"],
  [AstStatContinue, "continue"],
  [AstStatReturn, "return"],
]);

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
        return !(inner instanceof AstExprSparkdownSequentialAlternator || inner instanceof AstExprSparkdownConditionalAlternator);
      },
    });
  };
  walk(root, 0);
}

export function armRunAlternator(node: AstNode): AstExprSparkdownSequentialAlternator | AstExprSparkdownConditionalAlternator | null {
  const stat = node instanceof AstStatSparkdownExplicit ? node.statement : node;
  let value =
    stat instanceof AstStatExpr ? stat.expr
    : stat instanceof AstStatLocal && stat.values.length === 1 ? stat.values[0]
    : undefined;
  while (value instanceof AstExprGroup) value = value.expr;
  return value instanceof AstExprSparkdownSequentialAlternator || value instanceof AstExprSparkdownConditionalAlternator ? value : null;
}

function untilTrailingValue(repeatNode: SyntaxNode, untilNode: SyntaxNode, ctx: LowerContext): Expression | null {
  if (!isExplicitRuleName(repeatNode.name, "LuauRepeatLoop")) return null;
  const unit = readLuauBlock([repeatNode, untilNode], documentText(ctx));
  const last = unit.statements[unit.statements.length - 1]?.statement;
  if (!(last instanceof AstStatError) || last.statements.length > 0 || last.expressions.length !== 1) return null;
  let top = untilNode;
  while (top.parent) top = top.parent;
  return lowerExpression(last.expressions[0]!, { top, errors: unit.errors }, ctx);
}

function isAttribute(node: SyntaxNode): boolean {
  return isExplicitRuleName(node.name, "LuauAttribute");
}

function isFunctionValue(node: SyntaxNode): boolean {
  if (!isExplicitRuleName(node.name, "LuauFunctionDefinition")) return false;
  const content = findChildByName(node, `${node.name}_content`);
  return !content || !findChildByName(content, "LuauFunctionDeclarationName");
}

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

export function reportNestedAlternators(expr: AstNode, ctx: LowerContext): void {
  const report = (node: AstExprSparkdownSequentialAlternator | AstExprSparkdownConditionalAlternator) => {
    const candidate = node.source.node as SyntaxNode | undefined;
    if (candidate) reportAlternatorValue(candidate, ctx);
    return false;
  };
  visitAst(expr, { visit: () => true, visitSparkdownSequentialAlternator: report, visitSparkdownConditionalAlternator: report });
}

const ARM_ASSIGNMENTS = nodeNameSet(["LuauAssignmentOperation", "LuauSparkdownAssignmentOperation"]);
const SEQUENTIAL_ALTERNATORS = nodeNameSet(["LuauSequentialAlternatorBlock", "LuauSequentialAlternatorLineStart", "LuauSparkdownSequentialAlternatorBlock"]);

function isArmAssignment(node: SyntaxNode): boolean {
  return ARM_ASSIGNMENTS.has(node.name);
}

export function reportAlternatorHead(candidate: SyntaxNode, ctx: LowerContext): void {
  const head = candidate.name === "LuauSparkdownSequentialAlternatorBlock" ? storyHeadNodes(candidate) : alternatorHeadNodes(candidate);
  const nodes = head.filter((node) => !isTrivia(node));
  if (nodes.length === 0) return;
  if (SEQUENTIAL_ALTERNATORS.has(candidate.name)) {
    reportArmReading(nodes.filter((node) => isLuauNodeName(node.name)), ctx, true);
    const begin = candidate.getChild(`${candidate.name}_begin`);
    const keywords = (begin ? getDescendents("LuauControlKeyword", begin) : [])
      .filter((k) => k.to <= nodes[0]!.from)
      .map((k) => ctx.read(k.from, k.to).trim());
    const message = `A \`${keywords.join(" ") || "queue"}\` takes no value before its first \`|\`; write its arms as \`| ...\``;
    const source = statementSource({ from: nodes[0]!.from, to: nodes[nodes.length - 1]!.to }, ctx);
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

function storyHeadNodes(alternator: SyntaxNode): SyntaxNode[] {
  const nodes: SyntaxNode[] = [];
  const content = alternator.getChild(`${alternator.name}_content`);
  for (let child = content?.firstChild ?? null; child && child.name !== "LuauAlternatorSeparator"; child = child.nextSibling) {
    nodes.push(child);
  }
  return nodes;
}

export function tokenAfter(nodes: readonly SyntaxNode[], ctx: LowerContext): number | undefined {
  const last = nodes[nodes.length - 1];
  if (!last) return undefined;
  const alternator = enclosingAlternator(last.parent);
  if (!alternator) return undefined;
  const text = documentText(ctx);
  const cut = enclosingUnclosedIslandEnd(alternator, text);
  return nextLuauToken(last.to, text, cut !== undefined ? Math.min(cut, alternator.to) : alternator.to)?.from;
}

export function reportAlternatorValue(candidate: SyntaxNode, ctx: LowerContext): void {
  reportAlternatorHead(candidate, ctx);
  for (const nodes of armNodesOf(candidate, documentText(ctx))) reportArmReading(nodes, ctx, true);
}

function armNodesOf(candidate: SyntaxNode, text: string): SyntaxNode[][] {
  const isCandidate = ALTERNATOR_CANDIDATES.has(candidate.name);
  const armsNode = isCandidate ? alternatorArms(candidate) : null;
  const content = isCandidate ? (armsNode?.getChild(`${armsNode.name}_content`) ?? null) : findChildByName(candidate, `${candidate.name}_content`);
  const arms: SyntaxNode[][] = [];
  let nodes: SyntaxNode[] = [];
  let inArm = isCandidate && headSeparator(candidate) !== null;
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

export function valuedConditionNodes(candidate: SyntaxNode): SyntaxNode[] {
  const condNode = getDescendent("LuauConditionalAlternatorCondition", candidate) ?? null;
  let owner = condNode?.parent ?? null;
  while (owner && !ALTERNATOR_CANDIDATES.has(owner.name)) owner = owner.parent;
  if (condNode && owner && owner.from === candidate.from && owner.name === candidate.name) {
    return containerValueNodes(condNode);
  }
  return alternatorHeadNodes(candidate).filter((node) => !isTrivia(node));
}

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

export function alternatorScopesOf(node: AstNode, ctx: LowerContext): AlternatorScope[] | null {
  if (!(node instanceof AstExprSparkdownSequentialAlternator || node instanceof AstExprSparkdownConditionalAlternator)) return null;
  const candidate = node.source.node as SyntaxNode | undefined;
  return candidate ? alternatorPartsAst(candidate, documentText(ctx)) : [];
}

export interface AlternatorScope {
  from: number;
  to: number;
  parts: AstNode[];
}

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

export { findChildByName };

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
      flushText(true);
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
      flushText(true);
      const block = lower(child as unknown as SparkdownSyntaxNodeRef, ctx);
      forwardBlockDiagnostics(block, ctx);
      out.push(...unwrapBlockContent(block));
    } else {
      textBuf += ctx.read(child.from, child.to);
    }
    child = child.nextSibling;
  }
  flushText(true);
}
