/**
 * Works out the edit accepting a highlighted suggestion would make, from what
 * VS Code reports about the highlight and what the language server offered.
 *
 * VS Code reports the highlighted suggestion only as the range it would
 * replace and the plain text it would put there (`SelectedCompletionInfo`).
 * That is the primary edit, with any snippet already turned into the text it
 * inserts. It says nothing about the suggestion's secondary edits, and two
 * suggestions with the same primary edit are reported identically. So the
 * report is matched against the language server's items, and the edit is what
 * accepting the matching item does: its text at every cursor, whitespace
 * adjusted as VS Code adjusts it, and its secondary edits. When none match, or
 * matching items disagree, the edit is unknown and the preview says so rather
 * than guess.
 *
 * Nothing here imports `vscode`, so it runs under the test runner as it is.
 */

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

/** One change, as `textDocument/didChange` carries it. */
export interface TextChange {
  range: Range;
  text: string;
}

/** The highlighted suggestion, as VS Code reports it. */
export interface SelectedCompletion {
  range: Range;
  text: string;
}

/** A cursor: `active` is where it is, `anchor` where its selection began. */
export interface Cursor {
  anchor: Position;
  active: Position;
}

/** Where a suggestion would be accepted: the editor's cursors, the text of
 *  its document's lines, and the editor's indentation and line breaks. */
export interface Placement {
  primary: Cursor;
  others: readonly Cursor[];
  lineText: (line: number) => string;
  indentSize: number;
  insertSpaces: boolean;
  eol: string;
}

/** A language-server item, reduced to what decides the edit it makes. */
export interface CompletionCandidate {
  /** Where the replaced range starts, when the item says. Without one VS Code
   *  replaces the word before the cursor, which it reports itself. */
  start?: Position;
  /** What the item inserts: its edit's text, its insert text, or its label. */
  text: string;
  /** Whether `text` is snippet syntax rather than plain text. */
  snippet: boolean;
  /** Whether accepting inserts `text` as it is, without re-indenting its
   *  later lines (`InsertTextMode.asIs`). */
  keepWhitespace: boolean;
  /** Edits accepting the item makes besides the primary one. */
  additionalEdits: TextChange[];
}

/**
 * The text a snippet inserts before the author types anything: each
 * placeholder's default, a choice's first option, a variable's default, and
 * nothing for a bare tab stop. This is VS Code's own reading of a snippet it
 * has not resolved variables for, which is what it reports for a highlighted
 * snippet.
 */
export const snippetText = (snippet: string): string => {
  let i = 0;
  const parse = (closing: string | null): string => {
    let out = "";
    while (i < snippet.length) {
      const c = snippet[i]!;
      if (
        c === "\\" &&
        i + 1 < snippet.length &&
        "$}\\,|".includes(snippet[i + 1]!)
      ) {
        out += snippet[i + 1];
        i += 2;
        continue;
      }
      if (closing != null && c === closing) {
        return out;
      }
      if (c === "$") {
        const rest = snippet.slice(i + 1);
        const bare = /^(\d+|[A-Za-z_][A-Za-z0-9_]*)/.exec(rest);
        if (bare) {
          i += 1 + bare[0].length;
          continue;
        }
        const braced = /^\{(\d+|[A-Za-z_][A-Za-z0-9_]*)/.exec(rest);
        if (braced) {
          i += 1 + braced[0].length;
          const next = snippet[i];
          if (next === "}") {
            i += 1;
            continue;
          }
          if (next === ":") {
            i += 1;
            out += parse("}");
            i += 1;
            continue;
          }
          if (next === "|") {
            i += 1;
            let first: string | null = null;
            let option = "";
            while (i < snippet.length && snippet[i] !== "|") {
              const o = snippet[i]!;
              if (o === "\\" && i + 1 < snippet.length) {
                option += snippet[i + 1];
                i += 2;
                continue;
              }
              if (o === ",") {
                first ??= option;
                option = "";
              } else {
                option += o;
              }
              i += 1;
            }
            first ??= option;
            out += first;
            // Past the closing `|}`.
            i += 2;
            continue;
          }
          if (next === "/") {
            // A transform: VS Code inserts the variable's value, which is
            // unresolved here. Skip to the closing brace.
            while (i < snippet.length && snippet[i] !== "}") {
              i += snippet[i] === "\\" ? 2 : 1;
            }
            i += 1;
            continue;
          }
        }
      }
      out += c;
      i += 1;
    }
    return out;
  };
  return parse(null);
};

const samePosition = (a: Position, b: Position) =>
  a.line === b.line && a.character === b.character;

/** VS Code re-indents a multi-line snippet to the line it is inserted on, so
 *  the text it reports differs from the snippet in leading whitespace alone. */
const withoutIndentation = (text: string) =>
  text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trimStart())
    .join("\n");

const candidateMatches = (
  selected: SelectedCompletion,
  candidate: CompletionCandidate,
) => {
  if (candidate.start && !samePosition(candidate.start, selected.range.start)) {
    return false;
  }
  if (candidate.snippet) {
    return (
      withoutIndentation(snippetText(candidate.text)) ===
      withoutIndentation(selected.text)
    );
  }
  return candidate.text === selected.text;
};

const comparePositions = (a: Position, b: Position) =>
  a.line - b.line || a.character - b.character;

/** The leading whitespace of `line`, no further than `before`. */
const leadingWhitespace = (line: string, before: number) =>
  /^[ \t]*/.exec(line.slice(0, before))![0];

/** The 1-based column of the first character of `line` that is not
 *  whitespace, or 0 when there is none (`getLineFirstNonWhitespaceColumn`). */
const firstNonWhitespaceColumn = (line: string) => {
  const found = /[^ \t]/.exec(line);
  return found ? found.index + 1 : 0;
};

/** `text` with its leading whitespace rewritten in the editor's indentation
 *  unit (`ITextModel.normalizeIndentation`). */
const normalizeIndentation = (text: string, placement: Placement) => {
  const leading = /^[ \t]*/.exec(text)![0];
  let columns = 0;
  for (const c of leading) {
    columns =
      c === "\t"
        ? columns + placement.indentSize - (columns % placement.indentSize)
        : columns + 1;
  }
  const indent = placement.insertSpaces
    ? " ".repeat(columns)
    : "\t".repeat(Math.floor(columns / placement.indentSize)) +
      " ".repeat(columns % placement.indentSize);
  return indent + text.slice(leading.length);
};

/**
 * The text accepting `candidate` inserts at `start`: its plain text, and when
 * `adjust` is set, its later lines indented like the line it is inserted on,
 * every line's indentation in the editor's unit and the document's line
 * breaks (`SnippetSession.adjustWhitespace`).
 */
const insertedText = (
  candidate: CompletionCandidate,
  start: Position,
  adjust: boolean,
  placement: Placement,
) => {
  const plain = candidate.snippet
    ? snippetText(candidate.text)
    : candidate.text;
  if (!adjust) {
    return plain;
  }
  const indent = leadingWhitespace(
    placement.lineText(start.line),
    start.character,
  );
  return plain
    .split(/\r\n|\r|\n/)
    .map((line, index) =>
      normalizeIndentation(index === 0 ? line : indent + line, placement),
    )
    .join(placement.eol);
};

/**
 * The changes accepting `candidate`, reported as `selected`, makes at every
 * cursor, by VS Code's own insertion (`SnippetSession`
 * `createEditsAndSnippetsFromSelections`, with the options the suggestion
 * controller passes): the primary cursor replaces the reported range, and each
 * other cursor replaces as many characters before and after itself as the
 * primary does, on each side only where those characters are the same as the
 * primary's, and otherwise just its own selection. Whitespace is adjusted at
 * the primary unless the item keeps it, and at another cursor also when its
 * line's first text starts in another column than the primary's.
 */
const cursorChanges = (
  selected: SelectedCompletion,
  candidate: CompletionCandidate,
  placement: Placement,
): TextChange[] | null => {
  const at = placement.primary.active;
  const primaryAdjusts = !candidate.keepWhitespace;
  const primary: TextChange = {
    range: selected.range,
    text: insertedText(
      candidate,
      selected.range.start,
      primaryAdjusts,
      placement,
    ),
  };
  if (placement.others.length === 0) {
    return [primary];
  }
  if (
    selected.range.start.line !== at.line ||
    selected.range.end.line !== at.line
  ) {
    return null;
  }
  const before = at.character - selected.range.start.character;
  const after = selected.range.end.character - at.character;
  /** The range VS Code's `adjustSelection` gives a cursor for these counts. */
  const around = (cursor: Cursor, b: number, a: number): Range => {
    if (b === 0 && a === 0) {
      const [start, end] =
        comparePositions(cursor.anchor, cursor.active) <= 0
          ? [cursor.anchor, cursor.active]
          : [cursor.active, cursor.anchor];
      return { start, end };
    }
    const { line, character } = cursor.active;
    const length = placement.lineText(line).length;
    const clamp = (c: number) => Math.max(0, Math.min(length, c));
    return {
      start: { line, character: clamp(character - b) },
      end: { line, character: clamp(character + a) },
    };
  };
  const textIn = (range: Range) =>
    range.start.line === range.end.line
      ? placement
          .lineText(range.start.line)
          .slice(range.start.character, range.end.character)
      : null;
  const firstBefore = textIn(around(placement.primary, before, 0));
  const firstAfter = textIn(around(placement.primary, 0, after));
  const primaryColumn = firstNonWhitespaceColumn(placement.lineText(at.line));
  const changes = [primary];
  for (const cursor of placement.others) {
    const own = around(cursor, 0, 0);
    const extendedBefore = around(cursor, before, 0);
    const extendedAfter = around(cursor, 0, after);
    const range: Range = {
      start:
        textIn(extendedBefore) === firstBefore
          ? extendedBefore.start
          : own.start,
      end: textIn(extendedAfter) === firstAfter ? extendedAfter.end : own.end,
    };
    const adjusts =
      primaryAdjusts ||
      firstNonWhitespaceColumn(placement.lineText(cursor.active.line)) !==
        primaryColumn;
    changes.push({
      range,
      text: insertedText(candidate, range.start, adjusts, placement),
    });
  }
  return changes;
};

/**
 * The changes accepting the highlighted suggestion would make, in the order
 * `textDocument/didChange` applies them, or null when they cannot be known.
 *
 * Changes are listed last in the document first, so each one's range is still
 * where it was when the ones before it have been applied.
 */
export const completionChanges = (
  selected: SelectedCompletion,
  candidates: readonly CompletionCandidate[],
  placement: Placement,
): TextChange[] | null => {
  const edits = candidates
    .filter((c) => candidateMatches(selected, c))
    .map((candidate) => {
      const atCursors = cursorChanges(selected, candidate, placement);
      return atCursors && [...atCursors, ...candidate.additionalEdits];
    });
  const first = edits[0];
  if (!first) {
    return null;
  }
  if (edits.some((edit) => !edit || !sameChanges(edit, first))) {
    // Identical as VS Code reports them, different in what they change, or
    // not known at every cursor.
    return null;
  }
  return first.sort((a, b) => comparePositions(b.range.start, a.range.start));
};

/** Whether a document change is exactly `changes`, in any order. */
export const sameChanges = (
  a: readonly TextChange[],
  b: readonly TextChange[],
) => {
  if (a.length !== b.length) {
    return false;
  }
  const key = (c: TextChange) =>
    `${c.range.start.line}:${c.range.start.character}-${c.range.end.line}:${c.range.end.character}=${c.text}`;
  const sa = a.map(key).sort();
  const sb = b.map(key).sort();
  return sa.every((k, i) => k === sb[i]);
};
