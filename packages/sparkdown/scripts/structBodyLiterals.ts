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
// in its own quoting: a line the rewrite keeps keeps its source spelling,
// escapes included, and only the lines it changes or adds are spelled anew.
//
// A template literal spliced together from `${…}` fragments is rewritten
// only when no rewritten body holds a fragment: each fragment stands in the
// text as a placeholder name, and a body that holds one is reported and
// left for a hand edit, because what the fragment holds decides the body's
// shape. A tagged template, whose text the tag reads, is reported the same
// way.
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
const PLACEHOLDER = /__splice(\d+)__/g;

/** One character or escape of a literal: its source spelling, the text it
 *  holds, and where its spelling starts in the TypeScript source. */
interface Piece {
  raw: string;
  cooked: string;
  pos: number;
}

interface Line {
  pieces: Piece[];
  /** The line break after the line, or undefined for the last line. */
  eol?: Piece;
}

/** Decodes the spelling of a string or template literal part. */
function decode(raw: string, pos: number, template: boolean, out: Piece[]) {
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
        cooked = String.fromCharCode(parseInt(raw.slice(k + 2, k + 4), 16));
      } else if (n === "u" && raw[k + 2] === "{") {
        const close = raw.indexOf("}", k);
        len = close - k + 1;
        cooked = String.fromCodePoint(parseInt(raw.slice(k + 3, close), 16));
      } else if (n === "u") {
        len = 6;
        cooked = String.fromCharCode(parseInt(raw.slice(k + 2, k + 6), 16));
      } else if (n === "\r" && raw[k + 2] === "\n") {
        len = 3;
        cooked = "";
      } else {
        const simple: Record<string, string> = {
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
        cooked = simple[n] ?? n;
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
    if (piece.cooked === "\n") {
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

/** Pairs of indices of equal lines, the longest common subsequence. */
function commonLines(a: string[], b: string[]): Map<number, number> {
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const pairs = new Map<number, number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.set(j, i);
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) i++;
    else j++;
  }
  return pairs;
}

/** Spells one line of text for a literal quoted with `quote`. */
function encode(text: string, quote: string, splices: string[]): string {
  let out = "";
  let last = 0;
  const spell = (s: string) => {
    for (let k = 0; k < s.length; k++) {
      const c = s[k]!;
      if (c === "\\") out += "\\\\";
      else if (c === quote) out += `\\${c}`;
      else if (c === "\r") out += "\\r";
      else if (c === "\t" && quote !== "`") out += "\\t";
      else if (quote === "`" && c === "$" && s[k + 1] === "{") out += "\\$";
      else out += c;
    }
  };
  for (const match of text.matchAll(PLACEHOLDER)) {
    spell(text.slice(last, match.index));
    out += splices[Number(match[1])]!;
    last = match.index! + match[0].length;
  }
  spell(text.slice(last));
  return out;
}

interface Edit {
  start: number;
  end: number;
  text: string;
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

  /**
   * Rewrites the text of one literal, given as lines of pieces. Returns the
   * new lines of text, or null when nothing changes or the literal is
   * refused, after reporting it.
   */
  const rewriteLines = (lines: Line[], shape: LiteralShape, start: number): string[] | null => {
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
    if (result.text === text) return null;
    for (const { header, end } of result.touched) {
      const spliced = before.slice(header + 1, end + 1).some((l) => /__splice\d+__/.test(l));
      if (spliced) {
        refusals.push({
          line: lineOf(header),
          reason: "a struct body that holds a `${…}` fragment; convert it by hand",
        });
        report.converted = 0;
        return null;
      }
    }
    const differences = verify?.(text, result.text) ?? [];
    if (differences.length > 0) {
      refusals.push({
        line: lineOf(0),
        reason: `the programs differ, so the literal was left as it was:\n    ${differences.join("\n    ")}`,
      });
      report.converted = 0;
      return null;
    }
    return result.text.split("\n");
  };

  /** Spells new lines of text, keeping the spelling of every kept line. */
  const respell = (lines: Line[], after: string[], quote: string, splices: string[], eol: string) => {
    const pairs = commonLines(lines.map(cookedOf), after);
    let out = "";
    after.forEach((text, j) => {
      const i = pairs.get(j);
      out += i === undefined ? encode(text, quote, splices) : rawOf(lines[i]!);
      if (j < after.length - 1) {
        const kept = i === undefined ? undefined : lines[i]!.eol;
        out += kept ? kept.raw : eol;
      }
    });
    return out;
  };

  const visitTemplate = (node: ts.TemplateLiteral) => {
    const startAt = node.getStart(file);
    const pieces: Piece[] = [];
    const splices: string[] = [];
    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      decode(source.slice(startAt + 1, node.end - 1), startAt + 1, true, pieces);
    } else {
      decode(source.slice(startAt + 1, node.head.end - 2), startAt + 1, true, pieces);
      let from = node.head.end - 2;
      for (const span of node.templateSpans) {
        const literalStart = span.literal.getStart(file);
        const placeholder = `__splice${splices.length}__`;
        splices.push(source.slice(from, literalStart + 1));
        pieces.push({ raw: splices[splices.length - 1]!, cooked: placeholder, pos: from });
        const tail = ts.isTemplateTail(span.literal);
        const partEnd = span.literal.end - (tail ? 1 : 2);
        decode(source.slice(literalStart + 1, partEnd), literalStart + 1, true, pieces);
        from = partEnd;
      }
    }
    const lines = splitLines(pieces);
    if (ts.isTaggedTemplateExpression(node.parent)) {
      const text = lines.map(cookedOf).join("\n");
      if (HEADER_LINE.test(text) && rewriteStructBodies(text).text !== text) {
        refusals.push({ line: lineAt(startAt), reason: "a tagged template, whose text the tag reads; convert it by hand" });
      }
      return;
    }
    const after = rewriteLines(lines, "template", startAt);
    if (!after) return;
    const breaks = lines.flatMap((l) => (l.eol ? [l.eol.raw] : []));
    const eol = breaks.find((b) => b === "\n" || b === "\r\n") ?? breaks[0] ?? "\n";
    edits.push({
      start: startAt + 1,
      end: node.end - 1,
      text: respell(lines, after, "`", splices, eol),
    });
  };

  const visitString = (node: ts.StringLiteral) => {
    const startAt = node.getStart(file);
    const quote = source[startAt]!;
    const pieces: Piece[] = [];
    decode(source.slice(startAt + 1, node.end - 1), startAt + 1, false, pieces);
    const lines = splitLines(pieces);
    const after = rewriteLines(lines, "string", startAt);
    if (!after) return;
    const eol = lines.find((l) => l.eol)?.eol?.raw ?? "\\n";
    edits.push({ start: startAt + 1, end: node.end - 1, text: respell(lines, after, quote, [], eol) });
  };

  /** `["…", "…"].join("\n")`: the array, when every element is a quoted
   *  line, or undefined. */
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
    for (const element of elements) {
      const at = element.getStart(file);
      const pieces: Piece[] = [];
      decode(source.slice(at + 1, element.end - 1), at + 1, ts.isNoSubstitutionTemplateLiteral(element), pieces);
      lines.push({ pieces: pieces.map((p) => ({ ...p })) });
    }
    if (lines.some((l) => l.pieces.some((p) => p.cooked.includes("\n")))) {
      if (HEADER_LINE.test(lines.map(cookedOf).join(separator))) {
        refusals.push({ line: lineAt(startAt), reason: "an array of lines with a line break inside an element; convert it by hand" });
      }
      return;
    }
    // A `\r\n` join leaves a `\r` at the end of every line but the last.
    const cooked = lines.map(cookedOf);
    const crlf = separator === "\r\n";
    const joined = lines.map((l, i) => ({
      pieces: crlf && i < lines.length - 1 ? [...l.pieces, { raw: "", cooked: "\r", pos: l.pieces[0]?.pos ?? startAt }] : l.pieces,
      eol: i < lines.length - 1 ? { raw: "", cooked: "\n", pos: startAt } : undefined,
    }));
    const after = rewriteLines(joined, "lines", startAt);
    if (!after) return;
    const quote = source[startAt]!;
    const gap = elements.length > 1 ? source.slice(elements[0]!.end, elements[1]!.getStart(file)) : ", ";
    const pairs = commonLines(cooked, after.map((l) => (crlf ? l.replace(/\r$/, "") : l)));
    const spelled = after.map((text, j) => {
      const i = pairs.get(j);
      return i === undefined
        ? `${quote}${encode(crlf ? text.replace(/\r$/, "") : text, quote, [])}${quote}`
        : source.slice(elements[i]!.getStart(file), elements[i]!.end);
    });
    edits.push({ start: startAt, end: elements[elements.length - 1]!.end, text: spelled.join(gap) });
  };

  const visit = (node: ts.Node) => {
    if (ts.isArrayLiteralExpression(node)) {
      const separator = joinedLines(node);
      if (separator !== undefined) {
        visitLines(node, separator);
        return;
      }
    }
    if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
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
