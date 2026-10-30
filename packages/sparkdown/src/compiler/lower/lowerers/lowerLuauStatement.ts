import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import {
  AstStat,
  AstStatAssign,
  AstStatBlock,
  AstStatBreak,
  AstStatCompoundAssign,
  AstStatContinue,
  AstStatError,
  AstStatExpr,
  AstStatFor,
  AstStatForIn,
  AstStatFunction,
  AstStatIf,
  AstStatLocal,
  AstStatLocalFunction,
  AstStatRepeat,
  AstStatReturn,
  AstStatSparkdownExplicit,
  AstStatSparkdownStore,
  AstStatWhile,
} from "../../typecheck/Ast";
import type { LuauStatementSource } from "../../typecheck/readLuauAst";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { REASSIGNMENT_NAMES } from "../../utils/reassignmentNames";
import { VARIABLE_DEFINITION_NAMES } from "../../utils/variableDefinitionNames";
import type { LowerContext } from "../context";
import { stampStatement } from "../lower";
import { reportReadingErrors } from "../expression/lowerFunction";
import {
  documentText,
  nodeAfterAttributes,
  offsetAt,
  readBlockAst,
  type LuauSource,
} from "../utils/luauAst";
import {
  forwardBlockDiagnostics,
  unwrapBlockContent,
} from "../utils/unwrapBlock";
import { makeSource } from "../utils/validateDefineStructure";
import { validateStatementNode } from "../utils/validateAssignmentValue";
import { wrapInWeave } from "../utils/wrapInWeave";
import { armRunAlternator } from "../utils/alternatorArms";
import { soleLocalAlternators } from "../utils/alternatorValue";
import { lowerExplicitStatement } from "./lowerExplicitStatement";
import { lowerLuauBreakStatement, lowerLuauContinueStatement } from "./lowerLuauBreakContinue";
import { lowerLuauDoBlock } from "./lowerLuauDoBlock";
import { lowerLuauForLoop } from "./lowerLuauForLoop";
import { lowerLuauFunctionDefinition } from "./lowerLuauFunctionDefinition";
import { lowerLuauGenericForLoop } from "./lowerLuauGenericForLoop";
import { findNextUntilSibling, lowerLuauRepeatLoop } from "./lowerLuauRepeatLoop";
import { lowerLuauReturnStatement } from "./lowerLuauReturnStatement";
import { lowerLuauWhileLoop } from "./lowerLuauWhileLoop";
import {
  lowerAssignment,
  lowerCallStatement,
  lowerCompoundAssignment,
} from "./lowerReassignment";
import { lowerLuauIfBlock } from "./lowerSparkdownIfBlock";
import { lowerVariableDefinition } from "./lowerVariableDefinition";

export const LUAU_STATEMENT_NODES: ReadonlySet<string> = nodeNameSet([
  "LuauVariableDefinition",
  "LuauSparkdownVariableDefinition",
  "LuauSparkdownExplicitStatement",
  "LuauSparkdownExplicitBlockStatement",
  "LuauReassignment",
  "LuauSparkdownReassignment",
  "LuauFunctionAttributes",
  "LuauFunctionDefinition",
  "LuauIfBlock",
  "LuauSparkdownIfBlock",
  "LuauReturnStatement",
  "LuauDataTypeDeclaration",
  "LuauFunctionTypeDeclaration",
  "LuauWhileLoop",
  "LuauSparkdownWhileLoop",
  "LuauDoBlock",
  "LuauSparkdownDoBlock",
  "LuauSparkdownExplicitDoBlock",
  "LuauSparkdownExplicitIfBlock",
  "LuauSparkdownExplicitLoop",
  "LuauSparkdownExplicitRepeatLoop",
  "LuauForLoop",
  "LuauSparkdownForLoop",
  "LuauRepeatLoop",
  "LuauSparkdownRepeatLoop",
  "LuauBreakStatement",
  "LuauContinueStatement",
]);

export interface StatementSite {
  node: SyntaxNode;
  source: LuauSource;
}

export function statementNodeAt(
  stat: AstStat,
  site: StatementSite,
  names: ReadonlySet<string>,
  ctx: LowerContext,
): SyntaxNode | null {
  if (stat instanceof AstStatFunction || stat instanceof AstStatLocalFunction) {
    const node = nodeAfterAttributes(stat.func, site.source, names, ctx);
    if (node !== undefined) return node;
  }
  const at = offsetAt(stat.location.begin, ctx);
  const text = documentText(ctx);
  const beginsHere = (node: SyntaxNode) =>
    node.from <= at && text.slice(node.from, at).trim() === "";
  let found: SyntaxNode | null = null;
  for (
    let node: SyntaxNode | null = site.source.top.resolveInner(at, 1);
    node;
    node = node.parent
  ) {
    if (names.has(node.name) && beginsHere(node)) found = node;
    if (node === site.node) break;
  }
  return found;
}

export function unreadStatement(
  stat: AstStat,
  site: StatementSite,
  keyword: string,
  ctx: LowerContext,
): CompiledBlock {
  const from = offsetAt(stat.location.begin, ctx);
  const to = offsetAt(stat.location.end, ctx);
  const explained = site.source.errors.some((error) => {
    const at = offsetAt(error.location.begin, ctx);
    return at >= from && at <= to;
  });
  if (!explained) {
    ctx.diagnostics?.push({
      message: `This \`${keyword}\` statement cannot run here: its line is not read as a \`${keyword}\` statement.`,
      severity: ErrorType.Error,
      source: makeSource(from, from + keyword.length, ctx),
    });
  }
  return {};
}

export function statementRange(
  stat: AstStat,
  nodes: readonly { from: number; to: number }[],
  ctx: LowerContext,
): { from: number; to: number } {
  const from = offsetAt(stat.location.begin, ctx);
  let end = from;
  for (const node of nodes) end = Math.max(end, node.to);
  return { from, to: Math.max(from, Math.min(offsetAt(stat.location.end, ctx), end)) };
}

export function readStatements(
  node: SyntaxNode,
  statements: readonly LuauStatementSource[],
  source: LuauSource,
  ctx: LowerContext,
): LuauStatementSource[] {
  if (statements.length <= 1) return [...statements];
  let firstError = Infinity;
  for (const error of source.errors) {
    const at = offsetAt(error.location.begin, ctx);
    if (at >= node.from && at < node.to && at < firstError) firstError = at;
  }
  return statements.filter(
    (s, i) => i === 0 || offsetAt(s.statement.location.begin, ctx) < firstError,
  );
}

export function lowerLuauStatementNode(
  node: SyntaxNode,
  ctx: LowerContext,
  report = true,
): CompiledBlock {
  const nodes = [node];
  if (node.name === "LuauRepeatLoop" || node.name === "LuauSparkdownRepeatLoop") {
    const until = findNextUntilSibling(node);
    if (until) nodes.push(until);
  }
  const reading = readBlockAst(nodes, ctx);
  if (!reading) return {};
  if (report) reportReadingErrors(reading.source.errors, node, ctx, "string");
  return lowerLuauStatementsAt(
    node,
    readStatements(node, reading.unit.statements, reading.source, ctx),
    { node, source: reading.source },
    ctx,
  );
}

export function lowerLuauStatementsAt(
  node: SyntaxNode,
  statements: readonly LuauStatementSource[],
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  validateStatements(node, statements, site, ctx);
  if (statements.length === 1) {
    return lowerLuauStatement(statements[0]!.statement, site, ctx);
  }
  const content: ParsedObject[] = [];
  for (const { statement, nodes } of statements) {
    const block = lowerLuauStatement(statement, site, ctx);
    forwardBlockDiagnostics(block, ctx);
    if (block.content) {
      const range = statementRange(statement, nodes, ctx);
      stampStatement(block.content, statement instanceof AstStatIf, range.from, range.to, ctx);
      content.push(...unwrapBlockContent(block));
    }
  }
  return wrapInWeave(content);
}

const VALIDATED_NODES: ReadonlySet<string> = new Set([
  ...REASSIGNMENT_NAMES,
  ...VARIABLE_DEFINITION_NAMES,
  ...nodeNameSet([
    "LuauSparkdownExplicitStatement",
    "LuauSparkdownExplicitBlockStatement",
    "LuauAccessPath",
    "LuauParenthetical",
  ]),
]);

function validateStatements(
  node: SyntaxNode,
  statements: readonly LuauStatementSource[],
  site: StatementSite,
  ctx: LowerContext,
): void {
  const continuation: SyntaxNode[] = [];
  const seen = new Set<number>();
  for (const { nodes } of statements) {
    for (const ref of nodes) {
      if (ref.from === node.from && ref.name === node.name) continue;
      if (seen.has(ref.from)) continue;
      seen.add(ref.from);
      continuation.push(siblingNode(node, ref) ?? node);
    }
  }
  const validated: SyntaxNode[] = [];
  for (const { statement } of statements) {
    const own = statementNodeAt(statement, site, VALIDATED_NODES, ctx);
    if (own && !validated.some((n) => n.from === own.from && n.name === own.name)) {
      validated.push(own);
    }
  }
  validated.forEach((own, i) => {
    validateStatementNode(
      own,
      i === validated.length - 1 ? continuation.filter((n) => n !== node) : [],
      ctx,
    );
  });
}

function siblingNode(
  node: SyntaxNode,
  ref: { name: string; from: number },
): SyntaxNode | null {
  for (let next = node.nextSibling; next; next = next.nextSibling) {
    if (next.from === ref.from && next.name === ref.name) return next;
    if (next.from > ref.from) break;
  }
  return null;
}

export function lowerLuauStatement(
  stat: AstStat,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const runs = armRunAlternator(stat);
  if (runs) soleLocalAlternators.add(runs);
  if (stat instanceof AstStatSparkdownExplicit) {
    return lowerExplicitStatement(stat, site, ctx);
  }
  if (stat instanceof AstStatLocal || stat instanceof AstStatSparkdownStore) {
    return lowerVariableDefinition(stat, site, ctx);
  }
  if (stat instanceof AstStatAssign) return lowerAssignment(stat, site, ctx);
  if (stat instanceof AstStatCompoundAssign) {
    return lowerCompoundAssignment(stat, site, ctx);
  }
  if (stat instanceof AstStatExpr) return lowerCallStatement(stat, site, ctx);
  if (stat instanceof AstStatFunction || stat instanceof AstStatLocalFunction) {
    return lowerLuauFunctionDefinition(stat, site, ctx);
  }
  if (stat instanceof AstStatIf) return lowerLuauIfBlock(stat, site, ctx);
  if (stat instanceof AstStatWhile) return lowerLuauWhileLoop(stat, site, ctx);
  if (stat instanceof AstStatFor) return lowerLuauForLoop(stat, site, ctx);
  if (stat instanceof AstStatForIn) {
    return lowerLuauGenericForLoop(stat, site, ctx);
  }
  if (stat instanceof AstStatRepeat) return lowerLuauRepeatLoop(stat, site, ctx);
  if (stat instanceof AstStatBlock) return lowerLuauDoBlock(stat, site, ctx);
  if (stat instanceof AstStatReturn) {
    return lowerLuauReturnStatement(stat, site, ctx);
  }
  if (stat instanceof AstStatBreak) return lowerLuauBreakStatement(ctx);
  if (stat instanceof AstStatContinue) return lowerLuauContinueStatement(ctx);
  if (stat instanceof AstStatError) {
    const [only] = stat.statements;
    if (
      stat.statements.length === 1 &&
      (only instanceof AstStatBreak || only instanceof AstStatContinue)
    ) {
      return lowerLuauStatement(only, site, ctx);
    }
  }
  return {};
}

export function takesLines(stat: AstStat): boolean {
  if (stat instanceof AstStatSparkdownExplicit) return takesLines(stat.statement);
  if (stat instanceof AstStatError) return false;
  if (stat instanceof AstStatIf) {
    if (!stat.thenLocation) return false;
    if (stat.elsebody instanceof AstStatIf) return takesLines(stat.elsebody);
    if (stat.elsebody instanceof AstStatBlock) return stat.elsebody.hasEnd;
    return stat.thenbody.hasEnd;
  }
  if (stat instanceof AstStatWhile || stat instanceof AstStatFor) {
    return stat.hasDo && stat.body.hasEnd;
  }
  if (stat instanceof AstStatForIn) {
    return stat.hasIn && stat.hasDo && stat.body.hasEnd;
  }
  if (stat instanceof AstStatRepeat) return stat.body.hasEnd;
  if (stat instanceof AstStatBlock) return stat.hasEnd;
  if (stat instanceof AstStatFunction || stat instanceof AstStatLocalFunction) {
    return stat.func.body.hasEnd;
  }
  return true;
}

export function explicitDeclaration(node: SyntaxNode): SyntaxNode | null {
  return getDescendent(["LuauSparkdownVariableDefinition"], node) ?? null;
}
