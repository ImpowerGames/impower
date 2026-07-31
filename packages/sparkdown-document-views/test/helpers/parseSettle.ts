// Make CodeMirror's syntax tree deterministic before a test reads it.
//
// Why this exists (the cause of #281's one-random-failure-per-run):
//
// `@codemirror/language` parses on a WALL-CLOCK budget, not to completion.
// `LanguageState.init` gives the initial parse 20ms over the first 3000
// characters and calls `takeTree()` — truncating the tree — if it runs out.
// So the tree a freshly-created `EditorState`/`EditorView` exposes depends on
// how loaded the machine was at that instant. Under a full suite run (~100s,
// most of it jsdom setup) a fixture that parses completely when run alone
// parses only partway, and any assertion about "what the preview shows" reads
// a document that's missing its tail. That's the "expected 1 to be greater
// than or equal to 2" class of failure: a second character cue that simply
// hadn't been parsed yet.
//
// The two functions below force the parse to finish AND commit the finished
// tree where the reader will actually see it. Committing is the subtle part:
//
//   `ensureSyntaxTree(state, len, timeout)` finishes the parse and RETURNS the
//   complete tree, but it only mutates the mutable `ParseContext` hanging off
//   the state field. `syntaxTree(state)` reads `field.tree`, a snapshot taken
//   when the field was constructed — so it still hands back the truncated
//   tree. Callers must use the RETURN VALUE (`completeTree`) or dispatch a
//   transaction to refresh the field (`settleParse`, via `forceParsing`).

import { ensureSyntaxTree, forceParsing } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { Tree } from "@lezer/common";

// Generous: these are whole-fixture parses, and the point is to never let the
// wall clock decide the result. A fixture that genuinely needs 30s of parsing
// is a bug worth failing on.
export const PARSE_TIMEOUT_MS = 30_000;

/**
 * Parse `state`'s document to completion and return the complete tree.
 *
 * Use the returned tree — do NOT follow this with `syntaxTree(state)`, which
 * still returns the truncated snapshot (see the note at the top of the file).
 */
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

/**
 * Parse `view`'s document to completion and re-run the decoration field
 * against the complete tree, so the rendered DOM is safe to read.
 *
 * `forceParsing` dispatches an empty transaction when the tree changed, which
 * refreshes the language state field; `replaceDecorations.update` then sees a
 * new tree and recomputes every decoration from it.
 */
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
