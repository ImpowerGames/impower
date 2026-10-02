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
// expressions outside them, in Sparkdown's own text and constructs: an
// interpolation (`{a and b}`, in a line or a choice) and a property's value
// in a `define`. The rules about locals and reachability read the Luau
// functions a script defines (`function f()`, wherever it is written, and
// function values): a local outside a function can be read from
// interpolated text or later narrative the rules cannot scope. A function
// with a block missing its `end` is left alone, since its AST does not show
// what the author wrote. The rules about conditions and loop ranges read
// every Luau `if`, `if` expression, `and`/`or` chain and numeric `for`; of
// Sparkdown's narrative `if` block around dialogue, they read the conditions
// and the Luau inside, but do not compare its arms' conditions.

import { type SyntaxNode, type Tree } from "@lezer/common";
import {
  AstExpr,
  AstExprBinary,
  AstExprCall,
  AstExprConstantBool,
  AstExprConstantNil,
  AstExprConstantNumber,
  AstExprConstantString,
  AstExprFunction,
  AstExprGlobal,
  AstExprGroup,
  AstExprIfElse,
  AstExprIndexExpr,
  AstExprIndexName,
  AstExprInterpString,
  AstExprLocal,
  AstExprTable,
  AstExprTypeAssertion,
  AstExprUnary,
  AstExprVarargs,
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
  AstStatRepeat,
  AstStatReturn,
  AstStatWhile,
  AstTypeReference,
  BinaryOp,
  UnaryOp,
  visitAst,
  type AstLocal,
  type AstNode,
  type AstStat,
} from "../typecheck/Ast";
import { doesCallError } from "../typecheck/DataFlowGraph";
import type { Location, Position } from "../typecheck/Location";
import { readDocumentUnits } from "../typecheck/LuauDocumentChecker";
import { NEUTRAL, SPARKDOWN_EXPRESSIONS, SPARKDOWN_ONLY } from "../typecheck/LuauUnitNodes";
import { readLuauExpression, type LuauAstUnit } from "../typecheck/readLuauAst";

/** The rules, by the name each warning carries as its diagnostic code. */
export const LUAU_LINT_CODES = [
  "LocalUnused",
  "UnreachableCode",
  "DuplicateCondition",
  "ForRange",
  "PlaceholderRead",
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

/** Whether every block in a function, its own body included, was read to its end. */
function readToEnd(fn: AstExprFunction): boolean {
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
 * wrote in it. A function inside a complete one is read with it.
 */
function completeFunctions(root: AstNode, functions: AstExprFunction[]): void {
  visitAst(root, {
    visit(node) {
      if (!(node instanceof AstExprFunction)) return true;
      if (readToEnd(node)) functions.push(node);
      return false;
    },
  });
}

/** The Luau functions a unit's statements define (`completeFunctions`). */
function definedFunctions(unit: LuauAstUnit): AstExprFunction[] {
  const functions: AstExprFunction[] = [];
  for (const source of unit.statements) completeFunctions(source.statement, functions);
  return functions;
}

// The words of the constructs the rules read in an expression: a chain, an
// `if` expression and a function value. An expression without one holds
// nothing to lint and is not read.
const LINTED_WORD = /\b(and|or|if|function)\b/;

// The nodes that hold a Luau expression no unit may read.
const EXPRESSION_HOLDERS = new Set(["LuauInterpolatedStringExpression", "LuauAssignmentOperation", "LuauFunctionDefinition"]);

/**
 * The Luau expressions no unit reads, in Sparkdown's own text and
 * constructs, outside the units' statements or inside what their reading
 * passes over: an interpolation's (`{a and b}`, in a line, a choice or a
 * line inside a narrative `if`) and a property value's in a `define`
 * (`v = a or b`), and a function value anywhere else. Each is read on its
 * own (`readLuauExpression`), located in the document's lines.
 */
function expressionsOutsideUnits(tree: Tree, text: string, units: LuauAstUnit[]): AstExpr[] {
  const key = (node: { name: string; from: number; to: number }) => `${node.from}:${node.to}:${node.name}`;
  const statementNodes = new Set(units.flatMap((unit) => unit.statements.flatMap((source) => source.nodes.map(key))));
  // Whether a unit reads the node: it is in a unit's statement, and nothing
  // between them is a node the reading passes over (narrative text, one of
  // Sparkdown's own constructs or expressions; see `readLuauAst.ts`).
  const isCovered = (node: SyntaxNode) => {
    for (let at: SyntaxNode | null = node; at; at = at.parent) {
      if (statementNodes.has(key(at))) return true;
      if (SPARKDOWN_ONLY.has(at.name) || SPARKDOWN_EXPRESSIONS.has(at.name)) return false;
      if (!at.name.startsWith("Luau") && !NEUTRAL.test(at.name)) return false;
    }
    return false;
  };
  const expressions: AstExpr[] = [];
  const read = (nodes: SyntaxNode[]) => {
    if (nodes.length === 0 || !LINTED_WORD.test(text.slice(nodes[0]!.from, nodes[nodes.length - 1]!.to))) return;
    expressions.push(readLuauExpression(nodes, text).expr);
  };
  tree.iterate({
    enter(node) {
      if (!EXPRESSION_HOLDERS.has(node.name)) return true;
      // A unit reads it, but perhaps not a construct inside it the reading passes over.
      if (isCovered(node.node)) return true;
      if (node.name === "LuauInterpolatedStringExpression") {
        // Between the braces.
        read(childrenOf(node.node).slice(1, -1));
        return false;
      }
      if (node.name === "LuauAssignmentOperation") {
        // The value, after the `=`.
        const content = childrenOf(node.node).find((child) => child.name === "LuauAssignmentOperation_content");
        const parts = content ? childrenOf(content) : [];
        read(parts.slice(parts.findIndex((child) => child.name === "LuauAssignmentOperator") + 1));
        return false;
      }
      if (node.name === "LuauFunctionDefinition") {
        read([node.node]);
        return false;
      }
      return true;
    },
  });
  return expressions;
}

/** A node's children, in order. */
function childrenOf(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) children.push(child);
  return children;
}

/** The offsets of the `if` that begins each of Sparkdown's narrative `if` blocks. */
function narrativeIfStarts(tree: Tree): Set<number> {
  const starts = new Set<number>();
  tree.iterate({
    enter(node) {
      if (node.name !== "LuauIfKeyword") return true;
      let parent = node.node.parent;
      while (parent?.name.startsWith("LuauSparkdownIfBlock_begin")) parent = parent.parent;
      if (parent?.name === "LuauSparkdownIfBlock") starts.add(node.from);
      return false;
    },
  });
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
// LocalUnused

// Parameters, loop variables and local functions only hide outer names; an
// unused one is not reported. A plain write does not use a local; every other
// occurrence does, a name in a type annotation included (`local x: Foo`
// reads a local `Foo`, as a type name does a module's in Luau). The grammar
// reads some names as Sparkdown's structural words (`style`, `layout`,
// `match`) even where the author meant a name (`setStyle(style)`), where the
// reading has no name, so such a word counts as a use of the local it names
// (`keywordUse`, #984), and a use is never missed.
function lintUnusedLocals(fn: AstExprFunction, tree: Tree, text: string, offsets: Offsets, out: LuauLint[]): void {
  const declared: AstLocal[] = [];
  const used = new Set<AstLocal>();
  const typeNames: { name: string; at: Position }[] = [];
  visitAst(fn, {
    visit(node) {
      // A `const` declares a global constant in Sparkdown, not a local.
      if (node instanceof AstStatLocal && !node.isConst) declared.push(...node.vars);
      else if (node instanceof AstStatAssign) {
        // The targets themselves are written, not read; what they index is read.
        for (const target of node.vars) if (!(target instanceof AstExprLocal)) visitAst(target, this);
        for (const value of node.values) visitAst(value, this);
        return false;
      } else if (node instanceof AstExprLocal) used.add(node.local);
      else if (node instanceof AstTypeReference) {
        typeNames.push({ name: node.prefix ?? node.name, at: node.location.begin });
      }
      return true;
    },
  });
  for (const local of declared) {
    if (local.name.startsWith("_") || used.has(local)) continue;
    if (typeNames.some((t) => t.name === local.name && local.location.begin.lt(t.at))) continue;
    if (keywordUse(tree, text, offsets.of(local.location.end), offsets.of(fn.location.end), local.name)) continue;
    out.push({ code: "LocalUnused", ...offsets.range(local.location), message: `Variable '${local.name}' is never used; prefix with '_' to silence` });
  }
}

/** Whether the tree marks a word that spells `name`, between two offsets, as one of Sparkdown's keywords. */
function keywordUse(tree: Tree, text: string, from: number, to: number, name: string): boolean {
  const word = /[A-Za-z_][A-Za-z0-9_]*/g;
  for (const match of text.slice(from, to).matchAll(word)) {
    if (match[0] !== name) continue;
    if (tree.resolveInner(from + match.index, 1).name.endsWith("Keyword")) return true;
  }
  return false;
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

export function collectLuauLints(tree: Tree, read: (from: number, to: number) => string): LuauScriptLints {
  const text = read(0, tree.length);
  const starts = lineStarts(text);
  const units = readDocumentUnits(tree, text);
  const narrativeIfs = narrativeIfStarts(tree);
  const out: LuauLint[] = [];
  const lintFunctions = (functions: AstExprFunction[], offsets: Offsets) => {
    for (const fn of functions) {
      lintUnusedLocals(fn, tree, text, offsets, out);
      lintPlaceholderReads(fn, offsets, out);
      lintUnreachable(fn, offsets, out);
    }
  };
  for (const unit of [units.prelude, ...units.flows]) {
    const offsets = new Offsets(starts, unit.lines);
    const narrative = (stat: AstStatIf) => narrativeIfs.has(offsets.of(stat.location.begin));
    lintFunctions(definedFunctions(unit), offsets);
    for (const source of unit.statements) {
      lintDuplicateConditions(source.statement, offsets, out, narrative);
      lintForRanges(source.statement, offsets, out);
    }
  }
  const documentOffsets = new Offsets(starts, undefined);
  for (const expr of expressionsOutsideUnits(tree, text, [units.prelude, ...units.flows])) {
    const functions: AstExprFunction[] = [];
    completeFunctions(expr, functions);
    lintFunctions(functions, documentOffsets);
    lintDuplicateConditions(expr, documentOffsets, out);
    lintForRanges(expr, documentOffsets, out);
  }
  return { lints: out.sort((a, b) => a.from - b.from || a.to - b.to) };
}
