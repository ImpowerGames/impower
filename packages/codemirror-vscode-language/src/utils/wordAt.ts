import {
  EditorSelection,
  type EditorState,
  type SelectionRange,
} from "@codemirror/state";

const GLOBAL_PATTERNS = new WeakMap<RegExp, RegExp>();

const globalPattern = (pattern: RegExp): RegExp => {
  let global = GLOBAL_PATTERNS.get(pattern);
  if (!global) {
    global = new RegExp(
      pattern.source,
      pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
    );
    GLOBAL_PATTERNS.set(pattern, global);
  }
  return global;
};

export const wordAt = (
  state: EditorState,
  pos: number,
): SelectionRange | null => {
  const pattern = state.languageDataAt<RegExp>("wordPattern", pos)[0];
  if (!pattern) {
    return state.wordAt(pos);
  }
  const line = state.doc.lineAt(pos);
  const offset = pos - line.from;
  for (const match of line.text.matchAll(globalPattern(pattern))) {
    const start = match.index ?? 0;
    if (start > offset) {
      break;
    }
    const end = start + match[0].length;
    if (end > start && offset <= end) {
      return EditorSelection.range(line.from + start, line.from + end);
    }
  }
  return null;
};
