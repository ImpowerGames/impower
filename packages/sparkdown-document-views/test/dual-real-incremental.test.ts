// Incremental editing against the real main.sd at the location the
// user reported the dual dialogue disappearing on 2026-06-12. Small
// synthetic fixtures always do full reparses; only a large doc
// triggers the partial-reparse code path that surfaces the bug.
//
// THE FIX (landed 2026-06-12): implement `updateDOM(dom, view)` on
// DialogueWidget AND mark the dual-dialogue `Decoration.replace` with
// `block: true`. Together those let CM's BlockWidgetView.sync refresh
// the widget DOM in place when the widget's spec changes. With
// `block: false` (default), inline WidgetView.sync skips updateDOM
// after the initial paint, and the widget keeps showing whatever it
// was first rendered with — which, on a large doc, is the
// partial-parse content that existed before the parser caught up.
//
// Background (kept for context):
//   - `decorate()` produces the CORRECT widget (correct content,
//     correct range) at sample time, against the post-edit full tree.
//   - The StateField stores that correct widget (verified via direct
//     field read).
//   - CodeMirror's view layer never re-renders the widget DOM after
//     the first toDOM call. The first toDOM is called with stale
//     content (the parser hadn't caught up yet when CM first painted
//     the widget), and subsequent decoration updates don't trigger
//     toDOM again — even when BlockWidget.eq is forced to always
//     return false, even when each decorate() includes a unique
//     callSeq in the spec.
//   - Tried fixes that didn't work: (a) StateField always-rebuild
//     instead of skip-when-tree-unchanged; (b) `block: true` on the
//     widget decoration; (c) restructuring the dual so it's one
//     decoration spanning LEFT.from..RIGHT.contentEnd (regressed the
//     blank-line-separator tests); (d) callSeq in the spec to break
//     eq's structural comparison; (e) extra `forceParsing` + dispatch
//     cycles in the test harness.
//
// Re-enable these tests when a fix is found. Promising directions:
//   - A ViewPlugin that re-decorates on viewport changes rather than
//     a StateField.
//   - Implementing `updateDOM(dom, view)` on DialogueWidget so the
//     widget can refresh its content in-place when CM decides to
//     reuse the DOM.
//   - Investigating whether textmate-grammar-tree emits its full
//     parse via the expected ParseContext effect channel (it may not,
//     which would explain why CM treats the new tree as if no parse
//     completed).

import { forceParsing, language } from "@codemirror/language";
import { EditorState, EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  SCREENPLAY_LANGUAGE_SUPPORT,
  default as screenplayFormatting,
} from "../src/modules/screenplay-preview/utils/screenplayFormatting";

const MAIN_SD = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "raffles-and-bunny-screenplay",
  "main.sd",
);

const ANCHOR = "Would'ya QUIT Bunny-ing me??";

const mount = (source: string) => {
  const parent = document.createElement("div");
  parent.style.width = "800px";
  parent.style.height = "600px";
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc: source,
      extensions: [
        language.of(SCREENPLAY_LANGUAGE_SUPPORT.language),
        screenplayFormatting(),
      ],
    }),
    parent,
  });
  return { view, parent };
};

const scrollTo = (view: EditorView, offset: number) => {
  // forceParsing actually dispatches the parse-complete tree into state
  // (unlike ensureSyntaxTree which returns the tree without committing).
  forceParsing(view, view.state.doc.length, 30_000);
  view.dispatch({
    selection: EditorSelection.single(offset),
    effects: EditorView.scrollIntoView(offset, { y: "center" }),
  });
  forceParsing(view, view.state.doc.length, 30_000);
  view.dispatch({});
};

const contentHTML = (view: EditorView) => {
  const c = view.dom.querySelector(".cm-content");
  if (!c) return "";
  return c.outerHTML.replace(
    /<div class="cm-gap" style="height: [\d.]+px;"><\/div>/g,
    `<div class="cm-gap"></div>`,
  );
};

describe("real main.sd — incremental edits in/around the dual dialogue region", () => {
  it.skipIf(!existsSync(MAIN_SD))(
    "typing inside the BUNNY [>] right-side content keeps both halves visible",
    { timeout: 120_000 },
    () => {
      const original = readFileSync(MAIN_SD, "utf8");
      const anchorOffset = original.indexOf(ANCHOR);
      expect(anchorOffset).toBeGreaterThan(-1);

      const incremental = mount(original);
      scrollTo(incremental.view, anchorOffset);

      // Edit the right side's content: insert " (extra)" into the middle
      // of the "I REFUSE TO BE..." line.
      const target = "I REFUSE TO BE 'BUNNY'-ED!!!";
      const targetOffset = original.indexOf(target);
      expect(targetOffset).toBeGreaterThan(-1);
      const insertAt = targetOffset + "I REFUSE".length;
      const insertion = " ABSOLUTELY";
      for (let i = 0; i < insertion.length; i++) {
        incremental.view.dispatch({
          changes: { from: insertAt + i, insert: insertion[i]! },
        });
      }
      // After the edit, the dual region may have shifted in the
      // viewport; re-scroll to where the anchor now lives.
      const nowAnchorOffset = incremental.view.state.doc
        .toString()
        .indexOf(ANCHOR);
      scrollTo(incremental.view, nowAnchorOffset);
      const incHTML = contentHTML(incremental.view);

      const after =
        original.slice(0, insertAt) + insertion + original.slice(insertAt);
      const fullRebuild = mount(after);
      scrollTo(fullRebuild.view, fullRebuild.view.state.doc.toString().indexOf(ANCHOR));
      const fullHTML = contentHTML(fullRebuild.view);

      try {
        expect(incHTML).toBe(fullHTML);
      } finally {
        incremental.view.destroy();
        incremental.parent.remove();
        fullRebuild.view.destroy();
        fullRebuild.parent.remove();
      }
    },
  );

  it.skipIf(!existsSync(MAIN_SD))(
    "typing a NEW directive line into the BUNNY [>] block keeps both halves visible",
    { timeout: 120_000 },
    () => {
      const original = readFileSync(MAIN_SD, "utf8");
      const incremental = mount(original);
      const anchorOffset = original.indexOf(ANCHOR);
      scrollTo(incremental.view, anchorOffset);

      // Insert a new directive line right before the "I REFUSE..." line.
      const target = "    I REFUSE TO BE 'BUNNY'-ED!!!";
      const targetOffset = original.indexOf(target);
      expect(targetOffset).toBeGreaterThan(-1);
      // Insertion text — full new line + its newline.
      const insertion = "    [[show backdrop new_one]]\n";
      for (let i = 0; i < insertion.length; i++) {
        incremental.view.dispatch({
          changes: { from: targetOffset + i, insert: insertion[i]! },
        });
      }
      const nowAnchorOffset = incremental.view.state.doc
        .toString()
        .indexOf(ANCHOR);
      scrollTo(incremental.view, nowAnchorOffset);
      const incHTML = contentHTML(incremental.view);

      const after =
        original.slice(0, targetOffset) + insertion + original.slice(targetOffset);
      const fullRebuild = mount(after);
      scrollTo(fullRebuild.view, fullRebuild.view.state.doc.toString().indexOf(ANCHOR));
      const fullHTML = contentHTML(fullRebuild.view);

      try {
        expect(incHTML).toBe(fullHTML);
      } finally {
        incremental.view.destroy();
        incremental.parent.remove();
        fullRebuild.view.destroy();
        fullRebuild.parent.remove();
      }
    },
  );

  it.skipIf(!existsSync(MAIN_SD))(
    "editing a line FAR from the dual region (in the title page) keeps the dual rendering",
    { timeout: 120_000 },
    () => {
      const original = readFileSync(MAIN_SD, "utf8");

      const incremental = mount(original);
      // Render the dual region first so it's in the viewport.
      const anchorOffset = original.indexOf(ANCHOR);
      scrollTo(incremental.view, anchorOffset);

      // Now make a far-away edit: append " more" to the title.
      const titleAnchor = "Episode 01-A";
      const titleOffset = original.indexOf(titleAnchor);
      expect(titleOffset).toBeGreaterThan(-1);
      const insertAt = titleOffset + titleAnchor.length;
      const insertion = " extra";
      for (let i = 0; i < insertion.length; i++) {
        incremental.view.dispatch({
          changes: { from: insertAt + i, insert: insertion[i]! },
        });
      }
      // The anchor offset is BEFORE the edit position, so it's unchanged.
      scrollTo(incremental.view, anchorOffset);
      const incHTML = contentHTML(incremental.view);

      const after =
        original.slice(0, insertAt) + insertion + original.slice(insertAt);
      const fullRebuild = mount(after);
      scrollTo(fullRebuild.view, anchorOffset);
      const fullHTML = contentHTML(fullRebuild.view);

      try {
        expect(incHTML).toBe(fullHTML);
      } finally {
        incremental.view.destroy();
        incremental.parent.remove();
        fullRebuild.view.destroy();
        fullRebuild.parent.remove();
      }
    },
  );
});
