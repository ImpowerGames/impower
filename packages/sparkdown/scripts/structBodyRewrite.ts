// The text rewrite behind `convertStructBodies.mjs` (#1229): turns the
// indented forms of the bodies of `layout`, `component`, `style`,
// `animation`, `theme`, `morph` and `screen` into the brace forms of #1222.
// It reads text only; the script around it compiles the source before and
// after and keeps the result only when the two programs agree.
//
//   old form                                  becomes
//   `header:` with deeper lines               `header {` … `}` (the `}` at the header's indentation)
//   `header:` with nothing beneath it         `header`
//   a bare `-` item with indented entries     a bare `{ … }` entry
//   `- key = value` / `- key:` and further
//     entries                                 one `{ … }` entry holding all of them
//   `- value`                                 `value`
//   `mask shadow_1`, `choice 0:`              `mask.shadow_1`, `choice.0 {`
//
// Every other line stays byte for byte: comments, blank lines, properties,
// the declaration line and the indentation of every line it does not add.
//
// A declaration is refused, and left as it was, when its old meaning cannot
// be carried over:
//   - a deeper-indented line under a line that opens no block, such as a
//     property, which the struct readers drop without a diagnostic;
//   - in a layout or component, deeper-indented lines under an element line
//     with no colon: the layout tree nests them (`buildBlock` in
//     `lowerSparkleBody.ts`) while the static struct gives the element an
//     empty entry, and a brace block would give the static struct the lines
//     too;
//   - a body whose indentation mixes tabs and spaces;
//   - an element line the brace form reads differently (#1224): a word after
//     its content or an attribute, or a comment before more of its parts;
//   - a body that already holds brace blocks beside the indented forms.
//
// This script is deleted with the indented forms by the last slice of #1222.

export type BodyKind = "layout" | "struct";

export interface Refusal {
  /** 1-based line of the source the refusal is about. */
  line: number;
  /** The declaration's own header line, 1-based. */
  declaration: number;
  reason: string;
}

export interface RewriteResult {
  text: string;
  /** Declarations whose body was rewritten. */
  converted: number;
  /** Declarations with a struct body (converted, refused or unchanged). */
  declarations: number;
  refusals: Refusal[];
}

const DECLARATION =
  /^(layout|component|style|animation|theme|morph|screen)\b.*\bwith[ \t]*(?:(?:--|\/\/).*)?$/;
const DECLARATION_END = /^end\b/;

// The shapes the grammar gives an indented body line, tried in its order
// (`LuauStructBodyContent`): a comment, a property, a list item, a component
// call or a header, and anything else.
const COMMENT = /^(?:--|\/\/)/;
const PROPERTY =
  /^(?:\[[^\]\n]*\]|[$]?(?:[0-9]+|[A-Za-z_][\w-]*|"(?:\\.|[^"\r\n])*"))[ \t]*=/;
const ITEM = /^-(?:$|[ \t]+)/;
// `LuauStructObjectHeader`: the first `:` followed only by whitespace and an
// optional comment.
const HEADER = /^(.+?)([ \t]*):([ \t]*)((?:--|\/\/(?=$|[ \t])).*)?$/;
const CONTROL = /^(?:if|elseif|else|end|for|match|case)\b/;

interface Line {
  /** 0-based index into the source's lines. */
  index: number;
  /** Leading whitespace. */
  ws: string;
  /** Text after the leading whitespace, without a trailing `\r`. */
  text: string;
  cr: string;
}

interface OutLine {
  text: string;
  kind: "sig" | "comment" | "blank";
  column: number;
}

interface Open {
  column: number;
  ws: string;
}

class Refused extends Error {
  constructor(
    readonly line: number,
    readonly reason: string,
  ) {
    super(reason);
  }
}

/** Rewrites every struct body of `source`. */
export function rewriteStructBodies(source: string): RewriteResult {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const raw = source.split("\n");
  const lines: Line[] = raw.map((full, index) => {
    const cr = full.endsWith("\r") ? "\r" : "";
    const body = cr ? full.slice(0, -1) : full;
    const ws = /^[ \t]*/.exec(body)![0];
    return { index, ws, text: body.slice(ws.length), cr };
  });
  const out: string[] = [];
  const refusals: Refusal[] = [];
  let converted = 0;
  let declarations = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const match = line.ws === "" ? DECLARATION.exec(line.text) : null;
    if (!match) {
      out.push(raw[i]!);
      i++;
      continue;
    }
    let end = i + 1;
    while (
      end < lines.length &&
      !(lines[end]!.ws === "" && DECLARATION_END.test(lines[end]!.text))
    ) {
      end++;
    }
    if (end >= lines.length) {
      // No `end`: leave the rest of the file alone.
      out.push(raw[i]!);
      i++;
      continue;
    }
    declarations++;
    const kind: BodyKind =
      match[1] === "layout" || match[1] === "component" ? "layout" : "struct";
    const body = lines.slice(i + 1, end);
    out.push(raw[i]!);
    try {
      const rewritten = rewriteBody(body, kind, eol);
      if (rewritten) {
        converted++;
        out.push(...rewritten);
      } else {
        out.push(...raw.slice(i + 1, end));
      }
    } catch (error) {
      if (!(error instanceof Refused)) throw error;
      refusals.push({ line: error.line, declaration: i + 1, reason: error.reason });
      out.push(...raw.slice(i + 1, end));
    }
    out.push(raw[end]!);
    i = end + 1;
  }
  return { text: out.join("\n"), converted, declarations, refusals };
}

const isBlank = (line: Line) => line.text === "";
const isComment = (line: Line) => COMMENT.test(line.text);

/** The column a line's text starts in: one per character, tabs included,
 *  as the compiler counts it. */
const columnOf = (line: Line) => line.ws.length;

/**
 * The rewritten lines of a body, `null` when it holds no indented form, or
 * throws `Refused`.
 */
function rewriteBody(body: Line[], kind: BodyKind, eol: string): string[] | null {
  const significant = body.filter((l) => !isBlank(l) && !isComment(l));
  if (significant.length === 0) return null;

  const indentChars = new Set<string>();
  for (const line of significant) {
    for (const c of line.ws) indentChars.add(c);
    if (indentChars.size > 1) {
      throw new Refused(line.index + 1, "the body's indentation mixes tabs and spaces");
    }
  }

  const oldForms = significant.filter(
    (l) => ITEM.test(l.text) || (!PROPERTY.test(l.text) && HEADER.test(l.text)),
  );
  const braced = significant.find((l) => hasStructuralBrace(l.text));
  if (braced) {
    if (oldForms.length === 0) return null;
    throw new Refused(
      braced.index + 1,
      "the body already holds brace blocks beside indented forms; convert it by hand",
    );
  }

  const out: OutLine[] = [];
  const open: Open[] = [];
  const cr = eol === "\r\n" ? "\r" : "";
  let changed = false;

  const close = (column: number) => {
    while (open.length > 0 && open[open.length - 1]!.column >= column) {
      const block = open.pop()!;
      let at = out.length;
      while (at > 0 && out[at - 1]!.kind !== "sig") at--;
      while (
        at < out.length &&
        out[at]!.kind === "comment" &&
        out[at]!.column > block.column
      ) {
        at++;
      }
      out.splice(at, 0, { text: `${block.ws}}${cr}`, kind: "sig", column: block.column });
      changed = true;
    }
  };

  /** The column of the significant line after `pos`, or -1. */
  const nextColumn = (pos: number) => {
    for (let k = pos + 1; k < body.length; k++) {
      const l = body[k]!;
      if (!isBlank(l) && !isComment(l)) return columnOf(l);
    }
    return -1;
  };

  for (let pos = 0; pos < body.length; pos++) {
    const line = body[pos]!;
    if (isBlank(line)) {
      out.push({ text: line.ws + line.cr, kind: "blank", column: columnOf(line) });
      continue;
    }
    if (isComment(line)) {
      out.push({ text: line.ws + line.text + line.cr, kind: "comment", column: columnOf(line) });
      continue;
    }
    const column = columnOf(line);
    close(column);
    const deeper = nextColumn(pos) > column;
    const emit = (text: string) =>
      out.push({ text: line.ws + text + line.cr, kind: "sig", column });

    if (kind === "layout" && CONTROL.test(line.text)) {
      emit(line.text);
      continue;
    }

    const item = ITEM.exec(line.text);
    if (item) {
      changed = true;
      const rest = line.text.slice(item[0].length);
      if (rest === "") {
        emit(`{${line.text.slice(1)}`.trimEnd() + (deeper ? "" : "}"));
        if (deeper) open.push({ column, ws: line.ws });
        continue;
      }
      const inner = rewriteEntry(rest, kind, line);
      if (!inner.property && !inner.header) {
        // `- value`: the bare value.
        if (deeper) throw new Refused(line.index + 2, "a deeper-indented line under a list value");
        emit(rest);
        continue;
      }
      const restColumn = column + item[0].length;
      const restDeeper = nextColumn(pos) > restColumn;
      if (!deeper) {
        emit(`{ ${inner.text} }${inner.comment}`);
        continue;
      }
      // `- key = value` or `- key:` with further entries: one `{ … }` entry,
      // with the inline entry at the column it starts in.
      open.push({ column, ws: line.ws });
      if (inner.header && restDeeper) {
        emit(`{ ${inner.text} {${inner.comment}`);
        open.push({
          column: restColumn,
          ws: line.ws + " ".repeat(item[0].length),
        });
      } else if (!inner.header && restDeeper) {
        throw new Refused(line.index + 2, "a deeper-indented line under a property");
      } else {
        emit(`{ ${inner.text}${inner.comment}`);
      }
      continue;
    }

    const entry = rewriteEntry(line.text, kind, line);
    if (entry.text !== line.text || entry.header) changed = true;
    if (deeper) {
      if (!entry.header && entry.element) {
        // The layout tree nests these lines under it (`buildBlock` in
        // `lowerSparkleBody.ts`), while the static struct gives the line an
        // empty entry and drops them, so neither brace spelling keeps both.
        throw new Refused(
          line.index + 2,
          "deeper-indented lines under an element line with no colon, which the layout tree nests and the static struct drops",
        );
      }
      if (!entry.header) {
        throw new Refused(
          line.index + 2,
          entry.property
            ? "a deeper-indented line under a property"
            : "a deeper-indented line under a line that opens no block",
        );
      }
      changed = true;
      emit(`${entry.text} {${entry.comment}`);
      open.push({ column, ws: line.ws });
    } else {
      emit(entry.text + entry.comment);
    }
  }
  close(-1);
  if (!changed) return null;
  return out.map((l) => l.text);
}

interface Entry {
  /** The entry without a header's colon or trailing comment. */
  text: string;
  /** A header's trailing comment with the whitespace before it, or "". */
  comment: string;
  header: boolean;
  property: boolean;
  /** A layout or component element line. */
  element: boolean;
}

/** Reads one indented entry (a line's text, or a list item's inline part). */
function rewriteEntry(text: string, kind: BodyKind, line: Line): Entry {
  if (PROPERTY.test(text)) {
    return { text, comment: "", header: false, property: true, element: false };
  }
  const header = HEADER.exec(text);
  const head = header ? header[1]! : text;
  const comment = header && header[4] ? `${header[3] ? header[3] : " "}${header[4]}` : "";
  const element = kind === "layout" ? dotClasses(head, line) : null;
  return {
    text: element ?? head,
    comment,
    header: Boolean(header),
    property: false,
    element: element !== null,
  };
}

const NAME = /^[A-Za-z_][\w-]*(?:\.[\w-]+)*/;
const WORD = /^(?!--)\.?[\w-]+(?:\.[\w-]+)*(?=[ \t]|$)/;

/**
 * An element line with every bare-word class after its name written with a
 * dot (`mask shadow_1` → `mask.shadow_1`), or `null` when the line is no
 * element. `slot` and `fill` keep their bare name, and nothing after a
 * component call's arguments changes.
 */
function dotClasses(head: string, line: Line): string | null {
  const name = NAME.exec(head);
  if (!name) return null;
  let rest = head.slice(name[0].length);
  if (/^[ \t]*\(/.test(rest)) return head;
  if (rest !== "" && !/^[ \t]/.test(rest)) return null;
  if (name[0] === "slot" || name[0] === "fill") return head;
  let classes = "";
  for (;;) {
    const ws = /^[ \t]+/.exec(rest);
    if (!ws) break;
    const word = WORD.exec(rest.slice(ws[0].length));
    if (!word) break;
    classes += `.${word[0].replace(/^\./, "")}`;
    rest = rest.slice(ws[0].length + word[0].length);
  }
  checkTail(rest, line);
  return name[0] + classes + rest;
}

/**
 * Refuses an element line whose parts after its classes the brace form reads
 * differently (#1224): a bare word after content or an attribute, which the
 * indented form drops or runs into the value before it, and a comment
 * followed by more of the line, which the indented form keeps in the key.
 */
function checkTail(rest: string, line: Line): void {
  let k = 0;
  const n = rest.length;
  const refuse = (what: string) => {
    throw new Refused(line.index + 1, `an element line ${what}, which the brace form reads differently`);
  };
  const skipQuoted = (q: string) => {
    k++;
    while (k < n && rest[k] !== q) k += rest[k] === "\\" ? 2 : 1;
    k++;
  };
  const skipValue = () => {
    if (rest[k] === '"' || rest[k] === "'") return skipQuoted(rest[k]!);
    let depth = 0;
    while (k < n) {
      const c = rest[k]!;
      if (c === '"' || c === "'") {
        skipQuoted(c);
        continue;
      }
      if (c === "{" || c === "(" || c === "[") depth++;
      else if (c === "}" || c === ")" || c === "]") depth--;
      else if ((c === " " || c === "\t") && depth <= 0) return;
      k++;
    }
  };
  while (k < n) {
    const c = rest[k]!;
    if (c === " " || c === "\t") {
      k++;
    } else if (c === '"' || c === "'") {
      skipQuoted(c);
    } else if (rest.startsWith("--", k)) {
      const long = /^--\[(=*)\[/.exec(rest.slice(k));
      if (!long) return;
      const close = rest.indexOf(`]${long[1]}]`, k);
      if (close < 0) return;
      k = close + long[1]!.length + 2;
      if (rest.slice(k).trim() !== "") refuse("with a comment before more of its parts");
    } else if (c === "#" || c === "@") {
      const attr = /^[#@][\w-]+/.exec(rest.slice(k));
      if (!attr) refuse("with an unreadable attribute");
      k += attr![0].length;
      if (rest[k] === "=") {
        k++;
        skipValue();
      }
    } else if (c === ".") {
      const cls = /^\.[\w-]+/.exec(rest.slice(k));
      if (!cls) refuse("with an unreadable class");
      k += cls![0].length;
    } else {
      refuse("with a word after its content or attributes");
    }
  }
}

/**
 * True when a line holds a `{` or `}` outside quotes, attribute values and
 * comments: a brace block's line.
 */
export function hasStructuralBrace(text: string): boolean {
  let k = 0;
  const n = text.length;
  while (k < n) {
    const c = text[k]!;
    if (c === '"' || c === "'") {
      k++;
      while (k < n && text[k] !== c) k += text[k] === "\\" ? 2 : 1;
      k++;
    } else if (text.startsWith("--", k) || (text.startsWith("//", k) && /^\/\/(?:$|[ \t])/.test(text.slice(k)))) {
      return false;
    } else if ((c === "#" || c === "@") && /^[#@][\w-]+[ \t]*=/.test(text.slice(k))) {
      // An attribute's value, braces and all.
      k = text.indexOf("=", k) + 1;
      while (text[k] === " " || text[k] === "\t") k++;
      let depth = 0;
      while (k < n) {
        const v = text[k]!;
        if (v === '"' || v === "'") {
          k++;
          while (k < n && text[k] !== v) k += text[k] === "\\" ? 2 : 1;
          k++;
          continue;
        }
        if (v === "{" || v === "(") depth++;
        else if (v === "}" || v === ")") depth--;
        else if ((v === " " || v === "\t") && depth <= 0) break;
        k++;
      }
    } else if (c === "{" || c === "}") {
      return true;
    } else {
      k++;
    }
  }
  return false;
}
