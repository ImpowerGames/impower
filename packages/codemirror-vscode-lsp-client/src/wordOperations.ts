import {
  EditorSelection,
  type EditorState,
  type Line,
  type SelectionRange,
} from "@codemirror/state";
import { EditorView, type Command } from "@codemirror/view";

const VSCODE_WORD_SEPARATORS = "`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?";

const REGULAR = 0;
const SEPARATOR = 1;
const WHITESPACE = 2;
const NONE = 3;

type CharClass = typeof REGULAR | typeof SEPARATOR | typeof WHITESPACE;
type WordType = typeof REGULAR | typeof SEPARATOR | typeof NONE;

interface FoundWord {
  start: number;
  end: number;
  type: typeof REGULAR | typeof SEPARATOR;
  next: CharClass;
}

const SEPARATOR_CODES = new Set(
  [...VSCODE_WORD_SEPARATORS].map((char) => char.charCodeAt(0)),
);

const isBlank = (code: number) => code === 32 || code === 9;

const classAt = (text: string, index: number): CharClass => {
  const code = text.charCodeAt(index);
  if (isBlank(code)) return WHITESPACE;
  return SEPARATOR_CODES.has(code) ? SEPARATOR : REGULAR;
};

const endsWord = (type: WordType, charClass: CharClass) =>
  charClass === WHITESPACE ||
  (type === REGULAR && charClass === SEPARATOR) ||
  (type === SEPARATOR && charClass === REGULAR);

const endOfWord = (text: string, type: WordType, from: number) => {
  for (let index = from; index < text.length; index++) {
    if (endsWord(type, classAt(text, index))) return index;
  }
  return text.length;
};

const startOfWord = (text: string, type: WordType, from: number) => {
  for (let index = from; index >= 0; index--) {
    if (endsWord(type, classAt(text, index))) return index + 1;
  }
  return 0;
};

const word = (
  type: WordType,
  next: CharClass,
  start: number,
  end: number,
): FoundWord | null =>
  type === NONE ? null : { type, next, start, end };

function previousWordOnLine(text: string, ch: number): FoundWord | null {
  let type: WordType = NONE;
  for (let index = ch - 1; index >= 0; index--) {
    const charClass = classAt(text, index);
    if (type !== NONE && endsWord(type, charClass)) {
      return word(type, charClass, index + 1, endOfWord(text, type, index + 1));
    }
    if (charClass !== WHITESPACE) type = charClass;
  }
  return word(type, WHITESPACE, 0, endOfWord(text, type, 0));
}

function nextWordOnLine(text: string, ch: number): FoundWord | null {
  let type: WordType = NONE;
  for (let index = ch; index < text.length; index++) {
    const charClass = classAt(text, index);
    if (type !== NONE && endsWord(type, charClass)) {
      return word(type, charClass, startOfWord(text, type, index - 1), index);
    }
    if (charClass !== WHITESPACE) type = charClass;
  }
  return word(type, WHITESPACE, startOfWord(text, type, text.length - 1), text.length);
}

const isLoneSeparatorBeforeWord = (found: FoundWord | null) =>
  found !== null &&
  found.type === SEPARATOR &&
  found.end - found.start === 1 &&
  found.next === REGULAR;

function wordLeftTarget(
  state: EditorState,
  pos: number,
  hasMulticursor = false,
): number {
  let line = state.doc.lineAt(pos);
  let ch = pos - line.from;
  if (ch === 0 && line.number > 1) {
    line = state.doc.line(line.number - 1);
    ch = line.length;
  }
  let found = previousWordOnLine(line.text, ch);
  if (!hasMulticursor && isLoneSeparatorBeforeWord(found)) {
    found = previousWordOnLine(line.text, found!.start);
  }
  return line.from + (found ? found.start : 0);
}

function wordRightTarget(state: EditorState, pos: number): number {
  let line = state.doc.lineAt(pos);
  let ch = pos - line.from;
  if (ch === line.length && line.number < state.doc.lines) {
    line = state.doc.line(line.number + 1);
    ch = 0;
  }
  let found = nextWordOnLine(line.text, ch);
  if (isLoneSeparatorBeforeWord(found)) {
    found = nextWordOnLine(line.text, found!.end);
  }
  return line.from + (found ? found.end : line.length);
}

const lastNonBlankBefore = (text: string, ch: number) => {
  for (let index = ch - 1; index >= 0; index--) {
    if (!isBlank(text.charCodeAt(index))) return index;
  }
  return -1;
};

const firstNonBlankFrom = (text: string, ch: number) => {
  for (let index = ch; index < text.length; index++) {
    if (!isBlank(text.charCodeAt(index))) return index;
  }
  return text.length;
};

function deleteWordLeftTarget(state: EditorState, pos: number): number {
  const line = state.doc.lineAt(pos);
  const ch = pos - line.from;
  if (pos === 0) return pos;
  const lastNonBlank = lastNonBlankBefore(line.text, ch);
  if (lastNonBlank + 1 < ch - 1) return line.from + lastNonBlank + 1;
  const found = previousWordOnLine(line.text, ch);
  if (found) return line.from + found.start;
  return ch > 0 ? line.from : pos - 1;
}

function deleteWordRightTarget(state: EditorState, pos: number): number {
  const line = state.doc.lineAt(pos);
  const ch = pos - line.from;
  if (pos === state.doc.length) return pos;
  const firstNonBlank = firstNonBlankFrom(line.text, ch);
  if (ch < firstNonBlank) return line.from + firstNonBlank;
  const found = nextWordOnLine(line.text, ch);
  if (found) return line.from + found.end;
  if (ch < line.length || line.number === state.doc.lines) return line.to;
  const next: Line = state.doc.line(line.number + 1);
  const first = nextWordOnLine(next.text, 0);
  return next.from + (first ? first.start : next.length);
}

const moveBy =
  (target: (state: EditorState, range: SelectionRange, multi: boolean) => number, extend: boolean): Command =>
  (view) => {
    const { state } = view;
    const multi = state.selection.ranges.length > 1;
    const selection = EditorSelection.create(
      state.selection.ranges.map((range) => {
        const head = target(state, range, multi);
        return extend
          ? EditorSelection.range(range.anchor, head)
          : EditorSelection.cursor(head);
      }),
      state.selection.mainIndex,
    );
    if (selection.eq(state.selection)) return false;
    view.dispatch(state.update({ selection, scrollIntoView: true, userEvent: "select" }));
    return true;
  };

const leftOf = (state: EditorState, range: SelectionRange, multi: boolean) =>
  wordLeftTarget(state, range.head, multi);
const rightOf = (state: EditorState, range: SelectionRange) =>
  wordRightTarget(state, range.head);

export const cursorWordLeft: Command = moveBy(leftOf, false);
export const cursorWordRight: Command = moveBy(rightOf, false);
export const selectWordLeft: Command = moveBy(leftOf, true);
export const selectWordRight: Command = moveBy(rightOf, true);

const deleteBy =
  (target: (state: EditorState, pos: number) => number, event: string): Command =>
  (view) => {
    const { state } = view;
    if (state.readOnly) return false;
    const changes = state.changeByRange((range) => {
      if (!range.empty) {
        return {
          changes: { from: range.from, to: range.to },
          range: EditorSelection.cursor(range.from),
        };
      }
      const towards = target(state, range.head);
      const from = Math.min(range.head, towards);
      const to = Math.max(range.head, towards);
      return from === to
        ? { range }
        : { changes: { from, to }, range: EditorSelection.cursor(from) };
    });
    if (changes.changes.empty) return false;
    const selectionDeleted = state.selection.ranges.some((range) => !range.empty);
    view.dispatch(
      state.update(changes, {
        scrollIntoView: true,
        userEvent: selectionDeleted ? "delete.selection" : event,
        effects: selectionDeleted
          ? EditorView.announce.of(state.phrase("Selection deleted"))
          : undefined,
      }),
    );
    return true;
  };

export const deleteWordLeft: Command = deleteBy(deleteWordLeftTarget, "delete.backward");
export const deleteWordRight: Command = deleteBy(deleteWordRightTarget, "delete.forward");
