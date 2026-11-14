import { SearchCursor } from "@codemirror/search";
import {
  EditorSelection,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Line,
  type SelectionRange,
} from "@codemirror/state";
import {
  EditorView,
  type Command,
  type MouseSelectionStyle,
} from "@codemirror/view";

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

const touches = (found: FoundWord | null, ch: number, type: WordType, endInclusive: boolean) =>
  found !== null &&
  found.type === type &&
  found.start <= ch &&
  (endInclusive ? ch <= found.end : ch < found.end);

const strictlyInside = (found: FoundWord | null, ch: number) =>
  found !== null && found.type === REGULAR && found.start < ch && ch < found.end;

function wordAtPosition(state: EditorState, pos: number): SelectionRange | null {
  const line = state.doc.lineAt(pos);
  const ch = pos - line.from;
  const prev = previousWordOnLine(line.text, ch);
  if (touches(prev, ch, REGULAR, true)) {
    return EditorSelection.range(line.from + prev!.start, line.from + prev!.end);
  }
  const next = nextWordOnLine(line.text, ch);
  if (touches(next, ch, REGULAR, true)) {
    return EditorSelection.range(line.from + next!.start, line.from + next!.end);
  }
  return null;
}

export function wordForDoubleClick(state: EditorState, pos: number): SelectionRange {
  const line = state.doc.lineAt(pos);
  const ch = pos - line.from;
  const prev = previousWordOnLine(line.text, ch);
  const next = nextWordOnLine(line.text, ch);
  const found = touches(prev, ch, REGULAR, true)
    ? prev
    : touches(prev, ch, SEPARATOR, false)
      ? prev
      : touches(next, ch, REGULAR, true)
        ? next
        : touches(next, ch, SEPARATOR, false)
          ? next
          : null;
  const start = found ? found.start : prev ? prev.end : 0;
  const end = found ? found.end : next ? next.start : line.length;
  return EditorSelection.range(line.from + start, line.from + end);
}

function dragWordSelection(state: EditorState, start: SelectionRange, pos: number): SelectionRange {
  const line = state.doc.lineAt(pos);
  const ch = pos - line.from;
  const prev = previousWordOnLine(line.text, ch);
  const next = nextWordOnLine(line.text, ch);
  const found = strictlyInside(prev, ch) ? prev : strictlyInside(next, ch) ? next : null;
  const wordStart = found ? line.from + found.start : pos;
  const wordEnd = found ? line.from + found.end : pos;
  const contains = (at: number) => start.from <= at && at <= start.to;
  let head: number;
  if (contains(pos)) {
    head = start.to;
  } else if (pos <= start.from) {
    head = contains(wordStart) ? start.to : wordStart;
  } else {
    head = contains(wordEnd) ? start.from : wordEnd;
  }
  const anchor = !start.empty && head <= start.from ? start.to : start.from;
  return EditorSelection.range(anchor, head);
}

const DOUBLE_CLICK_BLOCK = "doubleClickBlock";

type DoubleClickBlock = (state: EditorState, pos: number) => SelectionRange | null;

function blockForDoubleClick(state: EditorState, pos: number): SelectionRange | null {
  for (const find of state.languageDataAt<DoubleClickBlock>(DOUBLE_CLICK_BLOCK, pos)) {
    const block = find(state, pos);
    if (block) return block;
  }
  return null;
}

function doubleClickSelection(view: EditorView, event: MouseEvent): MouseSelectionStyle | null {
  if (event.button !== 0 || event.detail !== 2) return null;
  const posOf = (e: MouseEvent) => view.posAtCoords({ x: e.clientX, y: e.clientY }, false);
  let startPos = posOf(event);
  let startSel = view.state.selection;
  let start = wordForDoubleClick(view.state, startPos);
  let block: SelectionRange | null | undefined;
  return {
    update(update) {
      if (update.docChanged) {
        start = start.map(update.changes);
        startSel = startSel.map(update.changes);
        startPos = update.changes.mapPos(startPos);
        block = block?.map(update.changes);
      }
    },
    get(curEvent, extend, multiple) {
      if (!extend && !multiple && posOf(curEvent) === startPos) {
        block ??= blockForDoubleClick(view.state, startPos);
        if (block) return EditorSelection.create([block]);
      }
      if (extend) {
        const word = wordForDoubleClick(view.state, posOf(curEvent));
        return startSel.replaceRange(startSel.main.extend(word.from, word.to));
      }
      const range = dragWordSelection(view.state, start, posOf(curEvent));
      if (multiple) return startSel.addRange(range);
      return EditorSelection.create([range]);
    },
  };
}

export const vscodeWordSelection: Extension = EditorView.mouseSelectionStyle.of(doubleClickSelection);

interface NextOccurrenceSession {
  searchText: string;
  wholeWord: boolean;
  matchCase: boolean;
}

const setNextOccurrenceSession = StateEffect.define<NextOccurrenceSession | null>();

const nextOccurrenceSession = StateField.define<NextOccurrenceSession | null>({
  create: () => null,
  update(session, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setNextOccurrenceSession)) return effect.value;
    }
    return session && (tr.selection || tr.docChanged) ? null : session;
  },
  provide: (field) =>
    EditorView.focusChangeEffect.of((state) => (state.field(field) ? setNextOccurrenceSession.of(null) : null)),
});

const isWordCharAt = (state: EditorState, pos: number) => {
  const char = state.sliceDoc(pos, pos + 1);
  return char !== "\n" && char !== "\r" && classAt(char, 0) === REGULAR;
};

const isWholeWord = (state: EditorState, from: number, to: number) =>
  (from === 0 || !isWordCharAt(state, from - 1) || (to > from && !isWordCharAt(state, from))) &&
  (to === state.doc.length || !isWordCharAt(state, to) || (to > from && !isWordCharAt(state, to - 1)));

const lowerCase = (text: string) => text.toLowerCase();

function findNextOccurrence(state: EditorState, session: NextOccurrenceSession): SelectionRange | null {
  const { ranges } = state.selection;
  const { searchText, wholeWord, matchCase } = session;
  const normalize = matchCase ? undefined : lowerCase;
  const last = ranges[ranges.length - 1]!;
  let cycled = false;
  let cursor = new SearchCursor(state.doc, searchText, last.to, undefined, normalize);
  for (;;) {
    cursor.next();
    if (cursor.done) {
      if (cycled) return null;
      cursor = new SearchCursor(state.doc, searchText, 0, last.to, normalize);
      cycled = true;
      continue;
    }
    const { from, to } = cursor.value;
    if (cycled && ranges.some((range) => range.from < to && from < range.to)) continue;
    if (wholeWord && !isWholeWord(state, from, to)) continue;
    return EditorSelection.range(from, to);
  }
}

function beginSession(state: EditorState): NextOccurrenceSession | SelectionRange[] | null {
  const { ranges, main } = state.selection;
  if (ranges.length === 1 && main.empty) {
    const word = wordAtPosition(state, main.head);
    return word && { searchText: state.sliceDoc(word.from, word.to), wholeWord: true, matchCase: true };
  }
  if (ranges.some((range) => range.empty)) {
    return ranges.map((range) => wordAtPosition(state, range.head) ?? EditorSelection.cursor(range.head));
  }
  const searched = lowerCase(state.sliceDoc(main.from, main.to));
  if (ranges.some((range) => lowerCase(state.sliceDoc(range.from, range.to)) !== searched)) return null;
  return { searchText: state.sliceDoc(main.from, main.to), wholeWord: false, matchCase: false };
}

export const selectNextOccurrence: Command = (view) => {
  if (view.state.field(nextOccurrenceSession, false) === undefined) {
    view.dispatch({ effects: StateEffect.appendConfig.of(nextOccurrenceSession) });
  }
  const { state, dispatch } = view;
  const current = state.field(nextOccurrenceSession);
  const begun = current ?? beginSession(state);
  if (!begun) return false;
  if (Array.isArray(begun)) {
    const selection = EditorSelection.create(begun, state.selection.mainIndex);
    if (selection.eq(state.selection)) return false;
    dispatch(state.update({ selection }));
    return true;
  }
  const effects = [setNextOccurrenceSession.of(begun)];
  const { main } = state.selection;
  if (!current && main.empty) {
    const word = wordAtPosition(state, main.head)!;
    dispatch(state.update({ selection: EditorSelection.create([word]), effects }));
    return true;
  }
  const range = findNextOccurrence(state, begun);
  if (!range) {
    if (!current) dispatch(state.update({ effects }));
    return false;
  }
  dispatch(
    state.update({
      selection: state.selection.addRange(range, false),
      effects: [...effects, EditorView.scrollIntoView(range.to)],
    }),
  );
  return true;
};
