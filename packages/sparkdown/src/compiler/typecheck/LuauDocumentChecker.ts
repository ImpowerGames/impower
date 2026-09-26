// Type checking the Luau in a Sparkdown document.
//
// The checker reads the Luau that Sparkdown's syntax tree marks as Luau: all
// of a `.luau` file loaded with `run`, and the Luau statements of a `.sd`
// file. It parses that text with the port of Luau's parser (the tree keeps
// operators as flat chains and types without precedence, and the checker
// needs Luau's own tree, locations and name resolution), then checks the
// resulting module with the port of Luau's type checker.
//
// A document's Luau is checked in units. A `.luau` file is one unit. A `.sd`
// file is its prelude (the Luau outside any flow, and its functions) and one
// unit per scene and branch, each checked as the body of a function whose
// parameters are the flow's, with the prelude's names in scope. A unit keeps
// the whole source lines of its statements, with narrative left out, the
// parts of a line that are Sparkdown's own blanked and Sparkdown's own
// expressions written as `_G()`, together with the document line of each of
// its lines; so a unit's text, and the result of checking it, do not change
// when lines move around it.

import type { SyntaxNode, Tree } from "@lezer/common";
import { AstStatBlock } from "./Ast";
import { parseLuau } from "./DefinitionParser";
import { LuauTypeError } from "./Error";
import { accumulateErrors, parseMode, type Frontend } from "./Frontend";
import { Location, Position } from "./Location";
import { Mode, type Module, type SourceModule } from "./Module";
import type { Scope } from "./Scope";

/** A mode's name, as a `.sd` file's `typecheck:` field and `config.typecheck.mode` write it. */
export type TypecheckModeName = "strict" | "nonstrict" | "nocheck";

export const TYPECHECK_MODE_NAMES: readonly TypecheckModeName[] = ["nonstrict", "strict", "nocheck"];

export function modeFromName(name: string): Mode | undefined {
  switch (name) {
    case "strict":
      return Mode.Strict;
    case "nonstrict":
      return Mode.Nonstrict;
    case "nocheck":
      return Mode.NoCheck;
    default:
      return undefined;
  }
}

/** Some of a document's Luau, checked as one module. */
export interface LuauUnit {
  /** A whole Luau file, a `.sd` file's prelude, or one of its flows. */
  kind: "file" | "prelude" | "flow";
  /** The unit's Luau: one document line per line, except the lines that wrap a flow in a function. */
  text: string;
  /** The document line of each of the text's lines. */
  lines: number[];
}

/** The document position of a position in a unit's text. */
export function documentPosition(unit: LuauUnit, position: Position): { line: number; character: number } {
  const line = unit.lines[Math.min(Math.max(position.line, 0), unit.lines.length - 1)] ?? 0;
  return { line, character: position.column };
}

const RUN_QUERY = "?run=";

/** Whether a document is a Luau file, which is Luau from its first line to its last. */
export function isLuauFile(uri: string): boolean {
  const path = uri.split(/[?#]/, 1)[0]!;
  return path.endsWith(".luau") && !uri.includes(RUN_QUERY);
}

/** A Luau file's text, as one unit. */
export function luauFileUnit(documentText: string): LuauUnit {
  return { kind: "file", text: documentText, lines: documentText.split("\n").map((_, i) => i) };
}

/**
 * A `run` file's Luau, from the document the compiler loads it as: the
 * file's text wrapped in a function (`& W()`, `function W()`, the text,
 * `end`). The file's text is the unit.
 */
export function runFileUnit(uri: string, documentText: string): LuauUnit | undefined {
  const at = uri.indexOf(RUN_QUERY);
  if (at < 0) return undefined;
  const wrapper = uri.slice(at + RUN_QUERY.length);
  const prefix = `& ${wrapper}()\nfunction ${wrapper}()\n`;
  const suffix = "\nend\n";
  if (!documentText.startsWith(prefix) || !documentText.endsWith(suffix)) return undefined;
  const text = documentText.slice(prefix.length, documentText.length - suffix.length);
  const firstLine = prefix.split("\n").length - 1;
  return { kind: "file", text, lines: text.split("\n").map((_, i) => firstLine + i) };
}

// The statements of a `.sd` file that are Luau, wherever they sit.
const LUAU_STATEMENTS = new Set([
  "LuauVariableDefinition",
  "LuauFunctionDefinition",
  "LuauExplicitStatement",
  "LuauReassignment",
  "LuauReturnStatement",
  "LuauBreakStatement",
  "LuauContinueStatement",
  "LuauDataTypeDeclaration",
  "LuauIfBlock",
  "LuauWhileLoop",
  "LuauForLoop",
  "LuauRepeatLoop",
  "LuauDoBlock",
  "LuauSparkdownIfBlock",
  "LuauSparkdownWhileLoop",
  "LuauSparkdownForLoop",
  "LuauSparkdownRepeatLoop",
  "LuauSparkdownDoBlock",
  "LuauSparkdownReturnStatement",
  "LuauSparkdownChooseBlock",
]);

// The headers that begin a flow.
const FLOW_HEADERS = new Set(["Scene", "Branch"]);

// Nodes inside Luau statements that are Sparkdown's own: the `&` that marks
// a statement, the `choose`, `then` and `end` of a `choose` block, and the
// constructs Luau has no syntax for. A `choose` block opens no scope (a
// choice's statements run in its flow's), so the statements inside it are
// kept where they stand.
const SPARKDOWN_ONLY = new Set([
  "LuauExplicitStatementMark",
  "LuauSparkdownChooseBlock_begin",
  "LuauSparkdownChooseThenClause_begin",
  "LuauSparkdownChooseBlock_end",
  "LuauDefine",
  "LuauStyle",
  "LuauLayout",
  "LuauScreen",
  "LuauAnimation",
  "LuauTheme",
  "LuauComponent",
  "LuauMorph",
  "LuauUIElement",
  "LuauSparkdownAlternatorBlocks",
  "LuauSparkdownConditionalAlternatorBlock",
  "LuauSparkdownSequentialAlternatorBlock",
  "LuauSparkdownSingleLineConditionalAlternatorBlock",
  "LuauSparkdownSingleLineSequentialAlternatorBlock",
  "LuauSparkdownInlineGluedConditionalAlternatorBlock",
  "LuauSparkdownInlineGluedSequentialAlternatorBlock",
]);

// Sparkdown's own expressions, which Luau has no syntax for: alternators,
// divert targets and regular expressions. Each is checked as a call of
// Luau's `_G`, which is typed `any` (as `_G` where the expression is too
// short for the call), so the rest of its statement is checked as written.
const SPARKDOWN_EXPRESSIONS = new Set([
  "LuauConditionalAlternatorBlock",
  "LuauSequentialAlternatorBlock",
  "LuauDivertTargetLiteral",
  "LuauRegexLiteral",
]);

// Nodes that may sit anywhere in Luau: trivia and punctuation.
const NEUTRAL = /^(Newline|OptionalWhitespace|RequiredWhitespace|ExtraWhitespace|Whitespace|Punctuation\w+)$/;

// Nodes whose text is Luau as it stands: strings and comments. A backtick
// string's interpolations are the exception (see `keepInterpolations`).
const ATOMIC = /^Luau\w*(String|Comment)$/;

/** The Luau a `.sd` file holds, as units. */
export interface SparkdownUnits {
  prelude: LuauUnit;
  /** One unit per scene or branch that holds Luau statements. */
  flows: LuauUnit[];
}

/** The line starts of a text, for finding the line an offset is on. */
class LineIndex {
  readonly starts: number[] = [0];

  constructor(readonly text: string) {
    for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) this.starts.push(i + 1);
  }

  lineAt(offset: number): number {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  lineEnd(line: number): number {
    const next = this.starts[line + 1];
    return next === undefined ? this.text.length : next - 1;
  }
}

/**
 * Builds a unit's lines: whole document lines, holding only the characters
 * kept, each at its column. A line left with nothing but whitespace is left
 * out, so narrative added inside a Luau block does not change the unit.
 */
class UnitLines {
  // Each line's kept columns, as sorted, disjoint `[from, to)` pairs laid end to end.
  private readonly spans = new Map<number, number[]>();
  // Text written over each line's columns, in the order written.
  private readonly writes = new Map<number, { column: number; text: string }[]>();

  constructor(private readonly index: LineIndex) {}

  /** Keeps the characters of a range, or blanks them. */
  mark(from: number, to: number, keep: boolean): void {
    if (to <= from) return;
    const last = this.index.lineAt(to - 1);
    for (let line = this.index.lineAt(from); line <= last; line++) {
      const start = this.index.starts[line]!;
      const a = Math.max(from, start) - start;
      const b = Math.min(to, this.index.lineEnd(line)) - start;
      if (b <= a) continue;
      const spans = this.spans.get(line);
      if (keep) this.spans.set(line, addSpan(spans ?? [], a, b));
      else if (spans) this.spans.set(line, removeSpan(spans, a, b));
    }
  }

  /** Writes text over the characters from an offset, as far as its line goes. */
  write(offset: number, text: string): void {
    const line = this.index.lineAt(offset);
    const column = offset - this.index.starts[line]!;
    const room = this.index.lineEnd(line) - offset;
    const writes = this.writes.get(line) ?? this.writes.set(line, []).get(line)!;
    writes.push({ column, text: text.slice(0, Math.max(room, 0)) });
  }

  /** The lines that kept something, in document order, with their line numbers. */
  build(): { text: string[]; lines: number[] } {
    const numbers = [...new Set([...this.spans.keys(), ...this.writes.keys()])].sort((a, b) => a - b);
    const text: string[] = [];
    const lines: number[] = [];
    for (const line of numbers) {
      const start = this.index.starts[line]!;
      const spans = this.spans.get(line) ?? [];
      let out = "";
      for (let i = 0; i < spans.length; i += 2) {
        out = out.padEnd(spans[i]!) + this.index.text.slice(start + spans[i]!, start + spans[i + 1]!);
      }
      for (const { column, text: written } of this.writes.get(line) ?? []) {
        out = out.slice(0, column).padEnd(column) + written + out.slice(column + written.length);
      }
      out = out.trimEnd();
      if (out.trim().length === 0) continue;
      text.push(out);
      lines.push(line);
    }
    return { text, lines };
  }
}

/** Adds `[from, to)` to sorted, disjoint spans, merging the spans it meets. */
function addSpan(spans: number[], from: number, to: number): number[] {
  const out: number[] = [];
  let placed = false;
  for (let i = 0; i < spans.length; i += 2) {
    const a = spans[i]!;
    const b = spans[i + 1]!;
    if (b < from) {
      out.push(a, b);
    } else if (a > to) {
      if (!placed) out.push(from, to);
      placed = true;
      out.push(a, b);
    } else {
      from = Math.min(from, a);
      to = Math.max(to, b);
    }
  }
  if (!placed) out.push(from, to);
  return out;
}

/** Removes `[from, to)` from sorted, disjoint spans. */
function removeSpan(spans: number[], from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < spans.length; i += 2) {
    const a = spans[i]!;
    const b = spans[i + 1]!;
    if (b <= from || a >= to) {
      out.push(a, b);
      continue;
    }
    if (a < from) out.push(a, from);
    if (b > to) out.push(to, b);
  }
  return out;
}

/**
 * A `.sd` file's Luau as units: its prelude, with the Luau statements
 * outside any flow and every function definition, and a unit per scene or
 * branch that holds Luau statements.
 */
export function sparkdownUnits(tree: Tree, documentText: string): SparkdownUnits {
  const index = new LineIndex(documentText);
  const isSparkdownOnly = (node: SyntaxNode): boolean => {
    const name = node.name;
    if (SPARKDOWN_ONLY.has(name)) return true;
    if (name === "LuauScopeModifier") {
      const text = documentText.slice(node.from, node.to).trim();
      return text !== "local" && text !== "const";
    }
    return !name.startsWith("Luau") && !NEUTRAL.test(name);
  };
  const keepLuau = (lines: UnitLines, node: SyntaxNode) => {
    lines.mark(node.from, node.to, true);
    const blankWithin = (n: SyntaxNode) => {
      for (let child = n.firstChild; child; child = child.nextSibling) {
        if (child.name === "LuauInterpolatedString") keepInterpolations(child);
        else if (ATOMIC.test(child.name)) continue;
        else if (SPARKDOWN_EXPRESSIONS.has(child.name)) replaceWithAny(child);
        else if (isSparkdownOnly(child)) lines.mark(child.from, child.to, false);
        else blankWithin(child);
      }
    };
    // A backtick string is Luau as it stands, but for its interpolations,
    // which may hold Sparkdown's own expressions, and Sparkdown's `{{f}}` (the
    // text `f()` returns), which is not Luau.
    const keepInterpolations = (n: SyntaxNode) => {
      for (let child = n.firstChild; child; child = child.nextSibling) {
        if (child.name === "LuauBacktickFunctionCallShorthand") lines.mark(child.from, child.to, false);
        else if (child.name === "LuauBacktickStringInterpolation") blankWithin(child);
        else keepInterpolations(child);
      }
    };
    const replaceWithAny = (expression: SyntaxNode) => {
      lines.mark(expression.from, expression.to, false);
      // The node's text can begin with the whitespace before the expression.
      const text = documentText.slice(expression.from, expression.to);
      const at = expression.from + text.length - text.trimStart().length;
      const room = Math.min(expression.to, index.lineEnd(index.lineAt(at))) - at;
      lines.write(at, room >= 4 ? "_G()" : room >= 2 ? "_G" : "");
    };
    blankWithin(node);
  };

  // A flow runs from its header to the `end` that closes it; a branch sits
  // inside a scene, so the flows open at a point form a stack.
  const prelude = new UnitLines(index);
  const flows: { header: SyntaxNode; body: UnitLines }[] = [];
  const open: { header: SyntaxNode; body: UnitLines }[] = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (FLOW_HEADERS.has(node.name)) {
      const flow = { header: node, body: new UnitLines(index) };
      flows.push(flow);
      open.push(flow);
    } else if (node.name === "LuauEndKeyword") {
      open.pop();
    } else if (node.name === "LuauFunctionDefinition") {
      keepLuau(prelude, node);
    } else if (LUAU_STATEMENTS.has(node.name)) {
      keepLuau(open[open.length - 1]?.body ?? prelude, node);
    }
  }

  const preludeLines = prelude.build();
  const units: SparkdownUnits = {
    prelude: { kind: "prelude", text: preludeLines.text.join("\n"), lines: preludeLines.lines },
    flows: [],
  };
  for (const { header, body } of flows) {
    const bodyLines = body.build();
    // A flow whose statements are all Sparkdown's own has no Luau to check.
    if (bodyLines.text.length === 0) continue;
    const headerLine = index.lineAt(header.from);
    const text: string[] = ["local function __flow"];
    const lines: number[] = [headerLine];
    // The flow's parameters, at their columns in the header line.
    const parameters = findDescendant(header, "LuauFunctionParameters");
    if (parameters) {
      const line = new UnitLines(index);
      line.mark(parameters.from, parameters.to, true);
      const built = line.build();
      text.push(...built.text);
      lines.push(...built.lines);
    } else {
      text[0] += "()";
    }
    text.push(...bodyLines.text, "end");
    lines.push(...bodyLines.lines, bodyLines.lines[bodyLines.lines.length - 1] ?? headerLine);
    units.flows.push({ kind: "flow", text: text.join("\n"), lines });
  }
  return units;
}

function findDescendant(node: SyntaxNode, name: string): SyntaxNode | undefined {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
    const found = findDescendant(child, name);
    if (found) return found;
  }
  return undefined;
}

/** The result of checking one unit. */
export interface LuauUnitCheck {
  unit: LuauUnit;
  sourceModule: SourceModule;
  module: Module;
  /**
   * Luau's parse errors, then the checker's errors, in source order as
   * Luau's `CheckResult` lists them, located in the unit's text.
   */
  errors: LuauTypeError[];
  mode: Mode;
}

/**
 * Parses and checks a unit. A Luau file's `--!` header comment selects its
 * mode; otherwise `defaultMode` does. `environmentScope`, below the global
 * scope, holds the names the unit sees beyond Luau's globals.
 */
export function checkLuauUnit(frontend: Frontend, name: string, unit: LuauUnit, defaultMode: Mode, environmentScope?: Scope): LuauUnitCheck {
  const parsed = parseLuau(unit.text);
  const hotcomments = unit.kind === "file" ? parsed.hotcomments : [];
  const sourceModule: SourceModule = {
    name,
    humanReadableName: name,
    root: parsed.root ?? new AstStatBlock(new Location(new Position(0, 0), new Position(0, 0)), []),
    mode: parseMode(hotcomments),
    hotcomments,
    parseErrors: parsed.errors.map((e) => new LuauTypeError(e.location, { kind: "SyntaxError", message: e.message }, name)),
  };
  const result = frontend.checkSourceModule(sourceModule, defaultMode, environmentScope);
  const mode = sourceModule.mode ?? defaultMode;
  // Luau's frontend puts a module's parse errors first, even in no-check
  // mode, then sorts them with the rest by where they begin.
  const errors = accumulateErrors([...sourceModule.parseErrors, ...result.module.errors]);
  return { unit, sourceModule, module: result.module, errors, mode };
}
