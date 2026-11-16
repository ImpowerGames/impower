import { ensureSyntaxTree, forceParsing, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { Tree } from "@lezer/common";

export const PARSE_TIMEOUT_MS = 30_000;

export const completeTree = (state: EditorState): Tree => {
  const tree = ensureSyntaxTree(state, state.doc.length, PARSE_TIMEOUT_MS);
  if (!tree) {
    throw new Error(
      `Parse did not complete within ${PARSE_TIMEOUT_MS}ms for a ${state.doc.length}-character document. ` +
        `Either the parser is stuck or no language is configured on this state.`,
    );
  }
  return tree;
};

export const replaceWithParseCut = (view: EditorView, text: string, clockReads: number): number => {
  const realNow = Date.now;
  const start = realNow();
  let reads = 0;
  Date.now = () => (reads++ < clockReads ? start : start + PARSE_TIMEOUT_MS);
  try {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  } finally {
    Date.now = realNow;
  }
  return syntaxTree(view.state).length;
};

export const settleParse = (view: EditorView): void => {
  const complete = forceParsing(
    view,
    view.state.doc.length,
    PARSE_TIMEOUT_MS,
  );
  if (!complete) {
    throw new Error(
      `Parse did not complete within ${PARSE_TIMEOUT_MS}ms for a ${view.state.doc.length}-character document.`,
    );
  }
};
