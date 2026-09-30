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
// unit per scene, with the branches inside it, and per branch outside any
// scene, each checked as the body of a function whose parameters are the
// flow's, with the prelude's names in scope. A unit keeps the whole source
// lines of its statements, with narrative left out, the parts of a line that
// are Sparkdown's own blanked and Sparkdown's own expressions written as a
// call of an `any` value (`_G()`), together with the document line of each of
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
import { VARIABLE_DEFINITION_NAMES } from "../utils/variableDefinitionNames";
import { RUN_QUERY, RUN_WRAPPER_SUFFIX, runWrapperName, runWrapperPrefix } from "../utils/runWrapper";

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

// Each unit's text split into lines, once, for turning Luau's columns into the document's.
const unitTextLines = new WeakMap<LuauUnit, string[]>();

/**
 * The document position of a position in a unit's text. Luau counts a column
 * in UTF-8 bytes and the document in UTF-16 code units; a unit's line holds
 * each of its characters at the character's document column.
 */
export function documentPosition(unit: LuauUnit, position: Position): { line: number; character: number } {
  const index = Math.min(Math.max(position.line, 0), unit.lines.length - 1);
  let lines = unitTextLines.get(unit);
  if (!lines) {
    lines = unit.text.split("\n");
    unitTextLines.set(unit, lines);
  }
  return { line: unit.lines[index] ?? 0, character: utf16Column(lines[index] ?? "", position.column) };
}

/** The UTF-16 column of the character a UTF-8 byte column points at. */
function utf16Column(text: string, byteColumn: number): number {
  let bytes = 0;
  let column = 0;
  while (column < text.length && bytes < byteColumn) {
    const code = text.codePointAt(column)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    column += code > 0xffff ? 2 : 1;
  }
  return column + Math.max(0, byteColumn - bytes);
}

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
  const wrapper = runWrapperName(uri);
  if (wrapper === undefined) return undefined;
  const prefix = runWrapperPrefix(wrapper);
  if (!documentText.startsWith(prefix) || !documentText.endsWith(RUN_WRAPPER_SUFFIX)) return undefined;
  const text = documentText.slice(prefix.length, documentText.length - RUN_WRAPPER_SUFFIX.length);
  const firstLine = prefix.split("\n").length - 1;
  return { kind: "file", text, lines: text.split("\n").map((_, i) => firstLine + i) };
}

// The statements of a `.sd` file that are Luau, wherever they sit.
const LUAU_STATEMENTS = new Set([
  ...VARIABLE_DEFINITION_NAMES,
  "LuauFunctionDefinition",
  "LuauExplicitStatement",
  "LuauReassignment",
  "LuauReturnStatement",
  "LuauBreakStatement",
  "LuauContinueStatement",
  "LuauDataTypeDeclaration",
  "LuauFunctionTypeDeclaration",
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
// divert targets and regular expressions. Each is checked as a call of the
// checker's `any` value, `_G` unless the document writes that name itself
// (see `ANY_NAMES`), or as the value alone where the expression is too short
// for the call, so the rest of its statement is checked as written.
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

// Comments, which may stand anywhere in a parameter list, `...` and its annotation included.
const COMMENT = /^Luau\w*Comment$/;

// The names the checker writes its own `any` values with, in the order it
// tries them: Luau's `_G`, which is typed `any`, then short names Luau does
// not define. A document gets the first it never writes itself, since a name
// the author writes may be bound to something else.
const ANY_NAMES = ["_G", "_H", "_J", "_K", "_Q", "_V", "_W", "_X", "_Y", "_Z"];

/** Whether a text holds a name as a whole identifier. */
function namesIdentifier(text: string, name: string): boolean {
  for (let at = text.indexOf(name); at >= 0; at = text.indexOf(name, at + 1)) {
    if (!/\w/.test(text[at - 1] ?? "") && !/\w/.test(text[at + name.length] ?? "")) return true;
  }
  return false;
}

// Whether a parameter list's text parses as Luau's, by its text.
const wholeLists = new Map<string, boolean>();

/** Whether a parameter list's text, brackets included, is a Luau parameter list as written. */
function parsesAsParameters(text: string): boolean {
  let whole = wholeLists.get(text);
  if (whole === undefined) {
    whole = parseLuau(`local function __parameters${text} end`).errors.length === 0;
    if (wholeLists.size >= 1000) wholeLists.clear();
    wholeLists.set(text, whole);
  }
  return whole;
}

/** The Luau a `.sd` file holds, as units. */
export interface SparkdownUnits {
  prelude: LuauUnit;
  /** One unit per scene or branch that holds Luau statements. */
  flows: LuauUnit[];
  /** The name the units write the checker's own `any` values with (see `ANY_NAMES`); one other than `_G` must be bound to `any` for them. */
  anyName: string;
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
 * out, so narrative added inside a Luau block does not change the unit;
 * the lines of a string or comment that spans lines are kept as written,
 * since their text is the string's value.
 */
class UnitLines {
  // Each line's kept columns, as sorted, disjoint `[from, to)` pairs laid end to end.
  private readonly spans = new Map<number, number[]>();
  // Text written over each line's columns, in the order written.
  private readonly writes = new Map<number, { column: number; text: string }[]>();
  // The lines of strings and comments that span lines.
  private readonly verbatim = new Set<number>();

  constructor(private readonly index: LineIndex) {}

  /** Keeps the lines of a string or comment that spans lines as written, blank lines and trailing spaces included. */
  keepVerbatim(from: number, to: number): void {
    const first = this.index.lineAt(from);
    const last = this.index.lineAt(Math.max(from, to - 1));
    if (first === last) return;
    for (let line = first; line <= last; line++) this.verbatim.add(line);
  }

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

  /** Writes text over the characters from an offset, as far as its line goes, or past its end when `pastEnd` says so. */
  write(offset: number, text: string, pastEnd = false): void {
    const line = this.index.lineAt(offset);
    const column = offset - this.index.starts[line]!;
    const room = this.index.lineEnd(line) - offset;
    const writes = this.writes.get(line) ?? this.writes.set(line, []).get(line)!;
    writes.push({ column, text: pastEnd ? text : text.slice(0, Math.max(room, 0)) });
  }

  /** The lines that kept something, in document order, with their line numbers. */
  build(): { text: string[]; lines: number[] } {
    const numbers = [...new Set([...this.spans.keys(), ...this.writes.keys(), ...this.verbatim])].sort((a, b) => a - b);
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
      if (!this.verbatim.has(line)) {
        out = out.trimEnd();
        if (out.trim().length === 0) continue;
      }
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

/** A `...` parameter, with its annotation and the type that writes ("" for none). */
interface Vararg {
  dots: SyntaxNode;
  annotation: SyntaxNode | undefined;
  type: string;
}

/**
 * How a header's parameter list is read: whole, as written, or, where the
 * grammar ends it early, as the names the runtime binds for it, typed `any`.
 */
type ParameterReading =
  | { node: SyntaxNode; whole: true; vararg: Vararg | undefined }
  | { node: SyntaxNode; whole: false; names: string[]; vararg: Vararg | undefined };

/** A scene, or a branch outside any scene, with the branches in it. */
interface Flow {
  header: SyntaxNode;
  parameters: ParameterReading | undefined;
  body: UnitLines;
  /** The `...` parameters of the flow and of the branches in it, in document order. */
  varargs: Vararg[];
  /** Whether the flow's own parameters end with `...`, which is then the first of `varargs`. */
  variadic: boolean;
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
 * outside any flow and every function definition, and a unit per scene (its
 * branches included) or branch outside any scene that holds Luau statements.
 */
export function sparkdownUnits(tree: Tree, documentText: string): SparkdownUnits {
  const index = new LineIndex(documentText);
  const anyName = ANY_NAMES.find((name) => !namesIdentifier(documentText, name)) ?? ANY_NAMES[0]!;
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
        if (child.name === "LuauInterpolatedString") {
          lines.keepVerbatim(child.from, child.to);
          keepInterpolations(child);
        } else if (ATOMIC.test(child.name)) lines.keepVerbatim(child.from, child.to);
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
      lines.write(at, room >= 4 ? `${anyName}()` : room >= 2 ? anyName : "");
    };
    blankWithin(node);
  };

  // A header's parameter list. The grammar can end a list early, as a `...`
  // inside a parameter's function type makes it do, and then the list's text
  // is not a Luau parameter list; the runtime binds the names the list holds,
  // and `...` if one is in it (`lowerArguments`), so such a list is read the
  // same way, each name typed `any`. A list whose text is Luau's is kept as
  // written, whatever follows it in the header.
  const readParameters = (header: SyntaxNode): ParameterReading | undefined => {
    const node = findDescendant(header, "LuauFunctionParameters");
    if (!node) return undefined;
    if (parsesAsParameters(documentText.slice(node.from, node.to))) return { node, whole: true, vararg: varargOf(node) };
    const dots = findDescendant(node, "LuauVariadicParameter");
    const names = findAll(node, "LuauFunctionParameter").map((name) => documentText.slice(name.from, name.to));
    return { node, whole: false, names, vararg: dots ? { dots, annotation: undefined, type: "" } : undefined };
  };

  // The `...` a whole parameter list takes, if it takes one: an entry of the
  // list itself, not of a parameter's annotation, with the annotation that
  // follows it (past any comment) and that annotation's type as written. Two
  // spellings of one type then count as two types, which leaves `...` untyped
  // (see below), where rewriting them could count two types as one.
  const varargOf = (parameters: SyntaxNode): Vararg | undefined => {
    const dots = findAll(parameters, "LuauVariadicParameter", true)[0];
    if (!dots) return undefined;
    let annotation = dots.nextSibling;
    while (annotation && (NEUTRAL.test(annotation.name) || COMMENT.test(annotation.name))) annotation = annotation.nextSibling;
    if (annotation?.name !== "LuauTypeAnnotationOperation") return { dots, annotation: undefined, type: "" };
    return { dots, annotation, type: documentText.slice(annotation.from, annotation.to).replace(/^\s*:/, "").trim() };
  };

  // A branch's named parameters, as a `local` on its header line with each
  // parameter at its column, holding the checker's `any` value as an argument
  // does: `branch inner(k: number, m)` reads as
  // `local        k: number, m = _G, _G`. Its `...` is the flow's (see below).
  const declareParameters = (flow: Flow, header: SyntaxNode) => {
    const parameters = readParameters(header);
    if (!parameters) return;
    if (parameters.vararg) flow.varargs.push(parameters.vararg);
    const text = documentText.slice(header.from, header.to);
    const start = header.from + text.length - text.trimStart().length;
    if (!parameters.whole) {
      // Each typed `any`, as an argument the runtime binds is; untyped, a `local` would be `nil`.
      if (parameters.names.length) flow.body.write(start, `local ${parameters.names.map((name) => `${name}: any`).join(", ")}`, true);
      return;
    }
    // The named parameters end at the comma before the `...`.
    let end = parameters.node.to - 1;
    if (parameters.vararg) {
      let separator = parameters.vararg.dots.prevSibling;
      while (separator && separator.name !== "LuauCommaSeparator") separator = separator.prevSibling;
      end = separator ? separator.from : parameters.vararg.dots.from;
    }
    const named = findAll(parameters.node, "LuauFunctionParameter", true).filter((name) => name.from < end);
    if (!named.length) return;
    flow.body.mark(parameters.node.from + 1, end, true);
    flow.body.write(start, "local");
    // Without a value, a `local` with no annotation would be `nil`.
    flow.body.write(end, ` = ${named.map(() => anyName).join(", ")}`, true);
  };

  // A flow runs from its header to the `end` that closes it; a branch sits
  // inside a scene, so the flows open at a point form a stack.
  const prelude = new UnitLines(index);
  const flows: Flow[] = [];
  const open: Flow[] = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (FLOW_HEADERS.has(node.name)) {
      const enclosing = open[open.length - 1];
      if (enclosing && node.name === "Branch") {
        // A branch runs in its scene's call-stack element, where the scene's
        // locals and those its other branches set are visible, so it is
        // checked as part of the flow it sits in.
        declareParameters(enclosing, node);
        open.push(enclosing);
      } else {
        const parameters = readParameters(node);
        const own = parameters?.vararg;
        const flow: Flow = { header: node, parameters, body: new UnitLines(index), varargs: own ? [own] : [], variadic: own !== undefined };
        flows.push(flow);
        open.push(flow);
      }
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
    anyName,
  };
  for (const flow of flows) {
    const bodyLines = flow.body.build();
    // A flow whose statements are all Sparkdown's own has no Luau to check.
    if (bodyLines.text.length === 0) continue;
    const headerLine = index.lineAt(flow.header.from);
    const text: string[] = ["local function __flow"];
    const lines: number[] = [headerLine];
    // At runtime `...` reads the arguments of whichever of the flow and its
    // branches took a `...` last. Here they are one function, whose `...` has
    // the type they all give theirs, or no type where they differ.
    const agreed = new Set(flow.varargs.map((vararg) => vararg.type)).size === 1;
    // The flow's parameters: a whole list at its columns in the header line,
    // one the grammar ends early as the runtime reads it.
    const parameters = flow.parameters;
    if (parameters?.whole) {
      const line = new UnitLines(index);
      line.mark(parameters.node.from, parameters.node.to, true);
      const own = flow.variadic ? flow.varargs[0] : undefined;
      if (own?.annotation && !agreed) line.mark(own.annotation.from, own.annotation.to, false);
      const built = line.build();
      text.push(...built.text);
      lines.push(...built.lines);
    } else if (parameters) {
      text[0] += `(${[...parameters.names.map((name) => `${name}: any`), ...(flow.variadic ? ["..."] : [])].join(", ")})`;
    } else {
      text[0] += "()";
    }
    // A branch's `...` where the flow has none, written at its columns in the
    // branch's header line, as the function's last parameter.
    const branchVararg = flow.variadic ? undefined : flow.varargs[0];
    if (branchVararg) {
      const named = parameters && (parameters.whole ? findAll(parameters.node, "LuauFunctionParameter", true).length > 0 : parameters.names.length > 0);
      text[text.length - 1] = text[text.length - 1]!.replace(/\)$/, named ? "," : "");
      const line = new UnitLines(index);
      line.mark(branchVararg.dots.from, branchVararg.dots.to, true);
      if (branchVararg.annotation && agreed) line.mark(branchVararg.annotation.from, branchVararg.annotation.to, true);
      const built = line.build();
      built.text[built.text.length - 1] += ")";
      text.push(...built.text);
      lines.push(...built.lines);
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

/** Every node of a kind under a node, in document order, outside parameters' annotations when `outsideAnnotations` says so. */
function findAll(node: SyntaxNode, name: string, outsideAnnotations = false, found: SyntaxNode[] = []): SyntaxNode[] {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) found.push(child);
    else if (!outsideAnnotations || child.name !== "LuauTypeAnnotationOperation") findAll(child, name, outsideAnnotations, found);
  }
  return found;
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
