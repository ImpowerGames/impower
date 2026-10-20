// Lints for Luau code: mistakes that compile but are almost certainly not
// what the author meant. Each rule and its message follow the Luau linter
// rule of the same name (`Luau/Linter.cpp`), whose tests are ported in
// `src/tests/luau-conformance/Lint*.test.ts`; `docs/compiler/LINTS.md` lists
// which Luau lints sparkdown has.
//
// The rules walk the Luau AST `readLuauAst.ts` reads from the syntax tree,
// the same reading the type checker checks, so a name is a local where Luau
// would bind it and an expression has Luau's shape. The pass runs over a
// whole script on every compile rather than inside the incremental
// annotators, because every rule reads beyond the node it reports on (an
// unused local depends on every later line of its block).
//
// The rules read the Luau of the units the checker reads and the Luau
// expressions outside them, in Sparkdown's own text and constructs (an
// interpolation or call shorthand, a divert's arguments, an alternator's
// selector, a Sparkle handler and its `{ ... }` statements, a `define`'s
// values and methods), wherever the tree marks a chain, a comparison, an `if`, a numeric
// or generic `for` or a function, as the tree lints found them. The rules about locals and reachability read the Luau
// functions a script defines (`function f()`, wherever it is written, and
// function values): a local outside a function can be read from
// interpolated text or later narrative the rules cannot scope. A function
// with a block missing its `end` is left alone, since its AST does not show
// what the author wrote. The rules about conditions and loop ranges read
// every Luau `if`, `if` expression, `and`/`or` chain and numeric `for`; of
// Sparkdown's narrative `if` block around dialogue, they read the conditions
// and the Luau inside, but do not compare its arms' conditions.

import { Tree, TreeBuffer, type NodeSet, type SyntaxNode } from "@lezer/common";
import { STDLIB, STDLIB_CONSTANTS } from "../../runtime/StdLib";
import {
  AstExpr,
  AstExprBinary,
  AstExprCall,
  AstExprConstantBool,
  AstExprConstantNil,
  AstExprConstantNumber,
  AstExprConstantString,
  AstExprError,
  AstExprFunction,
  AstExprGlobal,
  AstExprGroup,
  AstExprIfElse,
  AstExprIndexExpr,
  AstExprIndexName,
  AstExprInterpString,
  AstExprLocal,
  AstExprSparkdownCallShorthand,
  AstExprSparkdownDivertTarget,
  AstExprSparkdownInterpString,
  AstExprSparkdownNew,
  AstExprSparkdownRegex,
  AstExprTable,
  AstExprTypeAssertion,
  AstExprUnary,
  AstExprVarargs,
  AstStat,
  AstStatAssign,
  AstStatBlock,
  AstStatBreak,
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
  AstStatWhile,
  AstTableAccess,
  AstType,
  AstTypePack,
  AstTypeReference,
  AstTypeTable,
  BinaryOp,
  binaryOpToString,
  TableItemKind,
  UnaryOp,
  getFunctionNameAsString,
  visitAst,
  type AstLocal,
  type AstNode,
} from "../typecheck/Ast";
import { doesCallError, getFallthrough } from "../typecheck/DataFlowGraph";
import { decodeBytes } from "../typecheck/Linter";
import type { Location, Position } from "../typecheck/Location";
import { readDocumentUnits } from "../typecheck/LuauDocumentChecker";
import { FLOW_HEADERS, NEUTRAL, RESERVED, isSparkdownExpression, SPARKDOWN_ONLY } from "../typecheck/LuauUnitNodes";
import { readLuauExpression, readLuauMethod, readLuauStatements, type LuauAstUnit } from "../typecheck/readLuauAst";
import { isExplicitRuleName } from "../utils/explicitRuleNames";
import { nodeNameSet } from "../utils/nodeNameSet";
import { collectNameFacts, isAuthoredLuauName, type LuauNameFacts, type LuauProgramNames, type NameRange, type NameRoot } from "./luauNames";
export { indexProgramNames } from "./luauNames";

/** The rules, by the name each warning carries as its diagnostic code. */
export const LUAU_LINT_CODES = [
  "LocalUnused",
  "UnreachableCode",
  "DuplicateCondition",
  "ForRange",
  "PlaceholderRead",
  "BuiltinGlobalWrite",
  "LocalShadow",
  "FunctionUnused",
  "SameLineStatement",
  "MultiLineStatement",
  "UninitializedLocal",
  "UnbalancedAssignment",
  "DuplicateFunction",
  "DuplicateLocal",
  "GlobalUsedAsLocal",
  "TableLiteral",
  "TableOperations",
  "DeprecatedApi",
  "ImplicitReturn",
  "MisleadingAndOr",
  "ComparisonPrecedence",
] as const;

export type LuauLintCode = (typeof LUAU_LINT_CODES)[number];

export interface LuauLint {
  code: LuauLintCode;
  from: number;
  to: number;
  message: string;
}

export interface LuauScriptLints {
  lints: LuauLint[];
  names: LuauNameFacts;
  roots: NameRoot[];
  /** Used locals in functions that hide no other local, which warn when the
   * program uses a global of their name (`lintGlobalShadows`). */
  globalShadows: GlobalShadowCandidate[];
  /** The offsets of global references that may not be global uses
   * (`uncertainGlobalUses`). */
  uncertainGlobalUses: ReadonlySet<number>;
  /** The names declared as locals in a unit's outermost block (`outermost`),
   * leaving out a branch's parameters, which the reading declares there. */
  outermostLocals: ReadonlySet<string>;
  /** Whether the script spells a name where the reading placed no name
   * (`unplacedMention`). */
  mentionsUnplaced: (name: string) => boolean;
  /** As `mentionsUnplaced`, but a member's name, a table's record key or a
   * table type's property (`fieldNames`), which never names a variable, is
   * not a mention. */
  mentionsUnplacedVariable: (name: string) => boolean;
  /** The outermost statements (of a unit, or read outside every unit) that
   * hold a syntax error or a block missing its `end`. Recovery can end or
   * extend such a statement where the author did not (at a construct the
   * grammar lacks, or at the end of the script) and read the code around it
   * as narrative or as its own, so FunctionUnused does not report a function
   * defined in one. */
  misreadStatements: NameRange[];
  /** The members its top level defines on a global table, which
   * `lintDuplicateGlobalMembers` compares across scripts. */
  topLevelMembers: TopLevelMemberDefinition[];
}

/** The offset of each line of a document. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
}

/** Document offsets of the positions of a unit's AST, which counts its own lines (`LuauAstUnit.lines`). */
class Offsets {
  constructor(
    private readonly starts: number[],
    private readonly lines: number[] | undefined,
  ) {}

  /** The document line of a position. */
  line(position: Position): number {
    return this.lines?.[position.line] ?? position.line;
  }

  of(position: Position): number {
    return (this.starts[this.line(position)] ?? 0) + position.column;
  }

  range(location: Location): { from: number; to: number } {
    return { from: this.of(location.begin), to: this.of(location.end) };
  }
}

// ---------------------------------------------------------------------------
// The functions a script defines

/** Whether every block in a function or statement, its own body included, was read to its end. */
function readToEnd(fn: AstNode): boolean {
  let complete = true;
  visitAst(fn, {
    visit(node) {
      if (node instanceof AstStatBlock && !node.hasEnd) complete = false;
      return complete;
    },
  });
  return complete;
}

/**
 * The outermost functions under a node with every block in them read to
 * their `end`: function definitions (`function f()`) and function values
 * (`local f = function() end`, an argument, a table field). A block missing
 * its `end` makes the reading take a later `end` as its own, so a function
 * holding one, and every function inside it, does not hold what the author
 * wrote in it. A function inside a complete one is read with it. One inside
 * a type (`typeof(function() ... end)`) is also recorded in `typeOnly`.
 */
function completeFunctions(root: AstNode, functions: AstExprFunction[]): void {
  let inType = false;
  const visitor = {
    visit(node: AstNode): boolean {
      if ((node instanceof AstType || node instanceof AstTypePack) && !inType) {
        inType = true;
        visitAst(node, visitor);
        inType = false;
        return false;
      }
      if (!(node instanceof AstExprFunction)) return true;
      if (readToEnd(node)) {
        functions.push(node);
        if (inType) typeOnly.add(node);
      }
      return false;
    },
  };
  visitAst(root, visitor);
}

/** The functions `completeFunctions` found inside a type, which only describe
 * one. Luau's linter reads them for LocalUnused alone; its other rules do not
 * walk into types. */
const typeOnly = new WeakSet<AstExprFunction>();

/** The Luau functions a unit's statements define (`completeFunctions`). */
function definedFunctions(unit: LuauAstUnit): AstExprFunction[] {
  const functions: AstExprFunction[] = [];
  for (const source of unit.statements) completeFunctions(source.statement, functions);
  return functions;
}

// The nodes that mark Luau the rules read: an `and`/`or` chain, an `if`
// expression, a function value, a method in a `define`, whose `function`
// Sparkdown leaves implicit, and an `if` or numeric `for` statement (in a
// Sparkle handler's `{ ... }` or a layout).
const LINTED_NODES = nodeNameSet(["LuauLogicalOperator", "LuauCompareOperator", "LuauTernaryExpression", "LuauFunctionDefinition", "LuauMethodDefinition", "LuauIfBlock", "LuauForLoop", "LuauSparkdownExplicitIfBlock", "LuauSparkdownExplicitLoop", "LuauAccessPath", "LuauNumericDecimal", "LuauNumericHex", "LuauNumericBinary", "LuauSparkleHandlerClosure"]);
const lintNodeTypes = new WeakMap<NodeSet, Uint8Array>();

/** Relevant nodes in Lezer's public packed representation. Avoid constructing
 * a cursor/node for every narrative word and grammar capture. Buffer offsets
 * are relative to the buffer; Tree positions are relative to their parent. */
function lintSyntaxNodes(tree: Tree, text: string): SyntaxNode[] {
  const found: { name: string; from: number; to: number }[] = [];
  const flags = (name: string) => (LINTED_NODES.has(name) || name === "LuauIfKeyword" ? 1 : 0) | (name.startsWith("Luau") && name.endsWith("Keyword") ? 2 : 0);
  const eligible = (bits: number, from: number, to: number) => {
    if (bits & 1) return true;
    if (!(bits & 2)) return false;
    const name = text.slice(from, to);
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !RESERVED.has(name);
  };
  const scan = (part: Tree | TreeBuffer, offset: number): void => {
    if (part instanceof TreeBuffer) {
      const buffer = part.buffer;
      let types = lintNodeTypes.get(part.set);
      if (!types) {
        types = Uint8Array.from(part.set.types, (type) => flags(type.name));
        lintNodeTypes.set(part.set, types);
      }
      for (let i = 0; i < buffer.length; i += 4) {
        const bits = types[buffer[i]!]!;
        if (!bits) continue;
        const from = offset + buffer[i + 1]!;
        const to = offset + buffer[i + 2]!;
        if (eligible(bits, from, to)) found.push({ name: part.set.types[buffer[i]!]!.name, from, to });
      }
    } else {
      if (eligible(flags(part.type.name), offset, offset + part.length)) found.push({ name: part.type.name, from: offset, to: offset + part.length });
      for (let i = 0; i < part.children.length; i++) scan(part.children[i]!, offset + part.positions[i]!);
    }
  };
  scan(tree, 0);
  return found.map(({ name, from, to }) => {
    let node = tree.resolveInner(from, 1);
    while (node.parent && (node.name !== name || node.from !== from || node.to !== to)) node = node.parent;
    if (node.name !== name || node.from !== from || node.to !== to) throw new Error(`Cannot resolve lint node ${name} at ${from}:${to}`);
    return node;
  });
}

/** A grammar keyword can hide an authored name from the converter. Keep its
 * occurrence as uncertainty, without fabricating an AST node or binding. */
function uncertainNames(nodes: SyntaxNode[], text: string, facts: LuauNameFacts): LuauNameFacts["uncertainNames"] {
  const key = (range: { from: number; to: number }) => `${range.from}:${range.to}`;
  const represented = new Set([...facts.declarations, ...facts.references, ...facts.globals, ...facts.functions].map(key));
  const found: LuauNameFacts["uncertainNames"] = [];
  for (const node of nodes) {
    if (!node.name.startsWith("Luau") || !node.name.endsWith("Keyword") || represented.has(key(node))) continue;
    const name = text.slice(node.from, node.to);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || RESERVED.has(name)) continue;
    found.push({ name, from: node.from, to: node.to, reason: "grammar-keyword" });
    represented.add(key(node));
  }
  return found.sort((a, b) => a.from - b.from || a.to - b.to);
}

/**
 * Whether a script spells `name` as a whole word where the reading placed no
 * name, in syntax that can name a function: Luau or Sparkle syntax the
 * reading passes over (a bare `@click=f` handler, a `define`'s value), a
 * divert's path, or a Luau string. Comments and narrative words are not,
 * unless the script holds a misread statement (`misread`): recovery there
 * can read the code after it as narrative, so every mention outside a
 * comment counts but a function statement's own name (`definitions`).
 * Absence-based rules consult it, since such a mention may be a use.
 */
function unplacedMention(tree: Tree, text: string, placed: ReadonlySet<number>, definitions: ReadonlySet<number>, misread: boolean, name: string): boolean {
  const word = new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`, "g");
  for (const match of text.matchAll(word)) {
    if (definitions.has(match.index) || (!misread && placed.has(match.index))) continue;
    const node = tree.resolveInner(match.index, 1);
    if (node.name.includes("Comment")) continue;
    if (misread || node.name.startsWith("Luau") || node.name.startsWith("Divert")) return true;
    if (node.name === "Word" && node.parent?.name.startsWith("Luau") && node.parent.name.includes("String")) return true;
  }
  return false;
}

/** Where the roots spell a field rather than a variable: a member's name
 * (`t.score`, `t:score()`), a table's record key (`{score = 1}`) and a table
 * type's property (`{score: number}`). The name facts place none of them, and
 * none can read or write the global of its spelling, except a member of the
 * globals table itself (`_G.score`, `(_G).score`, `(_G :: any).score`), which
 * is left out. */
function fieldNames(roots: NameRoot[]): Set<number> {
  const found = new Set<number>();
  for (const { root, offsets } of roots) {
    visitAst(root, {
      visit(node) {
        if (node instanceof AstExprIndexName) {
          let receiver = node.expr;
          while (receiver instanceof AstExprGroup || receiver instanceof AstExprTypeAssertion) receiver = receiver.expr;
          if (!(receiver instanceof AstExprGlobal && receiver.name === "_G")) found.add(offsets.range(node.indexLocation).from); // not a node name
        } else if (node instanceof AstExprTable) {
          for (const item of node.items) if (item.kind === TableItemKind.Record && item.key) found.add(offsets.range(item.key.location).from);
        } else if (node instanceof AstTypeTable) for (const prop of node.props) found.add(offsets.range(prop.location).from);
        return true;
      },
    });
  }
  return found;
}

// The wrappers around a binary operation's operator and operand, which the
// tree nests inside the list of its operands.
const OPERATION = /^Luau\w*Operation(_content)?$/;

// The grammar's nodes for a rule's begin and end and their captures.
const BEGIN_OR_END = /_(begin|end)(_c\d+)*$/;

/** Whether the reading of the tree passes over a node: narrative text, or one of Sparkdown's own constructs or expressions (see `readLuauAst.ts`). */
function isOpaque(node: SyntaxNode): boolean {
  if (SPARKDOWN_ONLY.has(node.name) || isSparkdownExpression(node)) return true;
  return !node.name.startsWith("Luau") && !NEUTRAL.test(node.name);
}

/** Whether a node ends a run of an expression's parts: a keyword, an operator of assignment, a separator, a bracket. */
function endsExpression(node: SyntaxNode, text: string): boolean {
  // One of Sparkdown's own expressions (a divert target, a regular
  // expression, an alternator) is one operand, which the reading takes whole.
  if (isSparkdownExpression(node)) return false;
  if (isOpaque(node) || BEGIN_OR_END.test(node.name)) return true;
  if (/Keyword$|Separator$/.test(node.name) || node.name === "LuauAssignmentOperator") return true;
  return node.name.startsWith("Punctuation") && /[,;]/.test(text.slice(node.from, node.to));
}

/**
 * The parts of the expression a node is one of, among the children of the
 * node that lists them (`a`, `and a` in `{a and a}`; an argument in a call's
 * parameters; the value after a `define` property's `=`).
 */
function expressionAround(node: SyntaxNode, text: string): SyntaxNode[] {
  // Table field names are keys, and the assignment-shaped value wrappers
  // cannot be read as a standalone expression. Read their table together.
  for (let parent = node.parent; parent && !isOpaque(parent); parent = parent.parent) {
    if (isExplicitRuleName(parent.name, "LuauTable")) {
      node = parent;
      break;
    }
  }
  let part = node;
  let list = node.parent;
  while (list && OPERATION.test(list.name) && !/^Luau(?:SparkdownExplicit)?AssignmentOperation/.test(list.name)) {
    part = list;
    list = list.parent;
  }
  if (!list) return [part];
  const children: SyntaxNode[] = [];
  for (let child = list.firstChild; child; child = child.nextSibling) children.push(child);
  const at = children.findIndex((child) => child.from === part.from && child.to === part.to && child.name === part.name);
  let first = at;
  let last = at;
  while (first > 0 && !endsExpression(children[first - 1]!, text)) first--;
  while (last < children.length - 1 && !endsExpression(children[last + 1]!, text)) last++;
  while (first < at && NEUTRAL.test(children[first]!.name)) first++;
  while (last > at && NEUTRAL.test(children[last]!.name)) last--;
  return children.slice(first, last + 1);
}

/** One reading of Luau no unit reads: an expression, or statements read as a function's body. */
interface OutsideReading {
  expr: AstExpr;
  errors: readonly { location: Location }[];
  /** Whether `expr` is the function written around statements, not one the author wrote. */
  statements: boolean;
}

/**
 * The Luau no unit reads, in Sparkdown's own text and constructs, outside
 * the units' statements or inside what their reading passes over: an
 * interpolation (`{a and b}`, `{{f(a or b)}}`, in a line, a choice or a
 * line inside a narrative `if`), a property's value or a method in a
 * `define`, a divert's arguments, the condition of a choice or an
 * alternator, a Sparkle handler. Each expression that holds a chain, a
 * comparison, an `if` expression or a function value is read on its own
 * (`readLuauExpression`, `readLuauMethod`), and each `if` or `for`
 * statement as the body of a function (`readLuauStatements`), located in
 * the document's lines; one inside another that reads it is not read again.
 */
function expressionsOutsideUnits(nodes: SyntaxNode[], text: string, units: LuauAstUnit[]): OutsideReading[] {
  const key = (node: { name: string; from: number; to: number }) => `${node.from}:${node.to}:${node.name}`;
  const statementNodes = new Set(units.flatMap((unit) => unit.statements.flatMap((source) => source.nodes.map(key))));
  /** The nearest node above `node` that a unit's reading passes over, or null when a unit's statement reads it. */
  const opaqueAbove = (node: SyntaxNode): SyntaxNode | null | undefined => {
    for (let at = node.parent; at; at = at.parent) {
      if (statementNodes.has(key(at))) return null;
      if (isOpaque(at)) return at;
    }
    return undefined;
  };
  interface Reading {
    from: number;
    to: number;
    /** Where the nearest node above it that the reading passes over begins; -1 at the top of the document. */
    context: number;
    read: () => OutsideReading;
  }
  const readings: Reading[] = [];
  for (const node of nodes) {
      if (!LINTED_NODES.has(node.name)) continue;
      if (statementNodes.has(key(node))) continue;
      const above = opaqueAbove(node);
      if (above === null) continue;
      const context = above ? above.from : -1;
      if (node.name === "LuauMethodDefinition") {
        readings.push({ from: node.from, to: node.to, context, read: () => ({ ...readLuauMethod(node, text), statements: false }) });
      } else if (node.name === "LuauSparkleHandlerClosure") {
        const content = node.getChild("LuauSparkleHandlerClosure_content");
        if (content) readings.push({ from: node.from, to: node.to, context, read: () => ({ ...readLuauStatements([content], text), statements: true }) });
      } else if (node.name === "LuauIfBlock" || node.name === "LuauForLoop" || node.name === "LuauSparkdownExplicitIfBlock" || node.name === "LuauSparkdownExplicitLoop") {
        readings.push({ from: node.from, to: node.to, context, read: () => ({ ...readLuauStatements([node], text), statements: true }) });
      } else {
        const parts = isExplicitRuleName(node.name, "LuauLogicalOperator") || isExplicitRuleName(node.name, "LuauCompareOperator") || isExplicitRuleName(node.name, "LuauAccessPath") || node.name.startsWith("LuauNumeric") ? expressionAround(node, text) : [node];
        const first = parts[0]!;
        const last = parts[parts.length - 1]!;
        readings.push({ from: first.from, to: last.to, context, read: () => ({ ...readLuauExpression(parts, text), statements: false }) });
      }
  }
  // Outermost first; a reading inside another is part of it, unless a node
  // the outer reading passes over stands between them.
  readings.sort((a, b) => a.from - b.from || b.to - a.to);
  const kept: Reading[] = [];
  for (const reading of readings) {
    const inside = kept.some((outer) => outer.from <= reading.from && reading.to <= outer.to && reading.context <= outer.from);
    if (!inside) kept.push(reading);
  }
  return kept.map((reading) => reading.read());
}

/** The offsets of the `if` that begins each of Sparkdown's narrative `if` blocks. */
function narrativeIfStarts(nodes: SyntaxNode[]): Set<number> {
  const starts = new Set<number>();
  for (const node of nodes) {
      if (node.name !== "LuauIfKeyword") continue;
      let parent = node.parent;
      while (parent?.name.startsWith("LuauSparkdownIfBlock_begin")) parent = parent.parent;
      if (parent?.name === "LuauSparkdownIfBlock") starts.add(node.from);
  }
  return starts;
}

// ---------------------------------------------------------------------------
// UnreachableCode

// Ordered so that the weakest exit among an `if`'s arms is their minimum.
const enum Exit {
  None = 0,
  Continue = 1,
  Break = 2,
  Return = 3,
  Error = 4,
}

const EXIT_REASON: Record<Exit, string> = {
  [Exit.None]: "",
  [Exit.Continue]: "continues",
  [Exit.Break]: "breaks",
  [Exit.Return]: "returns",
  [Exit.Error]: "errors",
};

/** Luau's `LintUnreachableCode`, over every function in `fn` and `fn` itself. */
function lintUnreachable(fn: AstExprFunction, offsets: Offsets, out: LuauLint[]): void {
  const travel = (stat: AstStat): Exit => {
    if (stat instanceof AstStatIf) {
      // Both arms are read for their own unreachable statements.
      const thenExit = travel(stat.thenbody);
      const elseExit = stat.elsebody ? travel(stat.elsebody) : Exit.None;
      return Math.min(thenExit, elseExit);
    }
    if (stat instanceof AstStatBlock) {
      for (let i = 0; i < stat.body.length; i++) {
        const si = stat.body[i]!;
        const step = travel(si);
        if (step === Exit.None) continue;
        // `error("...")` followed by a final `return` is a common way to
        // satisfy a caller that expects a value.
        if (step === Exit.Error && si instanceof AstStatExpr && si.expr instanceof AstExprCall && i + 1 === stat.body.length - 1 && stat.body[i + 1] instanceof AstStatReturn) {
          return step;
        }
        // Not part of Luau: what follows a syntax error's recovery is not
        // code the author wrote as a statement (`return` before a line `[4]`).
        const next = stat.body[i + 1];
        if (next && !(next instanceof AstStatError)) {
          out.push({ code: "UnreachableCode", ...offsets.range(next.location), message: `Unreachable code (previous statement always ${EXIT_REASON[step]})` });
        }
        return step;
      }
      return Exit.None;
    }
    if (stat instanceof AstStatBreak) return Exit.Break;
    if (stat instanceof AstStatContinue) return Exit.Continue;
    if (stat instanceof AstStatReturn) return Exit.Return;
    if (stat instanceof AstStatExpr) return stat.expr instanceof AstExprCall && doesCallError(stat.expr) ? Exit.Error : Exit.None;
    if (stat instanceof AstStatWhile || stat instanceof AstStatRepeat || stat instanceof AstStatFor || stat instanceof AstStatForIn) {
      travel(stat.body);
      return Exit.None;
    }
    return Exit.None;
  };
  visitAst(fn, {
    visit(node) {
      if (node instanceof AstExprFunction) travel(node.body);
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// ImplicitReturn

/** Whether a `while` guard is always true. Luau reads only `true`; a number
 * or a string is as truthy (`0` and `""` included), so Sparkdown reads them
 * too, and stays silent where such a loop cannot end. */
function alwaysTrue(expr: AstExpr): boolean {
  return (expr instanceof AstExprConstantBool && expr.value) || expr instanceof AstExprConstantNumber || expr instanceof AstExprConstantString;
}

// Luau's ImplicitReturn: a function with a `return` of values that can also
// reach its end. A return belongs to its own function, and, as Luau's linter
// does not walk into types, a function written in one is not checked. The
// caller leaves alone a function holding a syntax error, every function in it
// included: recovery can read statements the author did not write (a missing
// `then` reads the `return` after it as the `if`'s body).
function lintImplicitReturns(fn: AstExprFunction, offsets: Offsets, out: LuauLint[]): void {
  visitAst(fn, {
    visit(node) {
      if (node instanceof AstType || node instanceof AstTypePack) return false;
      if (!(node instanceof AstExprFunction)) return true;
      let valueReturn: AstStatReturn | undefined;
      visitAst(node.body, {
        visit(child) {
          if (valueReturn || child instanceof AstExpr || child instanceof AstType || child instanceof AstTypePack) return false;
          if (child instanceof AstStatReturn && child.list.length) valueReturn = child;
          return true;
        },
      });
      const end = valueReturn && getFallthrough(node.body, alwaysTrue);
      if (!valueReturn || !end) return true;
      const range = offsets.range(end.location);
      // Luau marks an ordinary final statement whole, and otherwise the
      // `end` closing a statement over several lines.
      const { begin, end: last } = end.location;
      if (!(end instanceof AstStatExpr || end instanceof AstStatAssign || end instanceof AstStatLocal) && begin.line !== last.line) {
        range.from = range.to - Math.min(3, last.column);
      }
      const name = node.debugname ? ` '${node.debugname}'` : "";
      out.push({ code: "ImplicitReturn", ...range, message: `Function${name} can implicitly return no values even though there's an explicit return at line ${offsets.line(valueReturn.location.begin) + 1}; add explicit return to silence` });
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// LocalUnused

// Parameters and loop variables only hide outer names; an unused one is not
// reported. A local function nothing reads is Luau's FunctionUnused, which
// shares this pass in Luau (`LintLocalHygiene`); a call inside its own body
// reads it. A plain write does not use a local; every other
// occurrence does, a name in a type annotation included (`local x: Foo`
// reads a local `Foo`, as a type name does a module's in Luau). The grammar
// reads some names as Sparkdown's structural words (`style`, `layout`,
// `match`) even where the author meant a name (`setStyle(style)`), where the
// reading has no name, so such a word counts as a use of the local it names
// (`keywordWords`, #984), and a use is never missed. A type name or such a
// word names the local of that name whose scope it stands in, the one
// declared last, as Luau binds a name.
function lintUnusedLocals(fn: AstExprFunction, tree: Tree, text: string, offsets: Offsets, out: LuauLint[], broken: boolean): void {
  const declared: AstLocal[] = [];
  const localFunctions: AstLocal[] = [];
  const used = new Set<AstLocal>();
  const typeNames: { name: string; at: number }[] = [];
  // Every name the function and the functions in it declare, where it can be named (document offsets).
  const bindings: { local: AstLocal; from: number; to: number }[] = [];
  const blocks: { block: AstStatBlock; from: number; to: number }[] = [];
  // A `repeat` body's locals stay in scope through its `until` condition, after the block ends.
  const repeatEnds = new Map<AstStatBlock, number>();
  const declaredStatements: { stat: AstStat; locals: AstLocal[]; from: number }[] = [];
  const bindBody = (locals: AstLocal[], body: AstStatBlock) => {
    for (const local of locals) bindings.push({ local, from: offsets.of(body.location.begin), to: offsets.of(body.location.end) });
  };
  visitAst(fn, {
    visit(node) {
      if (node instanceof AstStatBlock) blocks.push({ block: node, from: offsets.of(node.location.begin), to: offsets.of(node.location.end) });
      if (node instanceof AstStatRepeat) repeatEnds.set(node.body, offsets.of(node.location.end));
      if (node instanceof AstExprFunction) bindBody([...(node.self ? [node.self] : []), ...node.args], node.body);
      else if (node instanceof AstStatFor) bindBody([node.variable], node.body);
      else if (node instanceof AstStatForIn) bindBody(node.vars, node.body);
      // A local function's name is in scope from its body, after its signature, as Luau binds it.
      else if (node instanceof AstStatLocalFunction) {
        localFunctions.push(node.name);
        declaredStatements.push({ stat: node, locals: [node.name], from: offsets.of(node.func.body.location.begin) });
      }
      // A `const` in a function is Luau's, a local like any other
      // (`lower/utils/publishesConst.ts`).
      if (node instanceof AstStatLocal) {
        declared.push(...node.vars);
        declaredStatements.push({ stat: node, locals: node.vars, from: offsets.of(node.location.end) });
      } else if (node instanceof AstStatAssign) {
        // The targets themselves are written, not read; what they index is read.
        // A write to a name a `const` declares is read as an error wrapping the
        // constant (`Variable 'n' is constant`), and is still a plain write.
        for (const target of node.vars) if (!isLocalWrite(target)) visitAst(target, this);
        for (const value of node.values) visitAst(value, this);
        return false;
      } else if (node instanceof AstExprLocal) {
        used.add(node.local);
      }
      else if (node instanceof AstTypeReference) {
        typeNames.push({ name: node.prefix ?? node.name, at: offsets.of(node.location.begin) });
      }
      return true;
    },
  });
  // A local statement's names can be named to the end of the innermost block that holds it.
  for (const { stat, locals, from } of declaredStatements) {
    const at = offsets.of(stat.location.begin);
    let to = offsets.of(fn.location.end);
    let innermost = -1;
    for (const block of blocks) {
      if (block.from <= at && offsets.of(stat.location.end) <= block.to && block.from >= innermost) {
        innermost = block.from;
        to = repeatEnds.get(block.block) ?? block.to;
      }
    }
    for (const local of locals) bindings.push({ local, from, to });
  }
  /** The local a name at an offset names: the one of that name, in scope there, declared last. */
  const resolve = (name: string, at: number): AstLocal | undefined => {
    let found: { local: AstLocal; from: number } | undefined;
    for (const binding of bindings) {
      if (binding.local.name !== name || binding.from > at || at > binding.to) continue;
      if (!found || binding.from >= found.from) found = binding;
    }
    return found?.local;
  };
  const names = new Set([...declared, ...localFunctions].map((local) => local.name));
  for (const { name, at } of typeNames) {
    const local = names.has(name) ? resolve(name, at) : undefined;
    if (local) used.add(local);
  }
  for (const { name, at } of keywordWords(tree, text, offsets.of(fn.location.begin), offsets.of(fn.location.end), names)) {
    const local = resolve(name, at);
    if (local) used.add(local);
  }
  for (const local of declared) {
    if (!isAuthoredLuauName(local.name) || local.name.startsWith("_") || used.has(local)) continue;
    out.push({ code: "LocalUnused", ...offsets.range(local.location), message: `Variable '${local.name}' is never used; prefix with '_' to silence` });
  }
  // FunctionUnused concludes from the absence of a call, which a syntax
  // error in the function can hide (`LuauScriptLints.misreadStatements`).
  if (broken) return;
  for (const local of localFunctions) {
    if (!isAuthoredLuauName(local.name) || local.name.startsWith("_") || used.has(local)) continue;
    out.push({ code: "FunctionUnused", ...offsets.range(local.location), message: functionUnusedMessage(local.name) });
  }
}

function functionUnusedMessage(name: string): string {
  return `Function '${name}' is never used; prefix with '_' to silence`;
}

/** Whether an assignment target writes a local: the local itself, or the error the reading wraps a constant's name in. */
function isLocalWrite(target: AstExpr): boolean {
  if (target instanceof AstExprLocal) return true;
  return target instanceof AstExprError && target.expressions.length === 1 && target.expressions[0] instanceof AstExprLocal;
}

/** The words between two offsets that spell one of `names` and that the tree marks as one of Sparkdown's keywords. */
function keywordWords(tree: Tree, text: string, from: number, to: number, names: Set<string>): { name: string; at: number }[] {
  const found: { name: string; at: number }[] = [];
  if (names.size === 0) return found;
  const word = /[A-Za-z_][A-Za-z0-9_]*/g;
  for (const match of text.slice(from, to).matchAll(word)) {
    if (!names.has(match[0])) continue;
    const at = from + match.index;
    if (tree.resolveInner(at, 1).name.endsWith("Keyword")) found.push({ name: match[0], at });
  }
  return found;
}

// ---------------------------------------------------------------------------
// LocalShadow

// Luau's LocalShadow: a used local that hides an earlier local of the same
// function, or, hiding no local, a global the program uses. A local is used
// where Luau's LocalHygiene counts it: any occurrence but a plain write.
// Hiding a local of an enclosing function is not reported, nor a second
// local function of a name, nor a local declared by the same statement as the
// one it hides (DuplicateFunction's and DuplicateLocal's cases in Luau). As
// in Luau, parameters and loop variables share that "same statement" (they
// have none), so one hiding another is silent, unless the hidden one is a
// loop variable never used, which Luau's pass never records. Sparkdown also
// exempts names starting with `_`. A name the grammar reads as a Sparkdown
// keyword in the function (`keywordWords`) may stand for a local the reading
// lacks, so it silences the name there.

export interface GlobalShadowCandidate extends NameRange {
  name: string;
}

function lintLocalShadows(fn: AstExprFunction, tree: Tree, text: string, offsets: Offsets, out: LuauLint[], globals: GlobalShadowCandidate[], published: (local: AstLocal) => boolean): void {
  const declared: AstLocal[] = [];
  const statementOf = new Map<AstLocal, AstNode>();
  const localFunctions = new Set<AstLocal>();
  const parameters = new Set<AstLocal>();
  const used = new Set<AstLocal>();
  visitAst(fn, {
    visit(node) {
      if (node instanceof AstExprFunction) {
        const own = [...(node.self ? [node.self] : []), ...node.args];
        declared.push(...own);
        for (const local of own) parameters.add(local);
      } else if (node instanceof AstStatFor) declared.push(node.variable);
      else if (node instanceof AstStatForIn) declared.push(...node.vars);
      else if (node instanceof AstStatLocalFunction) {
        declared.push(node.name);
        localFunctions.add(node.name);
        statementOf.set(node.name, node);
      } else if (node instanceof AstStatLocal) {
        declared.push(...node.vars);
        for (const local of node.vars) statementOf.set(local, node);
      }
      if (node instanceof AstStatAssign) {
        for (const target of node.vars) if (!isLocalWrite(target)) visitAst(target, this);
        for (const value of node.values) visitAst(value, this);
        return false;
      }
      if (node instanceof AstExprLocal) used.add(node.local);
      return true;
    },
  });
  const names = new Set(declared.map((local) => local.name));
  const uncertain = new Set(keywordWords(tree, text, offsets.of(fn.location.begin), offsets.of(fn.location.end), names).map(({ name }) => name));
  for (const local of declared) {
    if (!used.has(local) || !isAuthoredLuauName(local.name) || local.name.startsWith("_") || uncertain.has(local.name)) continue;
    // A published const is global at runtime; its checking local hides nothing.
    let shadow = local.shadow;
    while (shadow && published(shadow)) shadow = shadow.shadow;
    if (!shadow) {
      globals.push({ name: local.name, ...offsets.range(local.location) });
      continue;
    }
    if (shadow.functionDepth !== local.functionDepth) continue;
    if (localFunctions.has(local) && localFunctions.has(shadow)) continue;
    // Luau's pass records a local it saw declared, as a parameter, or used.
    const recorded = statementOf.has(shadow) || parameters.has(shadow) || used.has(shadow);
    if (recorded && statementOf.get(local) === statementOf.get(shadow)) continue;
    out.push({ code: "LocalShadow", ...offsets.range(local.location), message: `Variable '${local.name}' shadows previous declaration at line ${offsets.line(shadow.location.begin) + 1}` });
  }
}

// Only own registry keys are built-ins; Object.prototype names are ordinary globals.
const BUILTIN_GLOBALS = new Set([...Object.keys(STDLIB), ...Object.keys(STDLIB_CONSTANTS)].map((name) => name.split(".")[0]!));

/** The parameter names of each scene and branch, with the span they can be
 * read in: from the header to the `end` that closes it, paired as
 * `readLuauUnits` pairs them (a branch inside a scene is closed first). A
 * flow without Luau statements has no unit, so the names its narrative reads
 * look global. */
function flowParameters(tree: Tree, text: string, starts: Set<number>): { from: number; to: number; names: Set<string> }[] {
  const flows: { from: number; to: number; names: Set<string> }[] = [];
  const open: { from: number; to: number; names: Set<string> }[] = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name === "LuauEndKeyword") {
      const closed = open.pop();
      if (closed) closed.to = node.to;
      continue;
    }
    if (!FLOW_HEADERS.has(node.name)) continue;
    const flow = { from: node.from, to: tree.length, names: new Set<string>() };
    tree.iterate({
      from: node.from,
      to: node.to,
      enter(inner) {
        if (!isExplicitRuleName(inner.name, "LuauFunctionParameter")) return true;
        flow.names.add(text.slice(inner.from, inner.to));
        starts.add(inner.from);
        return false;
      },
    });
    open.push(flow);
    if (flow.names.size) flows.push(flow);
  }
  return flows;
}

/**
 * The offsets of a script's global references that may not be global uses:
 * one on a line the reading reported a syntax error on, where a name can be
 * a misread piece of something else (an integer literal's `i` suffix, a
 * string's escape) or a statement the author has not finished, and, in an
 * expression
 * read outside every unit (an
 * interpolation, a handler), which is read without the locals around it, one
 * that a local of its name outside that expression could reach or that names
 * a parameter of the scene or branch it is in. A unit's own references are
 * bound as Luau binds them.
 */
function uncertainGlobalUses(names: LuauNameFacts, outside: NameRange[], flows: { from: number; to: number; names: Set<string> }[], errors: NameRange[]): Set<number> {
  const uncertain = new Set<number>();
  const declarations = new Map<string, LuauNameFacts["declarations"]>();
  for (const declaration of names.declarations) {
    let list = declarations.get(declaration.name);
    if (!list) declarations.set(declaration.name, (list = []));
    list.push(declaration);
  }
  for (const reference of names.references) {
    if (reference.local) continue;
    const { name, from } = reference;
    if (errors.some((error) => error.from <= from && from < error.to)) uncertain.add(from);
    const reading = outside.find((range) => range.from <= from && from <= range.to);
    if (!reading) continue;
    if (flows.some((flow) => flow.from <= from && from < flow.to && flow.names.has(name))) uncertain.add(from);
    // A local the same reading declares is bound in its AST already.
    else if (declarations.get(name)?.some((d) => d.from <= from && from <= (d.scopeTo ?? Infinity) && !(reading.from <= d.from && d.from <= reading.to))) uncertain.add(from);
  }
  return uncertain;
}

/** A URI as `URL` normalizes it, or as written when it does not parse. */
function normalizedUri(uri: string): string {
  try {
    return new URL(uri).href;
  } catch {
    return uri;
  }
}

/** A global reference, located for a `LocalShadow` message. */
export interface GlobalShadowReference {
  uri: string;
  from: number;
}

/**
 * The program-wide half of `LocalShadow`: each script's candidates
 * (`LuauScriptLints.globalShadows`) against the globals the current program
 * reads or writes. Luau reports the first use in its one file; the use named
 * is the first in the candidate's own script, or else the first by
 * normalized script URI and then offset. A built-in (the standard library's
 * names, or `builtins`, the globals the prelude declares), a name the reading
 * could not place somewhere in the program, or only definitions without a
 * use (a `const`) report nothing. Neither does a name a script declares as
 * a local in a unit's outermost block (`LuauScriptLints.outermostLocals`):
 * such a local can reach later scenes and including scripts, which the
 * reading does not show. A
 * script's uncertain references (`uncertainGlobalUses`) are not uses.
 */
export function lintGlobalShadows(
  program: LuauProgramNames,
  scripts: { uri: string; globalShadows: GlobalShadowCandidate[]; uncertainGlobalUses: ReadonlySet<number>; outermostLocals: ReadonlySet<string> }[],
  builtins: ReadonlySet<string>,
  message: (name: string, reference: GlobalShadowReference, own: boolean) => string,
): { uri: string; lint: LuauLint }[] {
  const found: { uri: string; lint: LuauLint }[] = [];
  const uncertain = new Map(scripts.map(({ uri, uncertainGlobalUses }) => [uri, uncertainGlobalUses]));
  const firsts = new Map<string, { own: Map<string, GlobalShadowReference>; any?: GlobalShadowReference & { key: string } }>();
  const firstOf = (name: string) => {
    let first = firsts.get(name);
    if (first) return first;
    first = { own: new Map() };
    firsts.set(name, first);
    const global = program.globals.get(name);
    if (!global || BUILTIN_GLOBALS.has(name) || builtins.has(name) || program.uncertainNames.has(name)) return first;
    if (scripts.some((script) => script.outermostLocals.has(name))) return first;
    for (const reference of [...global.reads, ...global.writes]) {
      if (uncertain.get(reference.uri)?.has(reference.from)) continue;
      const own = first.own.get(reference.uri);
      if (!own || reference.from < own.from) first.own.set(reference.uri, { uri: reference.uri, from: reference.from });
      const key = normalizedUri(reference.uri);
      if (!first.any || key < first.any.key || (key === first.any.key && reference.from < first.any.from)) first.any = { uri: reference.uri, from: reference.from, key };
    }
    return first;
  };
  for (const { uri, globalShadows } of scripts) {
    for (const candidate of globalShadows) {
      const first = firstOf(candidate.name);
      const own = first.own.get(uri);
      const reference = own ?? first.any;
      if (!reference) continue;
      found.push({ uri, lint: { code: "LocalShadow", from: candidate.from, to: candidate.to, message: message(candidate.name, reference, !!own) } });
    }
  }
  return found;
}

/**
 * The global half of Luau's FunctionUnused (`LintUnusedFunction`) over the
 * whole program: a `function f()` statement naming a global, wherever it is
 * written, when no script mentions the global anywhere else. As in Luau, any
 * other occurrence is a use, a write included, and only another function
 * statement of the name is not. A name the reading could not place
 * somewhere in the program (a grammar keyword, or a mention in syntax it
 * passes over, `LuauScriptLints.mentionsUnplaced`), a name the prelude
 * declares (`builtins`) or a name starting with `_` reports nothing.
 * Members and methods (`function T.f()`, `function T:m()`) are not globals,
 * and a definition inside a statement holding a syntax error or a block
 * missing its `end` (`LuauScriptLints.misreadStatements`), its own included,
 * silences its name. Luau reports a name once, at its last definition; each script
 * defining it reports its own last.
 */
export function lintUnusedGlobalFunctions(program: LuauProgramNames, scripts: { uri: string; mentionsUnplaced: (name: string) => boolean; misreadStatements: NameRange[] }[], builtins: ReadonlySet<string>): { uri: string; lint: LuauLint }[] {
  const misreadIn = new Map(scripts.map(({ uri, misreadStatements }) => [uri, misreadStatements]));
  const definitions = new Map<string, (LuauProgramNames["functions"][number])[]>();
  const targets = new Set<AstNode>();
  for (const definition of program.functions) {
    if (definition.local || definition.receiver || definition.method || !(definition.target instanceof AstExprGlobal || definition.target instanceof AstExprLocal)) continue;
    targets.add(definition.target);
    let list = definitions.get(definition.name);
    if (!list) definitions.set(definition.name, (list = []));
    list.push(definition);
  }
  // Every compile reruns this, so the checks that walk a function or search
  // a script's text run only for a name nothing references.
  const misread = (definition: LuauProgramNames["functions"][number]) =>
    !!misreadIn.get(definition.uri)?.some((range) => range.from <= definition.from && definition.from < range.to);
  const found: { uri: string; lint: LuauLint }[] = [];
  for (const [name, list] of definitions) {
    if (name.startsWith("_") || builtins.has(name) || program.uncertainNames.has(name)) continue;
    const global = program.globals.get(name);
    if (global && [...global.reads, ...global.writes].some((reference) => !targets.has(reference.node))) continue;
    if (list.some(misread) || scripts.some((script) => script.mentionsUnplaced(name))) continue;
    const last = new Map<string, NameRange>();
    for (const { uri, from, to } of list) {
      const previous = last.get(uri);
      if (!previous || previous.from < from) last.set(uri, { from, to });
    }
    for (const [uri, range] of last) found.push({ uri, lint: { code: "FunctionUnused", ...range, message: functionUnusedMessage(name) } });
  }
  return found;
}

// ---------------------------------------------------------------------------
// GlobalUsedAsLocal

/**
 * Luau's GlobalUsedAsLocal (`LintGlobalLocal`) over the whole program. A
 * global some plain write or `function g()` statement assigns, all of whose
 * references are inside one function, warns that it is only used in the
 * innermost such function; otherwise, one that no read can see before a
 * write (every read inside a function follows an unconditional write of the
 * same function, `LuauNameReference.dominated`) and that nothing writes
 * outside every function warns that it is never read before being written.
 * Both are reported once, at the global's first reference. Sparkdown's
 * functions are the ones an author writes: a scene's or branch's Luau, a
 * narrative line, an interpolation and a Sparkle handler are outside every
 * function, and a read there may read the story's saved state, so it is
 * read before any write, where Luau does not count a read outside every
 * function. A global a `store` or a top-level `const` declares, a built-in
 * (the standard library's names, or `builtins`, the prelude's globals and
 * type names) and `_` report nothing. Because the warning concludes that no
 * other use exists, it is also silent for a name the grammar reads as a
 * keyword somewhere in the program, one a script spells where the reading
 * placed no name, other than a field (`LuauScriptLints.mentionsUnplacedVariable`), one declared as a
 * local in a unit's outermost block in any script (such a local can reach
 * code the reading binds as global), and one with a reference that may not
 * be a global use (`uncertainGlobalUses`), inside a statement holding a
 * syntax error or a block missing its `end` (`misreadStatements`), or in a
 * type, which Luau's linter does not walk. A function without a name is
 * named by the line it begins on in its script (`line`, counted from 1).
 */
export function lintGlobalsUsedAsLocals(
  program: LuauProgramNames,
  scripts: { uri: string; uncertainGlobalUses: ReadonlySet<number>; outermostLocals: ReadonlySet<string>; mentionsUnplacedVariable: (name: string) => boolean; misreadStatements: NameRange[] }[],
  builtins: ReadonlySet<string>,
  line: (uri: string, offset: number) => number,
): { uri: string; lint: LuauLint }[] {
  const uncertain = new Map(scripts.map(({ uri, uncertainGlobalUses }) => [uri, uncertainGlobalUses]));
  const misreadIn = new Map(scripts.map(({ uri, misreadStatements }) => [uri, misreadStatements]));
  const found: { uri: string; lint: LuauLint }[] = [];
  for (const [name, global] of program.globals) {
    if (name === "_" || BUILTIN_GLOBALS.has(name) || builtins.has(name)) continue;
    if (!global.writes.some((reference) => reference.access === "write")) continue;
    if (global.definitions.some((definition) => definition.kind === "store" || definition.kind === "const")) continue;
    // A compound write is in both lists.
    const references = [...new Set([...global.reads, ...global.writes])];
    let shared: readonly AstExprFunction[] | undefined;
    for (const { enclosingFunctions } of references) {
      if (!shared) shared = enclosingFunctions;
      else {
        let prefix = 0;
        while (prefix < shared.length && prefix < enclosingFunctions.length && shared[prefix] === enclosingFunctions[prefix]) prefix++;
        if (prefix < shared.length) shared = shared.slice(0, prefix);
      }
      if (!shared.length) break;
    }
    const top = shared?.[shared.length - 1];
    if (!top) {
      const readFirst = global.reads.some((reference) => !reference.enclosingFunctions.length || !reference.dominated);
      const writtenOutside = global.writes.some((reference) => !reference.enclosingFunctions.length);
      if (readFirst || writtenOutside) continue;
    }
    if (program.uncertainNames.has(name) || scripts.some((script) => script.outermostLocals.has(name))) continue;
    if (references.some((reference) => reference.inType || uncertain.get(reference.uri)?.has(reference.from) || misreadIn.get(reference.uri)?.some((range) => range.from <= reference.from && reference.from < range.to))) continue;
    if (scripts.some((script) => script.mentionsUnplacedVariable(name))) continue;
    let first = references[0]!;
    for (const reference of references) {
      const a = normalizedUri(reference.uri);
      const b = normalizedUri(first.uri);
      if (a < b || (a === b && reference.from < first.from)) first = reference;
    }
    let text = `Global '${name}' is never read before being written. Consider changing it to local`;
    if (top?.debugname) text = `Global '${name}' is only used in the enclosing function '${top.debugname}'; consider changing it to local`;
    else if (top) {
      const at = line(first.uri, program.scripts.get(first.uri)?.functionStarts.get(top) ?? first.from);
      text = `Global '${name}' is only used in the enclosing function defined at line ${at}; consider changing it to local`;
    }
    found.push({ uri: first.uri, lint: { code: "GlobalUsedAsLocal", from: first.from, to: first.to, message: text } });
  }
  return found;
}

// ---------------------------------------------------------------------------
// DuplicateFunction

function duplicateFunctionMessage(name: string, line: number): string {
  return `Duplicate function definition: '${name}' also defined on line ${line}`;
}

/** A member definition in a script's top level on a global table
 *  (`function T.x()`, `function T:x()`), which the program-wide half of
 *  DuplicateFunction compares across scripts. */
export interface TopLevelMemberDefinition extends NameRange {
  name: string;
}

/**
 * Luau's DuplicateFunction (`LintDuplicateFunction`): a function statement or
 * local function whose name an earlier one in the same block already
 * defines, reported at its name against the first. As in Luau, only the
 * statements of one block are compared, so definitions in separate arms of
 * an `if`, or in separate functions, are not duplicates, and a member's name
 * counts its receiver (`T.x`). The top level of a script is the exception:
 * the compiler makes each plain-named function there a story function, and
 * already reports a second of the same name as a duplicate identifier, so
 * only its members are compared (`plainNamesCovered`). A block missing its
 * `end`, a function holding one, a statement holding a syntax error and code
 * inside a type are left alone, and so is a name the grammar reads as a
 * keyword somewhere in the block, which may stand for a definition the
 * reading lacks.
 */
function lintDuplicateFunctions(root: AstNode, offsets: Offsets, out: LuauLint[], errors: readonly { location: Location }[], uncertain: readonly LuauNameFacts["uncertainNames"][number][], plainNamesCovered?: AstStatBlock): void {
  const complete = (stat: AstStat) => !errors.some((error) => stat.location.overlaps(error.location));
  const visitor = {
    visit(node: AstNode): boolean {
      if (node instanceof AstType || node instanceof AstTypePack || node instanceof AstStatError || node instanceof AstExprError) return false;
      if (node instanceof AstExprFunction && !readToEnd(node)) return false;
      // Recovery does not necessarily preserve a statement's boundaries, so
      // a statement holding a syntax error is left alone with every block in it.
      if (node instanceof AstStat && !(node instanceof AstStatBlock) && !complete(node)) return false;
      if (!(node instanceof AstStatBlock)) return true;
      if (!node.hasEnd) return false;
      const block = offsets.range(node.location);
      const unsure = (name: string) => uncertain.some((occurrence) => occurrence.name === name && block.from <= occurrence.from && occurrence.to <= block.to);
      const first = new Map<string, Location>();
      for (const stat of node.body) {
        let name = "";
        let location: Location | undefined;
        if (stat instanceof AstStatFunction) {
          // Luau's `buildName`: names joined by `.`, a method's `:` included.
          name = getFunctionNameAsString(stat.name) ?? "";
          location = stat.name.location;
          if (node === plainNamesCovered && !(stat.name instanceof AstExprIndexName)) continue;
        } else if (stat instanceof AstStatLocalFunction) {
          name = stat.name.name;
          location = stat.name.location;
          if (node === plainNamesCovered) continue;
        }
        if (!name || !location || !isAuthoredLuauName(name) || !complete(stat) || unsure(name.split(".")[0]!)) continue;
        const defined = first.get(name);
        if (!defined) first.set(name, location);
        else out.push({ code: "DuplicateFunction", ...offsets.range(location), message: duplicateFunctionMessage(name, offsets.line(defined.begin) + 1) });
      }
      return true;
    },
  };
  visitAst(root, visitor);
}

/** The member definitions on a global table in a script's top level
 *  (`TopLevelMemberDefinition`), leaving out any in a statement holding a
 *  syntax error or a block missing its `end`. The receiver is global as the
 *  name facts bind it at runtime, so a story constant's table (a `const`
 *  outside every function) is one. */
function topLevelMembers(names: LuauNameFacts, prelude: AstStatBlock, misread: readonly NameRange[]): TopLevelMemberDefinition[] {
  const found: TopLevelMemberDefinition[] = [];
  for (const definition of names.functions) {
    if (definition.scope !== prelude || !(definition.target instanceof AstExprIndexName)) continue;
    let receiver: AstExpr = definition.target;
    while (receiver instanceof AstExprIndexName) receiver = receiver.expr;
    const reference = names.references.find((candidate) => candidate.node === receiver);
    if (!reference || reference.local) continue;
    if (misread.some((range) => range.from <= definition.from && definition.from < range.to)) continue;
    found.push({ name: definition.name, from: definition.from, to: definition.to });
  }
  return found;
}

/** A definition located in its script, for a program-wide `DuplicateFunction` message. */
export interface DuplicateFunctionReference {
  uri: string;
  from: number;
}

/**
 * The program-wide half of `DuplicateFunction`: the members a script's top
 * level defines on a global table (`LuauScriptLints.topLevelMembers`),
 * against the same member in another script's top level. Every script's top
 * level is one scope of the program, as a Luau file's is, so the first
 * definition, by normalized script URI and then offset, is the original,
 * and every other script's first definition of the name is reported against
 * it; a later one in the same script is reported against that script's
 * first by the script's own pass. A receiver the grammar reads as a keyword
 * somewhere in the program reports nothing. Plain names are left to the
 * compiler's duplicate-identifier error, which already spans scripts.
 */
export function lintDuplicateGlobalMembers(
  program: LuauProgramNames,
  scripts: { uri: string; topLevelMembers: readonly TopLevelMemberDefinition[] }[],
  message: (name: string, original: DuplicateFunctionReference) => string,
): { uri: string; lint: LuauLint }[] {
  const firsts = new Map<string, Map<string, TopLevelMemberDefinition>>();
  for (const { uri, topLevelMembers } of scripts) {
    for (const definition of topLevelMembers) {
      let byScript = firsts.get(definition.name);
      if (!byScript) firsts.set(definition.name, (byScript = new Map()));
      const own = byScript.get(uri);
      if (!own || definition.from < own.from) byScript.set(uri, definition);
    }
  }
  const found: { uri: string; lint: LuauLint }[] = [];
  for (const [name, byScript] of firsts) {
    if (byScript.size < 2 || program.uncertainNames.has(name.split(".")[0]!)) continue;
    const ordered = [...byScript].sort(([a, x], [b, y]) => (normalizedUri(a) < normalizedUri(b) ? -1 : normalizedUri(a) > normalizedUri(b) ? 1 : x.from - y.from));
    const [originalUri, original] = ordered[0]!;
    for (const [uri, definition] of ordered.slice(1)) {
      found.push({ uri, lint: { code: "DuplicateFunction", from: definition.from, to: definition.to, message: message(name, { uri: originalUri, from: original.from }) } });
    }
  }
  return found;
}

/** The message of a program-wide `DuplicateFunction` warning, given the original's line and, in another script, its path. */
export function duplicateGlobalMemberMessage(name: string, line: number, path: string): string {
  return `${duplicateFunctionMessage(name, line)} in '${path}'`;
}

// ---------------------------------------------------------------------------
// PlaceholderRead

// A read of `_`, whether it names a local or a global. A plain write is the
// placeholder's purpose; a compound write (`_ += 1`) also reads it.
function lintPlaceholderReads(fn: AstExprFunction, offsets: Offsets, out: LuauLint[]): void {
  const isPlaceholder = (expr: AstExpr) => (expr instanceof AstExprLocal && expr.local.name === "_") || (expr instanceof AstExprGlobal && expr.name === "_"); // not a node name
  visitAst(fn, {
    visit(node) {
      if (node instanceof AstStatAssign) {
        for (const target of node.vars) if (!isPlaceholder(target)) visitAst(target, this);
        for (const value of node.values) visitAst(value, this);
        return false;
      }
      if (node instanceof AstStatFunction) {
        if (!isPlaceholder(node.name)) visitAst(node.name, this);
        visitAst(node.func, this);
        return false;
      }
      if (node instanceof AstExpr && isPlaceholder(node)) {
        out.push({ code: "PlaceholderRead", ...offsets.range(node.location), message: "Placeholder value '_' is read here; consider using a named variable" });
      }
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// UninitializedLocal and UnbalancedAssignment

/** Whether an expression can stand for any number of values: a call or `...`, the last of a list. */
function returnsMany(expr: AstExpr | undefined): boolean {
  return expr instanceof AstExprCall || expr instanceof AstExprVarargs;
}

// Luau's UninitializedLocal: a local its `local` statement gives no value,
// which no assignment or `function` statement writes, reported at its first
// read. A compound assignment (`x += 1`) reads it. As in Luau, a name in a
// type (`typeof(x)`) is not a read, and a function inside a type is not
// checked (`typeOnly`). A function holding a syntax error, whose reading can
// lose a write, is left alone, and so is a name the grammar reads as a
// Sparkdown keyword in the function (`keywordWords`), which may be a write
// the reading lacks.
function lintUninitializedLocals(fn: AstExprFunction, tree: Tree, text: string, offsets: Offsets, out: LuauLint[], broken: boolean): void {
  if (broken) return;
  const locals = new Map<AstLocal, { defined: boolean; initialized: boolean; assigned: boolean; firstUse?: AstExprLocal }>();
  const local = (key: AstLocal) => {
    let found = locals.get(key);
    if (!found) locals.set(key, (found = { defined: false, initialized: false, assigned: false }));
    return found;
  };
  const visitor = {
    visit(node: AstNode): boolean {
      if (node instanceof AstType || node instanceof AstTypePack) return false;
      if (node instanceof AstStatLocal) {
        const many = returnsMany(node.values[node.values.length - 1]);
        node.vars.forEach((key, i) => {
          const found = local(key);
          found.defined = true;
          found.initialized = many || i < node.values.length;
        });
        return true;
      }
      if (node instanceof AstStatAssign) {
        for (const target of node.vars) assign(target);
        for (const value of node.values) visitAst(value, visitor);
        return false;
      }
      if (node instanceof AstStatFunction) {
        assign(node.name);
        visitAst(node.func, visitor);
        return false;
      }
      if (node instanceof AstExprLocal) {
        local(node.local).firstUse ??= node;
        return false;
      }
      return true;
    },
  };
  // A write to a name a `const` declares is read as an error wrapping it (`isLocalWrite`).
  const assign = (target: AstExpr) => {
    if (!isLocalWrite(target)) return visitAst(target, visitor);
    const written = target instanceof AstExprError ? target.expressions[0] : target;
    if (written instanceof AstExprLocal) local(written.local).assigned = true;
  };
  visitAst(fn, visitor);
  const found = [...locals].filter(([key, l]) => l.defined && !l.initialized && !l.assigned && l.firstUse && isAuthoredLuauName(key.name));
  if (!found.length) return;
  const uncertain = new Set(keywordWords(tree, text, offsets.of(fn.location.begin), offsets.of(fn.location.end), new Set(found.map(([key]) => key.name))).map(({ name }) => name));
  for (const [key, { firstUse }] of found) {
    if (uncertain.has(key.name)) continue;
    out.push({ code: "UninitializedLocal", ...offsets.range(firstUse!.location), message: `Variable '${key.name}' defined at line ${offsets.line(key.location.begin) + 1} is never initialized or assigned; initialize with 'nil' to silence` });
  }
}

// Luau's UnbalancedAssignment: a `local` statement or an assignment whose
// values are more than its names, or fewer when the last value is not a call,
// `...` or `nil`. As in Luau, a statement inside a type
// (`typeof(function() ... end)`) is not checked. Recovery can end a list
// where the author did not (`local k = 1, m = 2`) or read a line as an
// assignment the author did not write as one (a loop's range after its
// header), so a statement on a line holding a syntax error, or inside an
// outermost statement holding one (`LuauScriptLints.misreadStatements`), is
// left alone (`unsure`). So is a `store`, which the units read as an
// assignment (`readSparkdownStatements`) but is not Luau's.
function lintUnbalancedAssignments(root: AstNode, text: string, offsets: Offsets, out: LuauLint[], unsure: (range: NameRange) => boolean): void {
  visitAst(root, {
    visit(node) {
      if (node instanceof AstType || node instanceof AstTypePack) return false;
      if (!(node instanceof AstStatLocal || node instanceof AstStatAssign)) return true;
      const vars = node.vars.length;
      const values = node.values.length;
      if (vars === values || values === 0) return true;
      const range = offsets.range(node.location);
      if (unsure(range) || /^store\b/.test(text.slice(range.from, range.from + 6))) return true;
      const last = node.values[values - 1];
      let message: string | undefined;
      if (vars < values) message = `Assigning ${values} values to ${vars} variables leaves some values unused`;
      else if (!returnsMany(last) && !(last instanceof AstExprConstantNil)) {
        message = `Assigning ${values} values to ${vars} variables initializes extra variables with nil; add 'nil' to value list to silence`;
      }
      if (message) out.push({ code: "UnbalancedAssignment", ...range, message });
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// DuplicateLocal

// Luau's DuplicateLocal: a name that one `local` statement or one function's
// parameter list declares again, at the later declaration, against the
// earlier one's column on its line or its line otherwise. An explicit `self`
// parameter of a method repeats its implicit one. `_` is exempt, as in Luau.
// As in Luau, a function written in a type is not read. A scene's or
// branch's parameters (`flowParameter`), which the reading declares in its
// flow's checking wrapper or as a `local`, are Sparkdown's and not checked,
// nor is a published `const`, which is a global. The rule concludes from two
// names the reading holds, so a name it lacks (a Sparkdown keyword's
// reading) can hide a warning but never make one. A syntax error in the
// list, from the start of the statement or function to its first value or
// its body, or to the end of its line for a `local` without values, leaves
// the list alone, since recovery there can read a list the author did not
// write, and so does a parameter list missing its `)`, whose error recovery
// places at the body; an error in a value (`...` outside a vararg function)
// or the body does not change the names.
function lintDuplicateLocals(root: AstNode, offsets: Offsets, out: LuauLint[], errors: readonly { location: Location }[], published: (local: AstLocal) => boolean, flowParameter: (offsets: Offsets, local: AstLocal) => boolean): void {
  const check = (owner: AstNode, inList: (location: Location) => boolean, declared: readonly AstLocal[], checked: readonly AstLocal[], kind: string, self?: AstLocal) => {
    const own = new Set(declared);
    for (const local of checked) {
      const shadow = local.shadow;
      if (!shadow || !own.has(shadow) || local.name === "_" || !isAuthoredLuauName(local.name) || published(local) || flowParameter(offsets, local)) continue; // not a node name
      if (errors.some(({ location }) => location.end.ge(owner.location.begin) && inList(location))) return;
      const line = offsets.line(shadow.location.begin);
      const message =
        shadow === self ? "Function parameter 'self' already defined implicitly"
        : line === offsets.line(local.location.begin) ? `${kind} '${local.name}' already defined on column ${shadow.location.begin.column + 1}`
        : `${kind} '${local.name}' already defined on line ${line + 1}`;
      out.push({ code: "DuplicateLocal", ...offsets.range(local.location), message });
    }
  };
  visitAst(root, {
    visit(node) {
      if (node instanceof AstType || node instanceof AstTypePack) return false;
      if (node instanceof AstStatLocal) {
        // An error that starts where the first value does is the value's.
        // Without values, recovery may have ended the list at its last name
        // (`local x, x, y.`), so an error on that line is the list's.
        const first = node.values[0]?.location.begin;
        check(node, (location) => (first ? location.begin.lt(first) : location.begin.line <= node.location.end.line), node.vars, node.vars, "Variable");
      } else if (node instanceof AstExprFunction && node.argLocation) {
        check(node, (location) => location.begin.lt(node.body.location.begin), [...(node.self ? [node.self] : []), ...node.args], node.args, "Function parameter", node.self);
      }
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// DuplicateCondition

/** Luau's `similar`: whether two expressions are the same expression. */
function similar(a: AstExpr, b: AstExpr): boolean {
  if (a.kind !== b.kind) return false;
  if (a instanceof AstExprGroup && b instanceof AstExprGroup) return similar(a.expr, b.expr);
  if (a instanceof AstExprConstantNil) return true;
  if (a instanceof AstExprConstantBool && b instanceof AstExprConstantBool) return a.value === b.value;
  if (a instanceof AstExprConstantNumber && b instanceof AstExprConstantNumber) return a.value === b.value;
  if (a instanceof AstExprConstantString && b instanceof AstExprConstantString) return a.value === b.value;
  if (a instanceof AstExprLocal && b instanceof AstExprLocal) return a.local === b.local;
  if (a instanceof AstExprGlobal && b instanceof AstExprGlobal) return a.name === b.name;
  if (a instanceof AstExprVarargs) return true;
  if (a instanceof AstExprCall && b instanceof AstExprCall) {
    if (a.args.length !== b.args.length || a.self !== b.self || !similar(a.func, b.func)) return false;
    return a.args.every((arg, i) => similar(arg, b.args[i]!));
  }
  if (a instanceof AstExprIndexName && b instanceof AstExprIndexName) return a.index === b.index && similar(a.expr, b.expr);
  if (a instanceof AstExprIndexExpr && b instanceof AstExprIndexExpr) return similar(a.expr, b.expr) && similar(a.index, b.index);
  if (a instanceof AstExprTable && b instanceof AstExprTable) {
    if (a.items.length !== b.items.length) return false;
    return a.items.every((item, i) => {
      const other = b.items[i]!;
      if (item.kind !== other.kind) return false;
      if (!item.key !== !other.key) return false;
      if (item.key && other.key && !similar(item.key, other.key)) return false;
      return similar(item.value, other.value);
    });
  }
  if (a instanceof AstExprUnary && b instanceof AstExprUnary) return a.op === b.op && similar(a.expr, b.expr);
  if (a instanceof AstExprBinary && b instanceof AstExprBinary) return a.op === b.op && similar(a.left, b.left) && similar(a.right, b.right);
  if (a instanceof AstExprTypeAssertion && b instanceof AstExprTypeAssertion) return similar(a.expr, b.expr);
  if (a instanceof AstExprIfElse && b instanceof AstExprIfElse) {
    return similar(a.condition, b.condition) && similar(a.trueExpr, b.trueExpr) && similar(a.falseExpr, b.falseExpr);
  }
  if (a instanceof AstExprInterpString && b instanceof AstExprInterpString) {
    if (a.strings.length !== b.strings.length || a.expressions.length !== b.expressions.length) return false;
    return a.strings.every((s, i) => s === b.strings[i]) && a.expressions.every((e, i) => similar(e, b.expressions[i]!));
  }
  // Not part of Luau: Sparkdown's own expressions, compared as Luau compares
  // the expressions they stand for (a double-quoted string that
  // interpolates, a call shorthand, a divert target, a regular expression,
  // a `new`). An alternator is never the same expression as another.
  if (a instanceof AstExprSparkdownInterpString && b instanceof AstExprSparkdownInterpString) {
    if (a.strings.length !== b.strings.length || a.expressions.length !== b.expressions.length) return false;
    return a.strings.every((s, i) => s === b.strings[i]) && a.expressions.every((e, i) => similar(e, b.expressions[i]!));
  }
  if (a instanceof AstExprSparkdownCallShorthand && b instanceof AstExprSparkdownCallShorthand) return similar(a.expr, b.expr);
  if (a instanceof AstExprSparkdownDivertTarget && b instanceof AstExprSparkdownDivertTarget) return a.path === b.path;
  if (a instanceof AstExprSparkdownRegex && b instanceof AstExprSparkdownRegex) return a.pattern === b.pattern && a.flags === b.flags;
  if (a instanceof AstExprSparkdownNew && b instanceof AstExprSparkdownNew) {
    if (a.className !== b.className || a.hasArgs !== b.hasArgs || a.args.length !== b.args.length) return false;
    return a.args.every((arg, i) => similar(arg, b.args[i]!));
  }
  return false;
}

/**
 * Luau's `LintDuplicateCondition`, over a node and everything under it. The
 * arms of an `if` for which `narrative` holds (Sparkdown's narrative `if`
 * block) are not compared; their conditions and bodies are read.
 */
function lintDuplicateConditions(root: AstNode, offsets: Offsets, out: LuauLint[], narrative: (stat: AstStatIf) => boolean = () => false): void {
  // Luau limits the distance at which it compares conditions.
  const MAX_DISTANCE = 5;
  const detect = (conditions: AstExpr[]) => {
    for (let i = 0; i < conditions.length; i++) {
      for (let j = Math.max(i, MAX_DISTANCE) - MAX_DISTANCE; j < i; j++) {
        if (!similar(conditions[j]!, conditions[i]!)) continue;
        const here = conditions[i]!.location;
        const there = conditions[j]!.location.begin;
        out.push({
          code: "DuplicateCondition",
          ...offsets.range(here),
          message:
            here.begin.line === there.line
              ? `Condition has already been checked on column ${there.column + 1}`
              : `Condition has already been checked on line ${offsets.line(there) + 1}`,
        });
        break;
      }
    }
  };
  const chain = (expr: AstExpr, op: BinaryOp, conditions: AstExpr[]) => {
    if (expr instanceof AstExprBinary && expr.op === op) {
      chain(expr.left, op, conditions);
      chain(expr.right, op, conditions);
    } else if (expr instanceof AstExprGroup) chain(expr.expr, op, conditions);
    else conditions.push(expr);
  };
  const visitor = {
    visit(node: AstNode): boolean {
      if (node instanceof AstStatIf) {
        if (!(node.elsebody instanceof AstStatIf)) return true;
        // An if..elseif chain is read once, from its head.
        const conditions: AstExpr[] = [];
        for (let head: AstStatIf | undefined = node; head; ) {
          visitAst(head.condition, visitor);
          visitAst(head.thenbody, visitor);
          conditions.push(head.condition);
          if (head.elsebody instanceof AstStatIf) {
            head = head.elsebody;
            continue;
          }
          if (head.elsebody) visitAst(head.elsebody, visitor);
          head = undefined;
        }
        if (!narrative(node)) detect(conditions);
        return false;
      }
      if (node instanceof AstExprIfElse) {
        if (!(node.falseExpr instanceof AstExprIfElse)) return true;
        const conditions: AstExpr[] = [];
        for (let head: AstExprIfElse | undefined = node; head; ) {
          visitAst(head.condition, visitor);
          visitAst(head.trueExpr, visitor);
          conditions.push(head.condition);
          if (head.falseExpr instanceof AstExprIfElse) {
            head = head.falseExpr;
            continue;
          }
          visitAst(head.falseExpr, visitor);
          head = undefined;
        }
        detect(conditions);
        return false;
      }
      if (node instanceof AstExprBinary) {
        if (node.op !== BinaryOp.And && node.op !== BinaryOp.Or) return true;
        // `a and b or c` is the idiomatic conditional expression; `a` and
        // `b` are not alternatives of each other there.
        if (node.op === BinaryOp.Or) {
          const la = node.left instanceof AstExprBinary ? node.left : undefined;
          if (la && la.op === BinaryOp.And) {
            const lb = la.left instanceof AstExprBinary ? la.left : undefined;
            const rb = la.right instanceof AstExprBinary ? la.right : undefined;
            if (!(lb && lb.op === BinaryOp.And) && !(rb && rb.op === BinaryOp.And)) {
              visitAst(la.left, visitor);
              visitAst(la.right, visitor);
              visitAst(node.right, visitor);
              return false;
            }
          }
        }
        // As in Luau, a chain's conditions are not read for chains of their own.
        const conditions: AstExpr[] = [];
        chain(node, node.op, conditions);
        detect(conditions);
        return false;
      }
      return true;
    },
  };
  visitAst(root, visitor);
}

// ---------------------------------------------------------------------------
// ForRange

// C's `%g`, which Luau's message uses.
function formatNumber(value: number) {
  return String(Number(value.toPrecision(6)));
}

/** A literal number; one in parentheses is not, so `(0)` silences the rule, as in Luau. */
function constantOf(expr: AstExpr): AstExprConstantNumber | undefined {
  return expr instanceof AstExprConstantNumber ? expr : undefined;
}

const BACKWARDS = "For loop should iterate backwards; did you forget to specify -1 as step?";

/** Luau's `LintForRange`, over a node and everything under it. */
function lintForRanges(root: AstNode, offsets: Offsets, out: LuauLint[]): void {
  visitAst(root, {
    visit(node) {
      // An explicit step means the author chose the direction.
      if (!(node instanceof AstStatFor) || node.step) return true;
      const fc = constantOf(node.from);
      const tc = constantOf(node.to);
      const fu = node.from instanceof AstExprUnary && node.from.op === UnaryOp.Len;
      const tu = node.to instanceof AstExprUnary && node.to.op === UnaryOp.Len;
      let message: string | undefined;
      if (fu && tc && tc.value === 1) message = BACKWARDS;
      else if (fc && tc && fc.value > tc.value) message = BACKWARDS;
      else if (fc && tc && fc.value + Math.floor(tc.value - fc.value) !== tc.value) {
        message = `For loop ends at ${formatNumber(fc.value + Math.floor(tc.value - fc.value))} instead of ${formatNumber(tc.value)}; did you forget to specify step?`;
      } else if (fc && tu && fc.value === 0) message = "For loop starts at 0, but arrays start at 1";
      else if (fu && tc && tc.value === 0) message = `${BACKWARDS} Also consider changing 0 to 1 since arrays start at 1`;
      if (message) out.push({ code: "ForRange", from: offsets.of(node.from.location.begin), to: offsets.of(node.to.location.end), message });
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// MisleadingAndOr and ComparisonPrecedence

const isComparison = (op: BinaryOp) =>
  op === BinaryOp.CompareEq || op === BinaryOp.CompareNe || op === BinaryOp.CompareLt || op === BinaryOp.CompareLe || op === BinaryOp.CompareGt || op === BinaryOp.CompareGe;
const isEquality = (op: BinaryOp) => op === BinaryOp.CompareEq || op === BinaryOp.CompareNe;
const isNot = (expr: AstExpr) => expr instanceof AstExprUnary && expr.op === UnaryOp.Not;

// Luau's MisleadingAndOr, `a and false or b` and `a and nil or b`, and its
// ComparisonPrecedence, `not a == b` and a chain of comparisons
// (`a < b < c`), each at the whole expression. Parentheses are an
// `AstExprGroup`, so `(a and false) or b`, `(not a) == b` and `(a < b) < c`
// are silent, as in Luau; so is `not a == not b`, a boolean comparison. As in
// Luau, neither walks into types. An expression holding a syntax error is
// left alone, since recovery can read operands the author did not write.
function lintExpressionPrecedence(root: AstNode, offsets: Offsets, out: LuauLint[], errors: readonly { location: Location }[]): void {
  visitAst(root, {
    visit(node) {
      if (node instanceof AstType || node instanceof AstTypePack) return false;
      if (!(node instanceof AstExprBinary) || errors.some((error) => node.location.overlaps(error.location))) return true;
      if (node.op === BinaryOp.Or && node.left instanceof AstExprBinary && node.left.op === BinaryOp.And) {
        const alternative = node.left.right;
        const alt = alternative instanceof AstExprConstantNil ? "nil" : alternative instanceof AstExprConstantBool && !alternative.value ? "false" : undefined;
        if (alt) {
          out.push({ code: "MisleadingAndOr", ...offsets.range(node.location), message: `The and-or expression always evaluates to the second alternative because the first alternative is ${alt}; consider using if-then-else expression instead` });
        }
      }
      if (!isComparison(node.op)) return true;
      const op = binaryOpToString(node.op);
      if (isNot(node.left) && !isNot(node.right)) {
        out.push({
          code: "ComparisonPrecedence",
          ...offsets.range(node.location),
          message: isEquality(node.op)
            ? `not X ${op} Y is equivalent to (not X) ${op} Y; consider using X ${node.op === BinaryOp.CompareEq ? "~=" : "=="} Y, or add parentheses to silence`
            : `not X ${op} Y is equivalent to (not X) ${op} Y; add parentheses to silence`,
        });
      } else if (node.left instanceof AstExprBinary && isComparison(node.left.op)) {
        const left = binaryOpToString(node.left.op);
        out.push({
          code: "ComparisonPrecedence",
          ...offsets.range(node.location),
          message: isEquality(node.left.op) || isEquality(node.op)
            ? `X ${left} Y ${op} Z is equivalent to (X ${left} Y) ${op} Z; add parentheses to silence`
            : `X ${left} Y ${op} Z is equivalent to (X ${left} Y) ${op} Z; did you mean X ${left} Y and Y ${op} Z?`,
        });
      }
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// TableLiteral

// Luau's TableLiteral: a table constructor's string field or integer index
// that an earlier item of the same constructor already has, or that a list
// entry already fills (`{1, 2, [1] = 3}`), and a table type's property that
// an earlier one already has. As in Luau's new solver, which sparkdown's
// type checker follows, a table type's `read` and `write` properties of one
// name are not duplicates of each other. Unlike Luau's other rules, this one
// walks into types, `typeof(...)` included, as Luau's does. A key in
// parentheses (`[(1)]`) is not a literal key, nor a fractional, negative or
// larger than 32-bit one. A table or table type holding a syntax error is
// left alone, since recovery can read items the author did not write. A
// string key is held as one character per UTF-8 byte (`readLuauAst.ts`), so
// it is compared as read and decoded for the message; a name is ASCII.
function lintTableLiterals(root: AstNode, offsets: Offsets, out: LuauLint[], errors: readonly { location: Location }[]): void {
  const line = (location: Location) => offsets.line(location.begin) + 1;
  visitAst(root, {
    visit(node) {
      if ((node instanceof AstExprTable || node instanceof AstTypeTable) && errors.some((error) => node.location.overlaps(error.location))) return true;
      if (node instanceof AstExprTable) {
        const count = node.items.filter((item) => item.kind === TableItemKind.List).length;
        const names = new Map<string, number>();
        const indices = new Map<number, number>();
        for (const { key } of node.items) {
          if (key instanceof AstExprConstantString) {
            const previous = names.get(key.value);
            if (previous) out.push({ code: "TableLiteral", ...offsets.range(key.location), message: `Table field '${decodeBytes(key.value)}' is a duplicate; previously defined at line ${previous}` });
            else names.set(key.value, line(key.location));
          } else if (key instanceof AstExprConstantNumber && Number.isInteger(key.value)) {
            if (key.value >= 1 && key.value <= count) {
              out.push({ code: "TableLiteral", ...offsets.range(key.location), message: `Table index ${key.value} is a duplicate; previously defined as a list entry` });
            } else if (key.value >= 0 && key.value <= 2147483647) {
              const previous = indices.get(key.value);
              if (previous) out.push({ code: "TableLiteral", ...offsets.range(key.location), message: `Table index ${key.value} is a duplicate; previously defined at line ${previous}` });
              else indices.set(key.value, line(key.location));
            }
          }
        }
      } else if (node instanceof AstTypeTable) {
        const names = new Map<string, { access: AstTableAccess; location: Location }>();
        for (const prop of node.props) {
          const previous = names.get(prop.name);
          if (!previous) {
            names.set(prop.name, { access: prop.access, location: prop.location });
            continue;
          }
          if (!(previous.access & prop.access)) {
            previous.access |= prop.access;
            continue;
          }
          const at = line(previous.location);
          if (previous.access === prop.access) out.push({ code: "TableLiteral", ...offsets.range(prop.location), message: `Table type field '${decodeBytes(prop.name)}' is a duplicate; previously defined at line ${at}` });
          else if (previous.access === AstTableAccess.ReadWrite) out.push({ code: "TableLiteral", ...offsets.range(prop.location), message: `Table type field '${decodeBytes(prop.name)}' is already read-write; previously defined at line ${at}` });
          // Luau reports these two at the earlier property.
          else out.push({ code: "TableLiteral", ...offsets.range(previous.location), message: `Table type field '${decodeBytes(prop.name)}' already has a ${previous.access === AstTableAccess.Read ? "read" : "write"} type defined at line ${at}` });
        }
      }
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// TableOperations and DeprecatedApi for getfenv/setfenv

/** The standard library functions, called through their global library
 * (`string.find`), whose Luau type returns more than one value before any
 * variadic tail, Luau's `getReturnCount` above 1. A bare global
 * (`pairs`, `next`) is left out: a function statement of that name can
 * replace it, and the warning needs its type. */
const MULTIPLE_RESULTS = new Set(["string.find", "string.gsub", "math.frexp", "math.modf", "utf8.len", "utf8.codes", "coroutine.close"]);

/** A literal number, as Luau's `isConstant` reads one; `(0)` is not. */
function isConstant(expr: AstExpr | undefined, value: number): boolean {
  return expr instanceof AstExprConstantNumber && expr.value === value;
}

/** Luau's `isLength`: `#t` of the same expression as `table`. */
function isLength(expr: AstExpr, table: AstExpr): boolean {
  return expr instanceof AstExprUnary && expr.op === UnaryOp.Len && similar(expr.expr, table);
}

// Luau's TableOperations, the half that reads only syntax: `table.insert`,
// `table.remove`, `table.move` and `table.create` called on the global
// `table` with arguments that are likely a bug. Its `table.insert(t, f())`
// check needs `f`'s type, so it is read only for a standard library function
// that returns more than one value (`MULTIPLE_RESULTS`), and is silent for
// any other call. Its other half, `#` or `ipairs` on a table without an
// array part (TableOperationsIndexer), needs the type checker.
//
// And Luau's DeprecatedApi for `getfenv` and `setfenv`: a call of the global
// with a literal number as its first argument. Luau also reports one whose
// first argument the type checker types as a number. Like the other
// deprecations sparkdown reports, the compiler reports it as Information
// tagged Deprecated (`SparkdownCompiler.validateLints`).
//
// As Luau's linter does, both leave code written in a type alone. A call
// holding a syntax error is left alone, since recovery can read arguments
// the author did not write.
function lintStdlibCalls(root: AstNode, offsets: Offsets, out: LuauLint[], errors: readonly { location: Location }[]): void {
  const report = (code: LuauLintCode, expr: AstExpr, message: string) => out.push({ code, ...offsets.range(expr.location), message });
  const zero = (name: string, expr: AstExpr) => report("TableOperations", expr, `table.${name} uses index 0 but arrays are 1-based; did you mean 1 instead?`);
  visitAst(root, {
    visit(node) {
      if (node instanceof AstType || node instanceof AstTypePack) return false;
      if (!(node instanceof AstExprCall) || node.self || errors.some((error) => node.location.overlaps(error.location))) return true;
      const { func, args } = node;
      if (func instanceof AstExprGlobal && (func.name === "getfenv" || func.name === "setfenv") && args[0] instanceof AstExprConstantNumber) { // not a node name
        report("DeprecatedApi", node, `Function '${func.name}' is deprecated${func.name === "getfenv" ? "; consider using 'debug.info' instead" : ""}`); // not a node name
      }
      if (!(func instanceof AstExprIndexName && func.expr instanceof AstExprGlobal && func.expr.name === "table")) return true; // not a node name
      if (func.index === "insert" && args.length === 2) {
        const tail = args[1];
        if (tail instanceof AstExprCall && !tail.self && tail.func instanceof AstExprIndexName && tail.func.expr instanceof AstExprGlobal && MULTIPLE_RESULTS.has(`${tail.func.expr.name}.${tail.func.index}`)) {
          report("TableOperations", tail, "table.insert may change behavior if the call returns more than one result; consider adding parentheses around second argument");
        }
      }
      if (func.index === "insert" && args.length >= 3) {
        const position = args[1]!;
        if (isConstant(position, 0)) zero("insert", position);
        if (isLength(position, args[0]!)) {
          report("TableOperations", position, "table.insert will insert the value before the last element, which is likely a bug; consider removing the second argument or wrap it in parentheses to silence");
        }
        if (position instanceof AstExprBinary && position.op === BinaryOp.Add && isLength(position.left, args[0]!) && isConstant(position.right, 1)) {
          report("TableOperations", position, "table.insert will append the value to the table; consider removing the second argument for efficiency");
        }
      }
      if (func.index === "remove" && args.length >= 2) {
        const position = args[1]!;
        if (isConstant(position, 0)) zero("remove", position);
        if (position instanceof AstExprBinary && position.op === BinaryOp.Sub && isLength(position.left, args[0]!) && isConstant(position.right, 1)) {
          report("TableOperations", position, "table.remove will remove the value before the last element, which is likely a bug; consider removing the second argument or wrap it in parentheses to silence");
        }
      }
      if (func.index === "move" && args.length >= 4) {
        if (isConstant(args[1], 0)) zero("move", args[1]!);
        else if (isConstant(args[3], 0)) zero("move", args[3]!);
      }
      if (func.index === "create" && args.length === 2) {
        const value = args[1]!;
        const literal = value instanceof AstExprTypeAssertion ? value.expr : value;
        if (literal instanceof AstExprTable) report("TableOperations", literal, "table.create with a table literal will reuse the same object for all elements; consider using a for loop instead");
      }
      return true;
    },
  });
}

// ---------------------------------------------------------------------------


/** Luau's BuiltinGlobalWrite over the whole program: a write or global
 * function definition that replaces a standard library name. A local in a
 * unit's outermost block (a script's top-level local, which later scenes,
 * callbacks and including scripts can see) or an uncertain occurrence of the
 * name anywhere in the program silences the name, since the converter AST
 * cannot show which writes such a binding reaches. Only a write earlier in
 * the local's own block is known to be out of its reach. An explicit
 * `store` or published `const` still warns. */
export function lintBuiltinGlobalWrites(program: LuauProgramNames): { uri: string; lint: LuauLint }[] {
  const found: { uri: string; lint: LuauLint }[] = [];
  for (const [name, global] of program.globals) {
    if (!BUILTIN_GLOBALS.has(name) || program.uncertainNames.has(name)) continue;
    const locals: { uri: string; from: number; scope?: AstStatBlock }[] = [];
    for (const [uri, names] of program.scripts) {
      for (const d of names.declarations) if (d.name === name && d.outermost) locals.push({ uri, from: d.from, scope: d.scope });
    }
    for (const { uri, from, to, kind, scope } of global.definitions) {
      // `store` and published `const` declare the global itself, whatever local is visible.
      const hidden = locals.some((local) => !(local.uri === uri && local.scope === scope && to <= local.from));
      if (hidden && kind !== "store" && kind !== "const") continue;
      found.push({ uri, lint: { code: "BuiltinGlobalWrite", from, to, message: `Built-in global '${name}' is overwritten here; consider using a local or changing the name` } });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------

/** Luau's statement-layout rules, using the boundaries of the existing AST. */
function lintStatementLayout(root: AstNode, offsets: Offsets, out: LuauLint[], errors: readonly { location: Location }[], sameLines: Set<number>): void {
  const stack: { start: Position; lastLine: number; flagged: boolean }[] = [];
  // Recovery does not necessarily preserve a statement's boundaries. Leave
  // a statement containing a syntax error alone, including its nested blocks.
  const complete = (stat: AstStat) => !errors.some((error) => stat.location.overlaps(error.location));
  // This walk is separate because SameLineStatement also checks functions
  // inside tables, whose contents MultiLineStatement deliberately skips.
  visitAst(root, {
    visit(node) {
      if (node instanceof AstStatError || node instanceof AstExprError) return false;
      if (node instanceof AstExprFunction && !readToEnd(node)) return false;
      if (node instanceof AstStat && !(node instanceof AstStatBlock) && !complete(node)) return false;
      if (!(node instanceof AstStatBlock)) return true;
      if (!node.hasEnd) return false;
      for (let i = 1; i < node.body.length; i++) {
        const stat = node.body[i]!;
        const previous = node.body[i - 1]!;
        const line = offsets.line(stat.location.begin);
        if (!complete(stat) || !complete(previous) || previous instanceof AstStatError || stat instanceof AstStatError) continue;
        if (offsets.line(previous.location.end) !== line || sameLines.has(line)) continue;
        if (previous.hasSemicolon || (previous instanceof AstStatLocal && stat instanceof AstStatBlock)) continue;
        out.push({ code: "SameLineStatement", ...offsets.range(stat.location), message: "A new statement is on the same line; add semi-colon on previous statement to silence" });
        sameLines.add(line);
      }
      return true;
    },
  });
  const visitor = {
    visit(node: AstNode): boolean {
      if (node instanceof AstStatError || node instanceof AstExprError) return false;
      if (node instanceof AstExprFunction && !readToEnd(node)) return false;
      if (node instanceof AstStatBlock) {
        if (!node.hasEnd) return false;
        for (const stat of node.body) {
          if (!complete(stat)) continue;
          const line = offsets.line(stat.location.begin);
          stack.push({ start: stat.location.begin, lastLine: line, flagged: false });
          visitAst(stat, visitor);
          stack.pop();
        }
        return false;
      }
      // Luau deliberately ignores the contents of tables and the `until`
      // condition: neither is a continuation of the enclosing statement.
      if (node instanceof AstExprTable) return false;
      if (node instanceof AstStatRepeat) {
        visitAst(node.body, visitor);
        return false;
      }
      const statement = stack[stack.length - 1];
      if (node instanceof AstExpr && statement && !statement.flagged) {
        const line = offsets.line(node.location.begin);
        if (line > statement.lastLine) {
          statement.lastLine = line;
          if (node.location.begin.column <= statement.start.column) {
            out.push({ code: "MultiLineStatement", ...offsets.range(node.location), message: "Statement spans multiple lines; use indentation to silence" });
            statement.flagged = true;
          }
        }
      }
      return true;
    },
  };
  visitAst(root, visitor);
}

// ---------------------------------------------------------------------------
const documentFacts = new WeakMap<Tree, { outside: OutsideReading[]; narrativeIfs: Set<number>; names: LuauNameFacts; roots: NameRoot[]; uncertainGlobalUses: Set<number>; outermostLocals: Set<string>; misreadStatements: NameRange[]; errorLines: NameRange[]; mentionsUnplaced: (name: string) => boolean; mentionsUnplacedVariable: (name: string) => boolean; topLevelMembers: TopLevelMemberDefinition[]; parameterStarts: Set<number> }>();

export function collectLuauLints(tree: Tree, read: (from: number, to: number) => string): LuauScriptLints {
  const text = read(0, tree.length);
  const starts = lineStarts(text);
  const units = readDocumentUnits(tree, text);
  let facts = documentFacts.get(tree);
  if (!facts) {
    const nodes = lintSyntaxNodes(tree, text);
    const outside = expressionsOutsideUnits(nodes, text, [units.prelude, ...units.flows]);
    const roots: NameRoot[] = [units.prelude, ...units.flows].map((unit) => ({
      root: unit.root,
      offsets: new Offsets(starts, unit.lines),
      // readFlow's documented unit shape starts with its checking wrapper.
      // Carry that exact node; an authored function with the same name is real.
      syntheticFunction: unit.kind === "flow" && unit.root.body[0] instanceof AstStatLocalFunction ? unit.root.body[0] : undefined,
    }));
    roots.push(...outside.map(({ expr, statements }) => ({ root: statements && expr instanceof AstExprFunction ? expr.body : expr, offsets: new Offsets(starts, undefined), functionBody: statements && expr instanceof AstExprFunction })));
    const names = collectNameFacts(roots, text);
    names.uncertainNames = uncertainNames(nodes, text, names);
    const documentOffsets = new Offsets(starts, undefined);
    // The lines each syntax error spans.
    const errors: NameRange[] = [];
    const error = (offsets: Offsets, location: Location) => errors.push({ from: starts[offsets.line(location.begin)] ?? 0, to: starts[offsets.line(location.end) + 1] ?? text.length });
    for (const unit of [units.prelude, ...units.flows]) {
      const offsets = new Offsets(starts, unit.lines);
      for (const { location } of unit.errors) error(offsets, location);
    }
    for (const { errors: found } of outside) for (const { location } of found) error(documentOffsets, location);
    const outsideRanges = outside.map(({ expr }) => documentOffsets.range(expr.location));
    const parameterStarts = new Set<number>();
    const flows = flowParameters(tree, text, parameterStarts);
    const outermostLocals = new Set(names.declarations.filter((d) => d.outermost && !parameterStarts.has(d.from)).map((d) => d.name));
    const misreadStatements: NameRange[] = [];
    const misread = (root: AstNode, offsets: Offsets, found: readonly { location: Location }[]) => {
      if (!readToEnd(root) || found.some((error) => root.location.overlaps(error.location))) misreadStatements.push(offsets.range(root.location));
    };
    for (const unit of [units.prelude, ...units.flows]) {
      const offsets = new Offsets(starts, unit.lines);
      for (const source of unit.statements) misread(source.statement, offsets, unit.errors);
    }
    for (const { expr, errors: found } of outside) misread(expr, documentOffsets, found);
    // Asked only for a few names (FunctionUnused's and GlobalUsedAsLocal's
    // candidates), so each is searched for when first asked about.
    let placed: Set<number> | undefined;
    let definitions: Set<number> | undefined;
    let fields: Set<number> | undefined;
    const mentions = new Map<string, boolean>();
    const variableMentions = new Map<string, boolean>();
    const mentionsUnplaced = (name: string) => {
      let found = mentions.get(name);
      if (found === undefined) {
        placed ??= new Set([...names.declarations, ...names.references, ...names.globals, ...names.functions, ...names.uncertainNames].map((range) => range.from));
        definitions ??= new Set(names.functions.map((range) => range.from));
        mentions.set(name, (found = unplacedMention(tree, text, placed, definitions, misreadStatements.length > 0, name)));
      }
      return found;
    };
    const mentionsUnplacedVariable = (name: string) => {
      let found = variableMentions.get(name);
      if (found === undefined) {
        placed ??= new Set([...names.declarations, ...names.references, ...names.globals, ...names.functions, ...names.uncertainNames].map((range) => range.from));
        definitions ??= new Set(names.functions.map((range) => range.from));
        fields ??= new Set([...placed, ...fieldNames(roots)]);
        variableMentions.set(name, (found = unplacedMention(tree, text, fields, definitions, misreadStatements.length > 0, name)));
      }
      return found;
    };
    facts = { outside, narrativeIfs: narrativeIfStarts(nodes), names, roots, uncertainGlobalUses: uncertainGlobalUses(names, outsideRanges, flows, errors), outermostLocals, misreadStatements, errorLines: errors, mentionsUnplaced, mentionsUnplacedVariable, topLevelMembers: topLevelMembers(names, units.prelude.root, misreadStatements), parameterStarts };
    documentFacts.set(tree, facts);
  }
  const { narrativeIfs } = facts;
  const unsure = (range: NameRange) => [...facts.errorLines, ...facts.misreadStatements].some((at) => range.from < at.to && at.from < range.to);
  const out: LuauLint[] = [];
  // Separate AST readings can share a document line (two interpolations).
  const sameLines = new Set<number>();
  const globalShadows: GlobalShadowCandidate[] = [];
  // A const outside every function goes to the facts' globals, not their declarations.
  const declaredLocals = new Set(facts.names.declarations.map((d) => d.local));
  const published = (local: AstLocal) => local.isConst && !declaredLocals.has(local);
  // A scene's or branch's parameter, which the reading declares in its flow's checking wrapper or as a `local`.
  const flowParameter = (offsets: Offsets, local: AstLocal) => facts.parameterStarts.has(offsets.of(local.location.begin));
  const lintFunctions = (functions: AstExprFunction[], offsets: Offsets, errors: readonly { location: Location }[]) => {
    for (const fn of functions) {
      const broken = errors.some((error) => fn.location.overlaps(error.location));
      lintUnusedLocals(fn, tree, text, offsets, out, broken);
      lintLocalShadows(fn, tree, text, offsets, out, globalShadows, published);
      lintPlaceholderReads(fn, offsets, out);
      if (!typeOnly.has(fn)) lintUninitializedLocals(fn, tree, text, offsets, out, broken);
      lintUnreachable(fn, offsets, out);
      if (!broken && !typeOnly.has(fn)) lintImplicitReturns(fn, offsets, out);
    }
  };
  for (const unit of [units.prelude, ...units.flows]) {
    const offsets = new Offsets(starts, unit.lines);
    const narrative = (stat: AstStatIf) => narrativeIfs.has(offsets.of(stat.location.begin));
    lintFunctions(definedFunctions(unit), offsets, unit.errors);
    lintStatementLayout(unit.root, offsets, out, unit.errors, sameLines);
    lintDuplicateFunctions(unit.root, offsets, out, unit.errors, facts.names.uncertainNames, unit === units.prelude ? unit.root : undefined);
    lintDuplicateLocals(unit.root, offsets, out, unit.errors, published, flowParameter);
    for (const source of unit.statements) {
      lintDuplicateConditions(source.statement, offsets, out, narrative);
      lintForRanges(source.statement, offsets, out);
      lintExpressionPrecedence(source.statement, offsets, out, unit.errors);
      lintUnbalancedAssignments(source.statement, text, offsets, out, unsure);
      lintTableLiterals(source.statement, offsets, out, unit.errors);
      lintStdlibCalls(source.statement, offsets, out, unit.errors);
    }
  }
  const documentOffsets = new Offsets(starts, undefined);
  for (const { expr, statements, errors } of facts.outside) {
    const functions: AstExprFunction[] = [];
    // The function written around statements is not the author's; those inside it are.
    completeFunctions(statements && expr instanceof AstExprFunction ? expr.body : expr, functions);
    lintFunctions(functions, documentOffsets, errors);
    lintStatementLayout(expr, documentOffsets, out, errors, sameLines);
    lintDuplicateFunctions(expr, documentOffsets, out, errors, facts.names.uncertainNames);
    lintDuplicateLocals(expr, documentOffsets, out, errors, published, flowParameter);
    lintDuplicateConditions(expr, documentOffsets, out);
    lintForRanges(expr, documentOffsets, out);
    lintExpressionPrecedence(expr, documentOffsets, out, errors);
    lintUnbalancedAssignments(expr, text, documentOffsets, out, unsure);
    lintTableLiterals(expr, documentOffsets, out, errors);
    lintStdlibCalls(expr, documentOffsets, out, errors);
  }
  const order = (a: NameRange, b: NameRange) => a.from - b.from || a.to - b.to;
  return { lints: out.sort(order), names: facts.names, roots: facts.roots, globalShadows: globalShadows.sort(order), uncertainGlobalUses: facts.uncertainGlobalUses, outermostLocals: facts.outermostLocals, mentionsUnplaced: facts.mentionsUnplaced, mentionsUnplacedVariable: facts.mentionsUnplacedVariable, misreadStatements: facts.misreadStatements, topLevelMembers: facts.topLevelMembers };
}
