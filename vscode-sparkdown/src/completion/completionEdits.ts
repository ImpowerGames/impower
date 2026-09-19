/**
 * Works out the edit accepting a highlighted suggestion would make, from what
 * VS Code reports about the highlight and what the language server offered.
 *
 * VS Code reports the highlighted suggestion only as the range it would
 * replace and the plain text it would put there (`SelectedCompletionInfo`).
 * That is the primary edit, with any snippet already turned into the text it
 * inserts. It says nothing about the suggestion's secondary edits, and two
 * suggestions with the same primary edit are reported identically. So the
 * report is matched against the language server's items: when the matching
 * items agree on their secondary edits, the edit is the primary edit plus
 * those; when none match, or matching items disagree, the edit is unknown and
 * the preview says so rather than guess.
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

/** A language-server item, reduced to what decides the edit it makes. */
export interface CompletionCandidate {
  /** Where the replaced range starts, when the item says. Without one VS Code
   *  replaces the word before the cursor, which it reports itself. */
  start?: Position;
  /** What the item inserts: its edit's text, its insert text, or its label. */
  text: string;
  /** Whether `text` is snippet syntax rather than plain text. */
  snippet: boolean;
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
    .split(/\r?\n/)
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

const sameEdits = (a: TextChange[], b: TextChange[]) =>
  JSON.stringify(a) === JSON.stringify(b);

const comparePositions = (a: Position, b: Position) =>
  a.line - b.line || a.character - b.character;

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
): TextChange[] | null => {
  const matches = candidates.filter((c) => candidateMatches(selected, c));
  const first = matches[0];
  if (!first) {
    return null;
  }
  if (
    matches.some((m) => !sameEdits(m.additionalEdits, first.additionalEdits))
  ) {
    // Identical as VS Code reports them, different in what they change.
    return null;
  }
  const primary: TextChange = { range: selected.range, text: selected.text };
  return [primary, ...first.additionalEdits].sort((a, b) =>
    comparePositions(b.range.start, a.range.start),
  );
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
