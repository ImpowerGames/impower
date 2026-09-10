// Keep incremental dual-dialogue rendering consistent with a fresh render,
// using a pinned large screenplay. See fixtures/README.md for provenance.

import { language } from "@codemirror/language";
import { EditorState, EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  SCREENPLAY_LANGUAGE_SUPPORT,
  default as screenplayFormatting,
} from "../src/modules/screenplay-preview/utils/screenplayFormatting";
import { LARGE_SCREENPLAY } from "./fixtures/largeScreenplay";
import { settleParse } from "./helpers/parseSettle";

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
  // Settle and commit the parse before sampling the dual region.
  settleParse(view);
  view.dispatch({
    selection: EditorSelection.single(offset),
    effects: EditorView.scrollIntoView(offset, { y: "center" }),
  });
  settleParse(view);
  view.dispatch({});
};

const contentHTML = (view: EditorView) => {
  settleParse(view);
  const c = view.dom.querySelector(".cm-content");
  expect(c).not.toBeNull();
  return c!.outerHTML.replace(
    /<div class="cm-gap" style="height: [\d.]+px;"><\/div>/g,
    `<div class="cm-gap"></div>`,
  );
};

describe("large screenplay — incremental edits in/around the dual dialogue region", () => {
  it(
    "typing inside the BUNNY [>] right-side content keeps both halves visible",
    { timeout: 120_000 },
    () => {
      const original = LARGE_SCREENPLAY;
      const anchorOffset = original.indexOf(ANCHOR);
      expect(anchorOffset).toBeGreaterThan(3000);

      const incremental = mount(original);
      scrollTo(incremental.view, anchorOffset);

      // Edit the right side's content: insert " ABSOLUTELY" into the middle
      // of the "I REFUSE TO BE..." line.
      const target = "I REFUSE TO BE 'BUNNY'-ED!";
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

  it(
    "typing a NEW directive line into the BUNNY [>] block keeps both halves visible",
    { timeout: 120_000 },
    () => {
      const original = LARGE_SCREENPLAY;
      const incremental = mount(original);
      const anchorOffset = original.indexOf(ANCHOR);
      scrollTo(incremental.view, anchorOffset);

      // Insert a new directive line right before the "I REFUSE..." line.
      const target = "    I REFUSE TO BE 'BUNNY'-ED!";
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

  it(
    "editing a line FAR from the dual region (in the title page) keeps the dual rendering",
    { timeout: 120_000 },
    () => {
      const original = LARGE_SCREENPLAY;

      const incremental = mount(original);
      // Render the dual region first so it's in the viewport.
      const anchorOffset = original.indexOf(ANCHOR);
      scrollTo(incremental.view, anchorOffset);

      // Now make a far-away edit: append " extra" to the title.
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
      // The title edit precedes the dialogue; follow its shifted position.
      scrollTo(incremental.view, anchorOffset + insertion.length);
      const incHTML = contentHTML(incremental.view);

      const after =
        original.slice(0, insertAt) + insertion + original.slice(insertAt);
      const fullRebuild = mount(after);
      scrollTo(fullRebuild.view, anchorOffset + insertion.length);
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
