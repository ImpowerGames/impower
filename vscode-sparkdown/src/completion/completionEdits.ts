export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface TextChange {
  range: Range;
  text: string;
}

export interface SelectedCompletion {
  range: Range;
  text: string;
}

export interface Cursor {
  anchor: Position;
  active: Position;
}

export interface Placement {
  primary: Cursor;
  others: readonly Cursor[];
  lineText: (line: number) => string;
  indentSize: number;
  insertSpaces: boolean;
  eol: string;
}

export interface CompletionCandidate {
  start?: Position;
  text: string;
  snippet: boolean;
  keepWhitespace: boolean;
  additionalEdits: TextChange[];
}

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
            i += 2;
            continue;
          }
          if (next === "/") {
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

const leadingWhitespace = (line: string, before: number) =>
  /^[ \t]*/.exec(line.slice(0, before))![0];

const firstNonWhitespaceColumn = (line: string) => {
  const found = /[^ \t]/.exec(line);
  return found ? found.index + 1 : 0;
};

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
    return null;
  }
  return first.sort((a, b) => comparePositions(b.range.start, a.range.start));
};

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
