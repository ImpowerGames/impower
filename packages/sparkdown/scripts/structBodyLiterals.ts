// The TypeScript mode of the struct-body converter (#1230): rewrites the
// Sparkdown held in the string literals of a TypeScript source with
// `rewriteStructBodies`, and leaves the TypeScript around it untouched.
//
// The literal shapes it reads:
//   - a template literal (`` `layout hud with …` ``), its Sparkdown starting
//     right after the backtick or on a later line;
//   - a quoted string with escaped newlines (`"style s with\n  …\nend"`);
//   - an array of quoted lines joined with a newline
//     (`["style s with", "  > a:", "end"].join("\n")`).
//
// Each literal is decoded to the text it holds, rewritten, and encoded back
// in its own quoting. The rewrite says which source line each line of its
// result was written from, so a line it keeps keeps its source spelling,
// escapes included, and only the lines it changes or adds are spelled anew.
// In an array, each element keeps the text between it and the element before
// it, comments included.
//
// A template literal spliced together from `${…}` fragments stands in the
// text with a marker for each fragment. A declaration whose body holds one
// is reported and the literal left for a hand edit, whether or not the rest
// of the body needs a rewrite, because what the fragment holds decides the
// body's shape and cannot be checked here. A literal inside a fragment is
// rewritten first, and its rewrite is kept in the fragment's spelling. A
// tagged template, whose text the tag reads, is reported the same way when
// it holds an old form.
//
// This script is deleted with the indented forms by the last slice of #1222.

import ts from "typescript";
import { rewriteStructBodies } from "./structBodyRewrite";

export type LiteralShape = "template" | "string" | "lines";

export interface LiteralReport {
  /** 1-based line of the TypeScript source the literal starts on. */
  line: number;
  shape: LiteralShape;
  /** Struct-body declarations it holds, and how many were rewritten. */
  declarations: number;
  converted: number;
}

export interface LiteralRefusal {
  /** 1-based line of the TypeScript source. */
  line: number;
  reason: string;
}

export interface TypeScriptRewrite {
  text: string;
  /** Every literal that holds a struct-body declaration. */
  literals: LiteralReport[];
  refusals: LiteralRefusal[];
}

/**
 * Compares the Sparkdown of a literal before and after its rewrite and
 * returns where the two programs differ; an empty list keeps the rewrite.
 */
export type Verify = (before: string, after: string) => string[];

// A line that ends a declaration header (`… with`), which a literal holding
// Sparkdown with a struct body must have.
const HEADER_LINE = /\bwith[ \t]*(?:(?:--|\/\/)[^\n]*)?\r?\n/;

const SPLICED =
  "a struct body that holds a `${…}` fragment, which the converter can neither rewrite nor check; convert or confirm it by hand";

/** One character or escape of a literal: its source spelling, the text it
 *  holds, and where its spelling starts in the TypeScript source. */
interface Piece {
  raw: string;
  cooked: string;
  pos: number;
  /** The index of the `${…}` fragment this piece stands for. */
  splice?: number;
}

interface Line {
  pieces: Piece[];
  /** The line break after the line, or undefined for the last line. */
  eol?: Piece;
}

class Unreadable extends Error {}

const SIMPLE_ESCAPES: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  v: "\v",
  "0": "\0",
  "\n": "",
  "\r": "",
  " ": "",
  " ": "",
};

/** Decodes the spelling of a string or template literal part, or throws
 *  `Unreadable` for an escape it cannot read. */
function decode(raw: string, pos: number, template: boolean, out: Piece[]) {
  const hex = (s: string) => {
    if (!/^[0-9A-Fa-f]+$/.test(s)) throw new Unreadable(`an escape \`${s}\` it cannot read`);
    const n = parseInt(s, 16);
    if (n > 0x10ffff) throw new Unreadable(`an escape \`${s}\` it cannot read`);
    return String.fromCodePoint(n);
  };
  let k = 0;
  while (k < raw.length) {
    const c = raw[k]!;
    const at = pos + k;
    if (c === "\\") {
      const n = raw[k + 1] ?? "";
      let len = 2;
      let cooked: string;
      if (n === "x") {
        len = 4;
        cooked = hex(raw.slice(k + 2, k + 4));
      } else if (n === "u" && raw[k + 2] === "{") {
        const close = raw.indexOf("}", k);
        if (close < 0) throw new Unreadable("an unclosed `\\u{` escape");
        len = close - k + 1;
        cooked = hex(raw.slice(k + 3, close));
      } else if (n === "u") {
        len = 6;
        cooked = hex(raw.slice(k + 2, k + 6));
      } else if (n === "\r" && raw[k + 2] === "\n") {
        len = 3;
        cooked = "";
      } else {
        cooked = SIMPLE_ESCAPES[n] ?? n;
      }
      out.push({ raw: raw.slice(k, k + len), cooked, pos: at });
      k += len;
    } else if (template && c === "\r") {
      // A template's source line break is a newline whatever its spelling.
      const len = raw[k + 1] === "\n" ? 2 : 1;
      out.push({ raw: raw.slice(k, k + len), cooked: "\n", pos: at });
      k += len;
    } else {
      out.push({ raw: c, cooked: c, pos: at });
      k++;
    }
  }
}

function splitLines(pieces: Piece[]): Line[] {
  const lines: Line[] = [{ pieces: [] }];
  for (const piece of pieces) {
    if (piece.splice === undefined && piece.cooked === "\n") {
      lines[lines.length - 1]!.eol = piece;
      lines.push({ pieces: [] });
    } else {
      lines[lines.length - 1]!.pieces.push(piece);
    }
  }
  return lines;
}

const cookedOf = (line: Line) => line.pieces.map((p) => p.cooked).join("");
const rawOf = (line: Line) => line.pieces.map((p) => p.raw).join("");

/**
 * Gives each fragment piece a marker that occurs nowhere else in the
 * literal's text, so authored text never reads as a fragment.
 */
function markSplices(pieces: Piece[]): void {
  const text = pieces.filter((p) => p.splice === undefined).map((p) => p.cooked).join("");
  let nonce = 0;
  while (text.includes(`__splice${nonce}_`)) nonce++;
  for (const piece of pieces) {
    if (piece.splice !== undefined) piece.cooked = `__splice${nonce}_${piece.splice}__`;
  }
}

/** Spells one new line of text for a literal quoted with `quote`. */
function encode(text: string, quote: string): string {
  let out = "";
  for (let k = 0; k < text.length; k++) {
    const c = text[k]!;
    if (c === "\\") out += "\\\\";
    else if (c === quote) out += `\\${c}`;
    else if (c === "\r") out += "\\r";
    else if (c === "\t" && quote !== "`") out += "\\t";
    else if (quote === "`" && c === "$" && text[k + 1] === "{") out += "\\$";
    else out += c;
  }
  return out;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

interface Rewritten {
  /** The new lines of text. */
  lines: string[];
  /** For each new line, the literal's line it was written from, or `null`
   *  for an added line. */
  origins: (number | null)[];
}

/**
 * Rewrites the Sparkdown in the literals of the TypeScript source `source`.
 * `verify`, when given, compares each rewritten literal's program with its
 * original's, and a literal whose programs differ is left as it was.
 */
export function rewriteTypeScriptLiterals(
  source: string,
  fileName = "source.ts",
  verify?: Verify,
): TypeScriptRewrite {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lineAt = (pos: number) => file.getLineAndCharacterOfPosition(pos).line + 1;
  const literals: LiteralReport[] = [];
  const refusals: LiteralRefusal[] = [];
  const edits: Edit[] = [];

  /** `source` between `from` and `to`, with the edits queued inside it. */
  const edited = (from: number, to: number) => {
    let text = source.slice(from, to);
    const inside = edits.filter((e) => e.start >= from && e.end <= to).sort((a, b) => b.start - a.start);
    for (const e of inside) text = text.slice(0, e.start - from) + e.text + text.slice(e.end - from);
    return text;
  };

  /**
   * Rewrites the text of one literal, given as lines of pieces. Returns the
   * new lines, or null when nothing changes or the literal is refused, after
   * reporting it.
   */
  const rewriteLines = (lines: Line[], shape: LiteralShape, start: number): Rewritten | null => {
    const before = lines.map(cookedOf);
    const text = before.join("\n");
    if (!HEADER_LINE.test(text)) return null;
    const result = rewriteStructBodies(text);
    if (result.declarations === 0) return null;
    const lineOf = (index: number) => {
      const line = lines[index];
      const piece = line?.pieces[0] ?? line?.eol;
      return lineAt(piece ? piece.pos : start);
    };
    const report: LiteralReport = {
      line: lineAt(start),
      shape,
      declarations: result.declarations,
      converted: result.converted,
    };
    literals.push(report);
    for (const r of result.refusals) {
      refusals.push({ line: lineOf(r.line - 1), reason: `refused the declaration at line ${lineOf(r.declaration - 1)}: ${r.reason}` });
    }
    // A fragment in a body decides the body's shape, so such a body is
    // reported even when the rest of it needs no rewrite.
    for (const { header, end } of result.bodies) {
      const spliced = lines.slice(header + 1, end + 1).some((l) => l.pieces.some((p) => p.splice !== undefined));
      if (spliced) {
        refusals.push({ line: lineOf(header), reason: SPLICED });
        report.converted = 0;
        return null;
      }
    }
    if (result.text === text) return null;
    const differences = verify?.(text, result.text) ?? [];
    if (differences.length > 0) {
      refusals.push({
        line: lineOf(0),
        reason: `the programs differ, so the literal was left as it was:\n    ${differences.join("\n    ")}`,
      });
      report.converted = 0;
      return null;
    }
    return { lines: result.text.split("\n"), origins: result.origins };
  };

  /** Spells new lines of text, keeping the spelling of every kept line. */
  const respell = (lines: Line[], after: Rewritten, quote: string, eol: string) => {
    let out = "";
    after.lines.forEach((text, j) => {
      const origin = after.origins[j];
      const kept = origin !== null && origin !== undefined && cookedOf(lines[origin]!) === text;
      out += kept ? rawOf(lines[origin]!) : encode(text, quote);
      if (j < after.lines.length - 1) {
        const own = origin === null || origin === undefined ? undefined : lines[origin]!.eol;
        out += own ? own.raw : eol;
      }
    });
    return out;
  };

  const visitTemplate = (node: ts.TemplateLiteral) => {
    const startAt = node.getStart(file);
    const tagged = ts.isTaggedTemplateExpression(node.parent);
    const pieces: Piece[] = [];
    // The parts of the template's spelling, with the fragments between them.
    const parts: { from: number; to: number }[] = [];
    const splices: { from: number; to: number }[] = [];
    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      parts.push({ from: startAt + 1, to: node.end - 1 });
    } else {
      parts.push({ from: startAt + 1, to: node.head.end - 2 });
      let from = node.head.end - 2;
      for (const span of node.templateSpans) {
        const literalStart = span.literal.getStart(file);
        splices.push({ from, to: literalStart + 1 });
        const partEnd = span.literal.end - (ts.isTemplateTail(span.literal) ? 1 : 2);
        parts.push({ from: literalStart + 1, to: partEnd });
        from = partEnd;
      }
    }
    if (tagged) {
      // A tag reads the template's spelling, which need not be a readable
      // string, so it is checked as spelled and never rewritten.
      const text = parts.map((p) => source.slice(p.from, p.to)).join("__splice__");
      if (HEADER_LINE.test(text)) {
        const result = rewriteStructBodies(text);
        if (result.text !== text || result.refusals.length > 0) {
          refusals.push({ line: lineAt(startAt), reason: "a tagged template, whose text the tag reads; convert it by hand" });
        }
      }
      return;
    }
    try {
      parts.forEach((part, i) => {
        decode(source.slice(part.from, part.to), part.from, true, pieces);
        const splice = splices[i];
        if (splice) pieces.push({ raw: edited(splice.from, splice.to), cooked: "", pos: splice.from, splice: i });
      });
    } catch (error) {
      if (!(error instanceof Unreadable)) throw error;
      refusals.push({ line: lineAt(startAt), reason: `a template literal with ${error.message}; convert it by hand` });
      return;
    }
    markSplices(pieces);
    const lines = splitLines(pieces);
    const after = rewriteLines(lines, "template", startAt);
    if (!after) return;
    const breaks = lines.flatMap((l) => (l.eol ? [l.eol.raw] : []));
    const eol = breaks.find((b) => b === "\n" || b === "\r\n") ?? breaks[0] ?? "\n";
    // The literals inside the fragments are rewritten in the fragments'
    // spelling, so their own edits are dropped for this one.
    for (let k = edits.length - 1; k >= 0; k--) {
      if (edits[k]!.start >= startAt && edits[k]!.end <= node.end) edits.splice(k, 1);
    }
    edits.push({ start: startAt + 1, end: node.end - 1, text: respell(lines, after, "`", eol) });
  };

  const visitString = (node: ts.StringLiteral) => {
    const startAt = node.getStart(file);
    const quote = source[startAt]!;
    const pieces: Piece[] = [];
    try {
      decode(source.slice(startAt + 1, node.end - 1), startAt + 1, false, pieces);
    } catch (error) {
      if (!(error instanceof Unreadable)) throw error;
      refusals.push({ line: lineAt(startAt), reason: `a string with ${error.message}; convert it by hand` });
      return;
    }
    const lines = splitLines(pieces);
    const after = rewriteLines(lines, "string", startAt);
    if (!after) return;
    const eol = lines.find((l) => l.eol)?.eol?.raw ?? "\\n";
    edits.push({ start: startAt + 1, end: node.end - 1, text: respell(lines, after, quote, eol) });
  };

  /** `["…", "…"].join("\n")`: the array's separator, when every element is
   *  a quoted line, or undefined. */
  const joinedLines = (node: ts.ArrayLiteralExpression) => {
    const access = node.parent;
    if (!ts.isPropertyAccessExpression(access) || access.name.text !== "join") return undefined;
    const call = access.parent;
    if (!ts.isCallExpression(call) || call.expression !== access || call.arguments.length !== 1) return undefined;
    const separator = call.arguments[0]!;
    if (!ts.isStringLiteral(separator) || !/^\r?\n$/.test(separator.text)) return undefined;
    if (node.elements.length === 0) return undefined;
    if (!node.elements.every((e) => ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))) return undefined;
    return separator.text;
  };

  const visitLines = (node: ts.ArrayLiteralExpression, separator: string) => {
    const elements = node.elements as ts.NodeArray<ts.StringLiteral | ts.NoSubstitutionTemplateLiteral>;
    const startAt = elements[0]!.getStart(file);
    const lines: Line[] = [];
    try {
      for (const element of elements) {
        const at = element.getStart(file);
        const pieces: Piece[] = [];
        decode(source.slice(at + 1, element.end - 1), at + 1, ts.isNoSubstitutionTemplateLiteral(element), pieces);
        lines.push({ pieces });
      }
    } catch (error) {
      if (!(error instanceof Unreadable)) throw error;
      refusals.push({ line: lineAt(startAt), reason: `an array of lines with ${error.message}; convert it by hand` });
      return;
    }
    const cooked = lines.map(cookedOf);
    if (cooked.some((l) => l.includes("\n"))) {
      if (HEADER_LINE.test(cooked.join(separator))) {
        refusals.push({ line: lineAt(startAt), reason: "an array of lines with a line break inside an element; convert it by hand" });
      }
      return;
    }
    // A `\r\n` join leaves a `\r` at the end of every line but the last.
    const crlf = separator === "\r\n";
    const joined: Line[] = lines.map((l, i) => ({
      pieces: crlf && i < lines.length - 1 ? [...l.pieces, { raw: "", cooked: "\r", pos: l.pieces[0]?.pos ?? startAt }] : l.pieces,
      eol: i < lines.length - 1 ? { raw: "", cooked: "\n", pos: startAt } : undefined,
    }));
    const after = rewriteLines(joined, "lines", startAt);
    if (!after) return;
    const quote = source[startAt]!;
    const gapAfter = (i: number) => source.slice(elements[i]!.end, elements[i + 1]!.getStart(file));
    // An added element is separated by the first gap that holds no comment.
    let plainGap = ", ";
    for (let i = 0; i + 1 < elements.length; i++) {
      if (!/\/[/*]/.test(gapAfter(i))) {
        plainGap = gapAfter(i);
        break;
      }
    }
    let out = "";
    let lastOrigin = -1;
    after.lines.forEach((text, j) => {
      const origin = after.origins[j];
      const line = crlf ? text.replace(/\r$/, "") : text;
      if (j > 0) {
        // An element keeps the text before it, comments included, and an
        // added element takes a plain gap.
        out += origin !== null && origin !== undefined && origin === lastOrigin + 1 && origin > 0 ? gapAfter(origin - 1) : plainGap;
      }
      if (origin !== null && origin !== undefined) {
        out += cooked[origin] === line ? source.slice(elements[origin]!.getStart(file), elements[origin]!.end) : `${quote}${encode(line, quote)}${quote}`;
        lastOrigin = origin;
      } else {
        out += `${quote}${encode(line, quote)}${quote}`;
      }
    });
    edits.push({ start: startAt, end: elements[elements.length - 1]!.end, text: out });
  };

  const visit = (node: ts.Node) => {
    if (ts.isArrayLiteralExpression(node)) {
      const separator = joinedLines(node);
      if (separator !== undefined) {
        visitLines(node, separator);
        return;
      }
    }
    if (ts.isTemplateExpression(node)) {
      // The literals inside its fragments first, so its own rewrite can
      // carry theirs.
      ts.forEachChild(node, visit);
      visitTemplate(node);
      return;
    }
    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      visitTemplate(node);
    } else if (ts.isStringLiteral(node)) {
      visitString(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  let text = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }
  return { text, literals, refusals };
}
