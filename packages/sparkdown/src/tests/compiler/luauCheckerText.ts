import type { SyntaxNode, Tree } from "@lezer/common";
import type { Json } from "./officialLuau";
import { loadOfficialLuau, officialLuauAvailable } from "./officialLuau";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { opensAlternator } from "../../compiler/utils/alternatorDecision";
import { scopeOf } from "../../compiler/utils/declarationOnly";
import { FLOW_HEADERS, LUAU_SCOPE_MODIFIERS, LUAU_STATEMENTS, NEUTRAL, SPARKDOWN_EXPRESSIONS, SPARKDOWN_ONLY } from "../../compiler/typecheck/LuauUnitNodes";

const grammarNames = new Set(Object.keys(GRAMMAR_DEFINITION.repository));
const ordinaryNames = new Map<string, string>();
for (const name of grammarNames) {
  const original =
    name.startsWith("LuauSparkdownExplicit") ? "Luau" + name.slice("LuauSparkdownExplicit".length)
    : name.startsWith("SparkdownExplicit") ? name.slice("SparkdownExplicit".length) : undefined;
  if (original && grammarNames.has(original)) ordinaryNames.set(name, original);
}
function oracleName(name: string): string {
  const at = name.indexOf("_");
  const root = at < 0 ? name : name.slice(0, at);
  return (ordinaryNames.get(root) ?? root) + (at < 0 ? "" : name.slice(at));
}

export interface LuauTextUnit {
  kind: "file" | "prelude" | "flow";
  text: string;
  lines: number[];
  syntheticEnd?: boolean;
  returnScopes?: { begin: { line: number; character: number }; end: { line: number; character: number } }[];
  insertions?: { line: number; column: number; length: number }[];
  rawIslands?: { text: string; lines: number[] }[];
}

export function rawIslandSyntaxErrors(unit: LuauTextUnit) {
  if (!parseOfficial) throw new Error("Official Luau parser artifact is unavailable");
  return (unit.rawIslands ?? []).flatMap((island) => {
    const textLines = island.text.split("\n");
    return parseOfficial(island.text).diagnostics.map((error) => ({
      message: error.message,
      range: {
        start: { line: island.lines[error.location.begin.line] ?? island.lines.at(-1)!, character: utf16Column(textLines[error.location.begin.line] ?? "", error.location.begin.column) },
        end: { line: island.lines[error.location.end.line] ?? island.lines.at(-1)!, character: utf16Column(textLines[error.location.end.line] ?? "", error.location.end.column) },
      },
    }));
  });
}

const unitTextLines = new WeakMap<LuauTextUnit, string[]>();

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

function projectNarrativeReturns(unit: LuauTextUnit, returns: { from: number; to: number; close: number; writtenCloser: boolean; islandFrom: number }[], markers: { from: number; to: number }[], index: LineIndex): void {
  const original = unit.text.split("\n");
  for (const returned of returns) {
    const line = index.lineAt(Math.max(returned.from, returned.to - 1));
    const projected = unit.lines.indexOf(line);
    if (projected < 0) continue;
    const column = returned.to - index.starts[line]!;
    original[projected] = original[projected]!.slice(0, column).padEnd(column) + index.text.slice(returned.to, index.lineEnd(line));
    let previous = projected;
    const last = index.lineAt(Math.max(returned.to - 1, returned.close - 1));
    for (let continued = line + 1; continued <= last; continued++) {
      let at = unit.lines.indexOf(continued);
      if (at < 0) {
        at = previous + 1;
        unit.lines.splice(at, 0, continued);
        original.splice(at, 0, "");
      }
      original[at] = index.text.slice(index.starts[continued], index.lineEnd(continued));
      previous = at;
    }
  }
  for (const marker of markers) {
    const line = index.lineAt(marker.from);
    const projected = unit.lines.indexOf(line);
    if (projected < 0) continue;
    const from = marker.from - index.starts[line]!;
    const to = marker.to - index.starts[line]!;
    const text = original[projected]!;
    original[projected] = text.slice(0, from) + " ".repeat(to - from) + text.slice(to);
  }
  const islands = new Map<number, { text: string; lines: number[] }>();
  for (const returned of returns) {
    if (!returned.writtenCloser) continue;
    const firstLine = index.lineAt(returned.islandFrom);
    const lastLine = index.lineAt(Math.max(returned.close - 1, returned.to - 1));
    const first = unit.lines.indexOf(firstLine);
    const last = unit.lines.indexOf(lastLine);
    if (first < 0) continue;
    if (last < first) throw new Error("Written return island missing from projection");
    const text = original.slice(first, last + 1);
    const column = returned.islandFrom - index.starts[firstLine]!;
    text[0] = " ".repeat(column) + text[0]!.slice(column);
    islands.set(returned.islandFrom, { text: text.join("\n"), lines: unit.lines.slice(first, last + 1) });
  }
  unit.rawIslands = [...islands.values()];
  unit.text = original.join("\n");
  const starts = [0];
  for (let i = 0; i < original.length - 1; i++) starts.push(starts[i]! + original[i]!.length + 1);
  const edits: { at: number; text: string; id: number; opening: boolean }[] = [];
  for (const returned of returns) {
    if (returned.writtenCloser) continue;
    const firstLine = index.lineAt(returned.from);
    const lastLine = index.lineAt(Math.max(returned.from, returned.to - 1, returned.close - 1));
    const first = unit.lines.indexOf(firstLine);
    const last = unit.lines.indexOf(lastLine);
    if (first < 0) continue;
    if (last < first) throw new Error(`Narrative return end missing from ${unit.kind} projection at ${returned.to}`);
    const from = starts[first]! + returned.from - index.starts[firstLine]!;
    const to = starts[last]! + returned.close - index.starts[lastLine]!;
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


const ATOMIC = /^Luau(?!.*TargetTypeCastAfterComment$)\w*(String|Comment)$/;

const COMMENT = /^Luau(?!.*TargetTypeCastAfterComment$)\w*Comment$/;

const ANY_NAMES = ["_G", "_H", "_J", "_K", "_Q", "_V", "_W", "_X", "_Y", "_Z"];

function namesIdentifier(text: string, name: string): boolean {
  for (let at = text.indexOf(name); at >= 0; at = text.indexOf(name, at + 1)) {
    if (!/\w/.test(text[at - 1] ?? "") && !/\w/.test(text[at + name.length] ?? "")) return true;
  }
  return false;
}

const wholeLists = new Map<string, boolean>();
const parseOfficial = officialLuauAvailable ? await loadOfficialLuau() : undefined;

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

export interface CheckerTextUnits {
  prelude: LuauTextUnit;
  flows: LuauTextUnit[];
  anyName: string;
}

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

class UnitLines {
  private readonly spans = new Map<number, number[]>();
  private readonly writes = new Map<number, { column: number; text: string }[]>();
  private readonly verbatim = new Set<number>();

  constructor(private readonly index: LineIndex) {}

  keepVerbatim(from: number, to: number): void {
    const first = this.index.lineAt(from);
    const last = this.index.lineAt(Math.max(from, to - 1));
    if (first === last) return;
    for (let line = first; line <= last; line++) this.verbatim.add(line);
  }

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

  write(offset: number, text: string, pastEnd = false): void {
    const line = this.index.lineAt(offset);
    const column = offset - this.index.starts[line]!;
    const room = this.index.lineEnd(line) - offset;
    const writes = this.writes.get(line) ?? this.writes.set(line, []).get(line)!;
    writes.push({ column, text: pastEnd ? text : text.slice(0, Math.max(room, 0)) });
  }

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

interface Vararg {
  dots: SyntaxNode;
  annotation: SyntaxNode | undefined;
  type: string;
}

type ParameterReading =
  | { node: SyntaxNode; whole: true; vararg: Vararg | undefined }
  | { node: SyntaxNode; whole: false; names: string[]; vararg: Vararg | undefined };

interface Flow {
  header: SyntaxNode;
  parameters: ParameterReading | undefined;
  body: UnitLines;
  varargs: Vararg[];
  variadic: boolean;
  end?: SyntaxNode;
  sceneVararg?: Vararg;
}

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

export function checkerTextUnits(tree: Tree, documentText: string, validParameters: (text: string) => boolean = parsesAsParameters): CheckerTextUnits {
  const index = new LineIndex(documentText);
  const narrativeReturns: { from: number; to: number; close: number; writtenCloser: boolean; islandFrom: number }[] = [];
  const explicitMarkers: { from: number; to: number }[] = [];
  const cursor = tree.cursor();
  do {
    if (cursor.name === "LuauExplicitStatementMark") explicitMarkers.push({ from: cursor.from, to: cursor.to });
    if (oracleName(cursor.name) !== "LuauReturnStatement") continue;
    let inFunction = false;
    for (let parent = cursor.node.parent; parent; parent = parent.parent) {
      if (parent.name === "LuauFunctionBody") { inFunction = true; break; }
    }
    if (inFunction) continue;
    const text = documentText.slice(cursor.from, cursor.to);
    const from = cursor.from + text.length - text.trimStart().length;
    let to = from + 6;
    let lineComment: number | undefined;
    const lastToken = (node: SyntaxNode) => {
      if (node.name === "LuauLineComment" || node.name === "LuauDocLineComment") lineComment = node.from;
      if (COMMENT.test(node.name) || (NEUTRAL.test(node.name) && !node.name.startsWith("Punctuation"))) return;
      if (!node.firstChild && node.to > node.from) to = Math.max(to, node.to);
      for (let child = node.firstChild; child; child = child.nextSibling) lastToken(child);
    };
    lastToken(cursor.node);
    const line = index.lineAt(Math.max(from, to - 1));
    let lineEnd = index.lineEnd(line);
    let suffix = to;
    let semicolon = false;
    while (suffix < lineEnd) {
      if (/\s/.test(documentText[suffix]!)) { suffix++; continue; }
      if (!semicolon && documentText[suffix] === ";") { semicolon = true; suffix++; continue; }
      if (!documentText.startsWith("--", suffix)) break;
      const long = documentText.slice(suffix + 2, lineEnd).match(/^\[(=*)\[/);
      if (!long) { lineComment = suffix; break; }
      const end = documentText.indexOf(`]${long[1]}]`, suffix + 2 + long[0].length);
      if (end < 0) break;
      suffix = end + long[1]!.length + 2;
      lineEnd = index.lineEnd(index.lineAt(Math.max(suffix - 1, 0)));
    }
    let writtenCloser = false;
    const content = cursor.node.parent;
    if (content?.name === "LuauSparkdownExplicitStatement_content") {
      let first = content.firstChild;
      while (first && NEUTRAL.test(first.name)) first = first.nextSibling;
      let following = cursor.node.nextSibling;
      while (following && NEUTRAL.test(following.name)) following = following.nextSibling;
      const until = following ? findDescendant(following, "LuauUntilKeyword") : undefined;
      writtenCloser = first?.name === "LuauRepeatKeyword" && !!until && index.lineAt(until.from) === line;
    }
    for (let parent = cursor.node.parent; parent; parent = parent.parent) {
      if (writtenCloser) break;
      if (["LuauRepeatLoop", "LuauSparkdownRepeatLoop", "LuauSparkdownExplicitRepeatLoop"].includes(parent.name)) {
        const end = parent.getChild(`${parent.name}_end`);
        const until = end ? findDescendant(end, "LuauUntilKeyword") : undefined;
        writtenCloser = !!until && until.from >= to && index.lineAt(until.from) === line;
        break;
      }
      if (!["LuauSparkdownDoBlock", "LuauDoBlock", "LuauSparkdownExplicitDoBlock", "LuauIfBlock", "LuauSparkdownIfBlock", "LuauSparkdownExplicitIfBlock"].includes(parent.name)) continue;
      const end = parent.getChild(`${parent.name}_end`);
      const keyword = end ? findDescendant(end, "LuauEndKeyword") : undefined;
      if (keyword && keyword.from >= to && index.lineAt(keyword.from) === line) writtenCloser = true;
      break;
    }
    let islandFrom = from;
    for (let parent = cursor.node.parent; parent; parent = parent.parent) {
      if (parent.name === "LuauSparkdownExplicitStatement") islandFrom = parent.from;
    }
    narrativeReturns.push({ from, to, close: lineComment ?? lineEnd, writtenCloser, islandFrom });
  } while (cursor.next());
  const anyName = ANY_NAMES.find((name) => !namesIdentifier(documentText, name)) ?? ANY_NAMES[0]!;
  const isSparkdownOnly = (node: SyntaxNode): boolean => {
    const name = oracleName(node.name);
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
        else if (SPARKDOWN_EXPRESSIONS.has(oracleName(child.name)) && opensAlternator(child)) replaceWithAny(child);
        else if (isSparkdownOnly(child)) lines.mark(child.from, child.to, false);
        else blankWithin(child);
      }
    };
    const keepInterpolations = (n: SyntaxNode) => {
      for (let child = n.firstChild; child; child = child.nextSibling) {
        if (child.name === "LuauBacktickFunctionCallShorthand") lines.mark(child.from, child.to, false);
        else if (child.name === "LuauBacktickStringInterpolation") blankWithin(child);
        else keepInterpolations(child);
      }
    };
    const replaceWithAny = (expression: SyntaxNode) => {
      lines.mark(expression.from, expression.to, false);
      const text = documentText.slice(expression.from, expression.to);
      const at = expression.from + text.length - text.trimStart().length;
      const room = Math.min(expression.to, index.lineEnd(index.lineAt(at))) - at;
      lines.write(at, room >= 4 ? `${anyName}()` : room >= 2 ? anyName : "");
    };
    blankWithin(node);
    const addParameterLists = (n: SyntaxNode) => {
      if (n.name === "LuauFunctionDefinition") {
        const content = n.getChild("LuauFunctionDefinition_content");
        const body = content?.getChild("LuauFunctionBody");
        if (content && body && !content.getChild("LuauFunctionParameters")) {
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

  const readParameters = (header: SyntaxNode): ParameterReading | undefined => {
    const node = findDescendant(header, "LuauFunctionParameters");
    if (!node) return undefined;
    if (validParameters(documentText.slice(node.from, node.to))) return { node, whole: true, vararg: varargOf(node) };
    const dots = findDescendant(node, "LuauVariadicParameter");
    const names = findAll(node, "LuauFunctionParameter").map((name) => documentText.slice(name.from, name.to));
    return { node, whole: false, names, vararg: dots ? { dots, annotation: undefined, type: "" } : undefined };
  };

  const varargOf = (parameters: SyntaxNode): Vararg | undefined => {
    const dots = findAll(parameters, "LuauVariadicParameter", true)[0];
    if (!dots) return undefined;
    let annotation = dots.nextSibling;
    while (annotation && (NEUTRAL.test(annotation.name) || COMMENT.test(annotation.name))) annotation = annotation.nextSibling;
    if (!annotation || oracleName(annotation.name) !== "LuauTypeAnnotationOperation") return { dots, annotation: undefined, type: "" };
    return { dots, annotation, type: documentText.slice(annotation.from, annotation.to).replace(/^\s*:/, "").trim() };
  };

  const declareParameters = (flow: Flow, header: SyntaxNode) => {
    const parameters = readParameters(header);
    if (!parameters) return;
    if (parameters.vararg) flow.varargs.push(parameters.vararg);
    const text = documentText.slice(header.from, header.to);
    const start = header.from + text.length - text.trimStart().length;
    if (!parameters.whole) {
      if (parameters.names.length) flow.body.write(start, `local ${parameters.names.map((name) => `${name}: any`).join(", ")}`, true);
      return;
    }
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
    flow.body.write(end, ` = ${named.map(() => anyName).join(", ")}`, true);
  };

  const prelude = new UnitLines(index);
  const flows: Flow[] = [];
  const open: Flow[] = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (FLOW_HEADERS.has(node.name)) {
      const enclosing = open[open.length - 1];
      if (enclosing && node.name === "Branch") {
        const scene = enclosing;
        const own = scene.variadic ? scene.varargs[0] : undefined;
        const branchVararg = readParameters(node)?.vararg;
        const flow: Flow = {
          header: scene.header,
          parameters: scene.parameters,
          body: new UnitLines(index),
          varargs: own && !branchVararg ? [own] : [],
          variadic: own !== undefined && branchVararg === undefined,
          ...(own && branchVararg ? { sceneVararg: own } : {}),
        };
        declareParameters(flow, node);
        flows.push(flow);
        open.push(flow);
      } else {
        const parameters = readParameters(node);
        const own = parameters?.vararg;
        const flow: Flow = { header: node, parameters, body: new UnitLines(index), varargs: own ? [own] : [], variadic: own !== undefined };
        flows.push(flow);
        open.push(flow);
      }
    } else if (node.name === "LuauEndKeyword") {
      const closed = open.pop();
      if (closed && !open.includes(closed)) closed.end = node;
    } else if (node.name === "LuauFunctionDefinition" && (open.length === 0 || scopeOf(node, (from, to) => documentText.slice(from, to)) !== "local")) {
      keepLuau(prelude, node);
    } else if (LUAU_STATEMENTS.has(oracleName(node.name)) || node.name === "LuauFunctionDefinition") {
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
    if (bodyLines.text.length === 0) continue;
    const headerLine = index.lineAt(flow.header.from);
    const text: string[] = ["local function __flow"];
    const lines: number[] = [headerLine];
    const agreed = new Set(flow.varargs.map((vararg) => vararg.type)).size === 1;
    const parameters = flow.parameters;
    let cut = Number.POSITIVE_INFINITY;
    if (flow.sceneVararg) {
      let separator = flow.sceneVararg.dots.prevSibling;
      while (separator && separator.name !== "LuauCommaSeparator") separator = separator.prevSibling;
      cut = separator ? separator.from : flow.sceneVararg.dots.from;
    }
    if (parameters?.whole) {
      const line = new UnitLines(index);
      line.mark(parameters.node.from, parameters.node.to, true);
      if (flow.sceneVararg) line.mark(cut, parameters.node.to - 1, false);
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
    const branchVararg = flow.variadic ? undefined : flow.varargs[0];
    if (branchVararg) {
      const named =
        parameters &&
        (parameters.whole
          ? findAll(parameters.node, "LuauFunctionParameter", true).some((name) => name.from < cut)
          : parameters.names.length > 0);
      text[text.length - 1] = text[text.length - 1]!.replace(/\)$/, named ? "," : "");
      const line = new UnitLines(index);
      line.mark(branchVararg.dots.from, branchVararg.dots.to, true);
      if (branchVararg.annotation && agreed) line.mark(branchVararg.annotation.from, branchVararg.annotation.to, true);
      const built = line.build();
      built.text[built.text.length - 1] += ")";
      text.push(...built.text);
      lines.push(...built.lines);
    }
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
  for (const unit of [units.prelude, ...units.flows]) projectNarrativeReturns(unit, narrativeReturns, explicitMarkers, index);
  return units;
}

function findDescendant(node: SyntaxNode, name: string): SyntaxNode | undefined {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (oracleName(child.name) === name) return child;
    const found = findDescendant(child, name);
    if (found) return found;
  }
  return undefined;
}

function findAll(node: SyntaxNode, name: string, outsideAnnotations = false, found: SyntaxNode[] = []): SyntaxNode[] {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (oracleName(child.name) === name) found.push(child);
    else if (!outsideAnnotations || oracleName(child.name) !== "LuauTypeAnnotationOperation") findAll(child, name, outsideAnnotations, found);
  }
  return found;
}
