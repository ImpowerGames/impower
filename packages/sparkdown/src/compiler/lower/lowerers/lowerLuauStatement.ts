// Luau statements lowered from the converter's AST (`typecheck/readLuauAst.ts`).
//
// The converter reads a block's statement nodes as Luau's parser reads the
// statements' text: where each statement ends (a value list that goes on
// after a line-ending comma, a line that begins with `.` or an operator and
// continues the value before it, a `repeat`'s `until` line), how its targets
// and values divide, and its expressions' structure. Each statement is
// recorded with the syntax nodes it was read from, so the block's walk
// (`lowerStatements`) lowers the statements that begin in a node and skips
// the nodes they continue into. A statement that holds a body (a function, a
// loop, an `if`) lowers its body from its own syntax nodes, which hold the
// Sparkdown lines among its Luau.
//
// The validators that report a list or a value missing (`validateAssignmentValue.ts`)
// read the statement's syntax node, whose operators and commas their
// diagnostics are placed on.

import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
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
import { validateStatementNode } from "../utils/validateAssignmentValue";
import { wrapInWeave } from "../utils/wrapInWeave";
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

/**
 * The statement nodes whose Luau the converter reads, wherever they stand:
 * a scene's or the top level's own nodes, and a block's children. A `choose`
 * block is Sparkdown's, with its choices, and lowers its Luau children one
 * by one.
 */
export const LUAU_STATEMENT_NODES: ReadonlySet<string> = nodeNameSet([
  "LuauVariableDefinition",
  "LuauSparkdownVariableDefinition",
  "LuauSparkdownExplicitStatement",
  "LuauSparkdownExplicitBlockStatement",
  "LuauReassignment",
  "LuauSparkdownReassignment",
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

/**
 * Where a statement was read from: the syntax node it begins in, and what
 * the AST was read from.
 */
export interface StatementSite {
  /** The block's node the statement begins in. */
  node: SyntaxNode;
  source: LuauSource;
}

/**
 * The syntax node a statement of one of `names` was read from: the
 * outermost such node, at or inside the node the statement begins in, that
 * begins with the statement (after its line's indentation).
 */
export function statementNodeAt(
  stat: AstStat,
  site: StatementSite,
  names: ReadonlySet<string>,
  ctx: LowerContext,
): SyntaxNode | null {
  // A function statement's attributes (`@native function f()`) are nodes
  // of their own before the function's.
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

/** The document range of a statement: from its first token to its last, no further than the nodes it was read from. */
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

/**
 * The statements that begin in a node, without those the converter read
 * only while recovering from a syntax error earlier in the node (`a, g +=
 * 1` reads as `a, g = <error>` and then `<error> += 1`): the first
 * statement, and each one after it that begins before the node's first
 * error. The type checker reports the error; lowering what the recovery
 * read would run code the author did not write.
 */
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

/**
 * Lowers a statement node on its own: a top-level node of a scene or of the
 * document, or a child of a block that lowers its children one by one (a
 * `choose` block, an alternator's arm). A `repeat` loop's `until` line is a
 * node of its own after it, which the loop reads with it.
 */
export function lowerLuauStatementNode(
  node: SyntaxNode,
  ctx: LowerContext,
): CompiledBlock {
  const nodes = [node];
  if (node.name === "LuauRepeatLoop" || node.name === "LuauSparkdownRepeatLoop") {
    const until = findNextUntilSibling(node);
    if (until) nodes.push(until);
  }
  const reading = readBlockAst(nodes, ctx);
  if (!reading) return {};
  return lowerLuauStatementsAt(
    node,
    readStatements(node, reading.unit.statements, reading.source, ctx),
    { node, source: reading.source },
    ctx,
  );
}

/**
 * Lowers the statements that begin in one node of a block (one, or several
 * on one line: `local a = 1 a = 2`), and runs the validators of the
 * statement nodes they were read from, once each. A single statement's
 * block is returned as it is, for the caller to stamp; several are merged
 * into one weave, each stamped with its own range.
 */
export function lowerLuauStatementsAt(
  node: SyntaxNode,
  statements: readonly LuauStatementSource[],
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  validateStatements(node, statements, site, ctx);
  // The validator reports this invalid line. Its recovery AST must not
  // execute or add runtime name warnings for a statement the author did not write.
  if (node.name === "LuauInvalidStatement") return {};
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

// The statement nodes the validators read.
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

// Runs the validators of each statement node the statements were read
// from, once each. The nodes after `node` that the statements continue into
// are the lines that continue the last of them.
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

// The sibling of `node`, after it, that a statement's source names.
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

/** Lowers one statement of the converter's AST. */
export function lowerLuauStatement(
  stat: AstStat,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
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
    // A loop's body is read on its own, where its `break` or `continue`
    // stands outside any loop the reading sees; the loop it is in is the
    // lowering's (`ctx.loopStack`), which lowers it or drops it.
    const [only] = stat.statements;
    if (
      stat.statements.length === 1 &&
      (only instanceof AstStatBreak || only instanceof AstStatContinue)
    ) {
      return lowerLuauStatement(only, site, ctx);
    }
  }
  // A type declaration does not reach the runtime, and a statement Luau
  // cannot read is the type checker's to report.
  return {};
}

/**
 * Whether a statement takes the nodes after the one it begins in, which
 * the block's walk then skips. A statement the converter could not read
 * takes none, and nor does one whose `then`, `do`, `in`, `end` or `until`
 * is missing: the grammar ended it at its line, and the converter, reading
 * on as Luau does, took the lines after it into its body, which the walk
 * lowers as the statements they are.
 */
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

/** The `LuauSparkdownVariableDefinition` an explicit statement declares with, if it is a declaration. */
export function explicitDeclaration(node: SyntaxNode): SyntaxNode | null {
  return getDescendent(["LuauSparkdownVariableDefinition", "LuauSparkdownExplicitStoryVariableDefinition"], node) ?? null;
}
