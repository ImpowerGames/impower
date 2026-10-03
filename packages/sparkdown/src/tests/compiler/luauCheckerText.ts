// The text the type checker read a document's Luau as before it read the
// syntax tree's AST (#1286), kept as the oracle tests' view of a unit:
// `luauTreeAst.test.ts` and `luauSyntaxAgreement.test.ts` give Luau's parser
// this text and compare its reading with `readLuauAst.ts`'s reading of the
// tree.
//
// A unit keeps the whole source lines of its statements, with narrative
// left out, the parts of a line that are Sparkdown's own blanked and
// Sparkdown's own expressions written as a call of an `any` value (`_G()`),
// together with the document line of each of its lines.

import type { SyntaxNode, Tree } from "@lezer/common";
import type { Json } from "./officialLuau";
import { loadOfficialLuau, officialLuauAvailable } from "./officialLuau";
import { FLOW_HEADERS, LUAU_SCOPE_MODIFIERS, LUAU_STATEMENTS, NEUTRAL, SPARKDOWN_EXPRESSIONS, SPARKDOWN_ONLY } from "../../compiler/typecheck/LuauUnitNodes";

/** Some of a document's Luau, as the checker's text read it. */
export interface LuauTextUnit {
  /** A whole Luau file, a `.sd` file's prelude, or one of its flows. */
  kind: "file" | "prelude" | "flow";
  /** The unit's Luau: one document line per line, except the lines that wrap a flow in a function. */
  text: string;
  /** The document line of each of the text's lines. */
  lines: number[];
  /** True only when a flow has no closing token and extraction appends its own `end`. */
  syntheticEnd?: boolean;
  /** Only the do/end scopes inserted around narrative returns. */
  returnScopes?: { begin: { line: number; character: number }; end: { line: number; character: number } }[];
  /** Inserted columns in the projected text, measured in UTF-16. */
  insertions?: { line: number; column: number; length: number }[];
}

// Each unit's text split into lines, once, for turning Luau's columns into the document's.
const unitTextLines = new WeakMap<LuauTextUnit, string[]>();

/**
 * The document position of a position in a unit's text. Luau counts a column
 * in UTF-8 bytes and the document in UTF-16 code units; a unit's line holds
 * each of its characters at the character's document column.
 */
export function textDocumentPosition(unit: LuauTextUnit, position: { line: number; column: number }): { line: number; character: number } {
  const index = Math.min(Math.max(position.line, 0), unit.lines.length - 1);
  let lines = unitTextLines.get(unit);
  if (!lines) {
    lines = unit.text.split("\n");
    unitTextLines.set(unit, lines);
  }
  const column = utf16Column(lines[index] ?? "", position.column);
  const inserted = (unit.insertions ?? []).filter((i) => i.line === index)
    .reduce((sum, i) => sum + Math.min(i.length, Math.max(0, column - i.column)), 0);
  return { line: unit.lines[index] ?? 0, character: column - inserted };
}

/** Remove only the official parser's blocks at recorded synthetic do/end spans. */
export function normalizeNarrativeReturnScopes(root: Json, unit: LuauTextUnit): Json {
  const scopes = unit.returnScopes ?? [];
  if (!scopes.length) return root;
  const lines = unit.text.split("\n");
  const key = (begin: { line: number; character: number }, end: { line: number; character: number }) => `${begin.line}:${begin.character}-${end.line}:${end.character}`;
  const expected = new Set(scopes.map((s) => key(s.begin, s.end)));
  const matched = new Set<string>();
  const scopeOf = (value: { [key: string]: Json }): string | undefined => {
    const m = String(value["location"]).match(/^(\d+),(\d+) - (\d+),(\d+)$/);
    if (!m) return undefined;
    const position = (line: string, column: string) => ({ line: Number(line), character: utf16Column(lines[Number(line)] ?? "", Number(column)) });
    const span = key(position(m[1]!, m[2]!), position(m[3]!, m[4]!));
    return expected.has(span) ? span : undefined;
  };
  const visit = (value: Json): Json => {
    if (Array.isArray(value)) return value.flatMap((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const scope = scopeOf(item);
        if (scope) {
          if (item["type"] !== "AstStatBlock" || !Array.isArray(item["body"]) || item["body"].length !== 1 ||
            !item["body"][0] || typeof item["body"][0] !== "object" || Array.isArray(item["body"][0]) ||
            item["body"][0]["type"] !== "AstStatReturn" || matched.has(scope)) {
            throw new Error(`Unexpected official narrative-return wrapper at ${scope}`);
          }
          matched.add(scope);
          return [visit(item["body"][0])];
        }
      }
      return [visit(item)];
    });
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, visit(item)]));
  };
  const normalized = visit(root);
  if (matched.size !== expected.size) throw new Error(`Official narrative-return wrappers missing: ${[...expected].filter((s) => !matched.has(s)).join(", ")}`);
  return normalized;
}

/** Project narrative returns as isolated blocks without introducing bindings. */
function projectNarrativeReturns(unit: LuauTextUnit, returns: { from: number; to: number }[], index: LineIndex): void {
  const original = unit.text.split("\n");
  const starts = [0];
  for (let i = 0; i < original.length - 1; i++) starts.push(starts[i]! + original[i]!.length + 1);
  const edits: { at: number; text: string; id: number; opening: boolean }[] = [];
  for (const returned of returns) {
    const firstLine = index.lineAt(returned.from);
    const lastLine = index.lineAt(Math.max(returned.from, returned.to - 1));
    const first = unit.lines.indexOf(firstLine);
    const last = unit.lines.indexOf(lastLine);
    if (first < 0) continue;
    if (last < first) throw new Error(`Narrative return end missing from ${unit.kind} projection at ${returned.to}`);
    const from = starts[first]! + returned.from - index.starts[firstLine]!;
    const to = starts[last]! + returned.to - index.starts[lastLine]!;
    if (unit.text.slice(from, from + 6) !== "return") throw new Error(`Narrative return missing from ${unit.kind} projection at ${returned.from}`);
    const id = edits.length / 2;
    edits.push({ at: from, text: "do ", id, opening: true }, { at: to, text: " end", id, opening: false });
  }
  if (!edits.length) return;
  edits.sort((a, b) => a.at - b.at || Number(a.opening) - Number(b.opening));
  let out = "";
  let previous = 0;
  const spans = new Map<number, { from: number; to: number }>();
  const inserted: { from: number; length: number }[] = [];
  for (const edit of edits) {
    out += unit.text.slice(previous, edit.at);
    const from = out.length;
    out += edit.text;
    inserted.push({ from, length: edit.text.length });
    if (edit.opening) spans.set(edit.id, { from, to: from });
    else spans.get(edit.id)!.to = out.length;
    previous = edit.at;
  }
  out += unit.text.slice(previous);
  unit.text = out;
  const projected = new LineIndex(out);
  const position = (at: number) => {
    const line = projected.lineAt(at);
    return { line, character: at - projected.starts[line]! };
  };
  unit.returnScopes = [...spans.values()].map((s) => ({ begin: position(s.from), end: position(s.to) }));
  unit.insertions = inserted.map((i) => ({ line: position(i.from).line, column: position(i.from).character, length: i.length }));
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
// An unavailable artifact must still let the official suite collect its
// visible skip; calling the default oracle without it is a test setup error.
const parseOfficial = officialLuauAvailable ? await loadOfficialLuau() : undefined;

/** Whether a parameter list's text, brackets included, is a Luau parameter list as written. */
function parsesAsParameters(text: string): boolean {
  let whole = wholeLists.get(text);
  if (whole === undefined) {
    if (!parseOfficial) throw new Error("Official Luau parser artifact is unavailable");
    whole = parseOfficial(`local function __parameters${text} end`).errors === 0;
    if (wholeLists.size >= 1000) wholeLists.clear();
    wholeLists.set(text, whole);
  }
  return whole;
}

/** The Luau a `.sd` file holds, as units. */
export interface CheckerTextUnits {
  prelude: LuauTextUnit;
  /** One unit per scene or branch that holds Luau statements. */
  flows: LuauTextUnit[];
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
  /** The `end` that closes the flow, if one does. */
  end?: SyntaxNode;
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
export function checkerTextUnits(tree: Tree, documentText: string, validParameters: (text: string) => boolean = parsesAsParameters): CheckerTextUnits {
  const index = new LineIndex(documentText);
  // Grammar/source ownership is independent of the converter being checked.
  // A real function body keeps Luau's final-return rule. Narrative returns
  // instead stand in their own islands, including a return after another
  // statement on the same marked line.
  const narrativeReturns: { from: number; to: number }[] = [];
  const cursor = tree.cursor();
  do {
    if (cursor.name !== "LuauReturnStatement" && cursor.name !== "LuauSparkdownReturnStatement") continue;
    let inFunction = false;
    for (let parent = cursor.node.parent; parent; parent = parent.parent) {
      if (parent.name === "LuauFunctionBody") { inFunction = true; break; }
    }
    if (inFunction) continue;
    const text = documentText.slice(cursor.from, cursor.to);
    const from = cursor.from + text.length - text.trimStart().length;
    let to = from + 6;
    const lastToken = (node: SyntaxNode) => {
      if (COMMENT.test(node.name) || (NEUTRAL.test(node.name) && !node.name.startsWith("Punctuation"))) return;
      if (!node.firstChild && node.to > node.from) to = Math.max(to, node.to);
      for (let child = node.firstChild; child; child = child.nextSibling) lastToken(child);
    };
    lastToken(cursor.node);
    narrativeReturns.push({ from, to });
  } while (cursor.next());
  const anyName = ANY_NAMES.find((name) => !namesIdentifier(documentText, name)) ?? ANY_NAMES[0]!;
  const isSparkdownOnly = (node: SyntaxNode): boolean => {
    const name = node.name;
    if (SPARKDOWN_ONLY.has(name)) return true;
    if (name === "LuauScopeModifier") {
      const text = documentText.slice(node.from, node.to).trim();
      return !LUAU_SCOPE_MODIFIERS.has(text);
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
    // A function Sparkdown declares with no parameter list (`function greet`
    // with its body on the lines after) is Luau's `function greet()`: the
    // list is written past the end of the header's line, so every column
    // stays where it is, or in place of a comment that ends the line
    // (`function greet -- note`), which the check does not need.
    const addParameterLists = (n: SyntaxNode) => {
      if (n.name === "LuauFunctionDefinition") {
        const content = n.getChild("LuauFunctionDefinition_content");
        const body = content?.getChild("LuauFunctionBody");
        if (content && body && !content.getChild("LuauFunctionParameters")) {
          // The last part of the header: its name, or a comment after it.
          let last = body.prevSibling;
          while (last && NEUTRAL.test(last.name)) last = last.prevSibling;
          if (last) {
            const line = index.lineAt(Math.max(last.from, last.to - 1));
            if (COMMENT.test(last.name)) {
              if (index.lineAt(last.from) === line) {
                lines.mark(last.from, last.to, false);
                lines.write(last.from, "()");
              }
            } else if (!documentText.slice(last.to, index.lineEnd(line)).trim()) {
              lines.write(last.to, "()", true);
            }
          }
        }
      }
      for (let child = n.firstChild; child; child = child.nextSibling) addParameterLists(child);
    };
    addParameterLists(node);
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
    if (validParameters(documentText.slice(node.from, node.to))) return { node, whole: true, vararg: varargOf(node) };
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
      // A branch's `end` closes the branch, not the flow it is checked in.
      const closed = open.pop();
      if (closed && !open.includes(closed)) closed.end = node;
    } else if (node.name === "LuauFunctionDefinition") {
      keepLuau(prelude, node);
    } else if (LUAU_STATEMENTS.has(node.name)) {
      keepLuau(open[open.length - 1]?.body ?? prelude, node);
    }
  }

  const preludeLines = prelude.build();
  const units: CheckerTextUnits = {
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
    // The function ends at the flow's own `end`, at its column, so an error
    // Luau reports at the `end` (a type missing before it) is placed there.
    if (flow.end) {
      const endText = documentText.slice(flow.end.from, flow.end.to);
      const at = flow.end.from + endText.length - endText.trimStart().length;
      const endLine = index.lineAt(at);
      text.push(...bodyLines.text, `${" ".repeat(at - index.starts[endLine]!)}end`);
      lines.push(...bodyLines.lines, endLine);
    } else {
      text.push(...bodyLines.text, "end");
      lines.push(...bodyLines.lines, bodyLines.lines[bodyLines.lines.length - 1] ?? headerLine);
    }
    units.flows.push({ kind: "flow", text: text.join("\n"), lines, syntheticEnd: flow.end === undefined });
  }
  for (const unit of [units.prelude, ...units.flows]) projectNarrativeReturns(unit, narrativeReturns, index);
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
