// Sequential edits — the user types character-by-character (or fires
// many small change events between syntax-tree reparses). The previous
// incremental-sync test does ONE dispatch and confirms the result
// matches a from-scratch decoration set, but doesn't cover the case
// where decorations drift across MULTIPLE dispatches that happen before
// the parser reparses.
//
// Bug we're hunting: when oldTree === newTree (the parser hasn't
// caught up yet), the StateField returned decorations unchanged
// without mapping them through transaction.changes. Existing
// decorations stayed glued to outdated source positions, producing
// the "the preview deletes the old line and replaces it with the new
// one" symptom — line decorations on character cues / dialogue
// content stop matching the lines that contain them.

import { ensureSyntaxTree, language } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  SCREENPLAY_LANGUAGE_SUPPORT,
  default as screenplayFormatting,
} from "../src/modules/screenplay-preview/utils/screenplayFormatting";

const mount = (source: string): EditorView => {
  const parent = document.createElement("div");
  parent.style.width = "800px";
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({
      doc: source,
      extensions: [
        language.of(SCREENPLAY_LANGUAGE_SUPPORT.language),
        screenplayFormatting(),
      ],
    }),
    parent,
  });
};

const contentHTML = (view: EditorView): string => {
  // Force the incremental parser to catch up before sampling the DOM.
  // Otherwise the partial tree leaks decorations into the trailing
  // viewport area, producing spurious classes like 17 `collapse`s on
  // the final cm-line.
  ensureSyntaxTree(view.state, view.state.doc.length, 30_000);
  view.dispatch({}); // trigger a no-op update so decorate() re-runs against the full tree
  const c = view.dom.querySelector(".cm-content");
  if (!c) return "";
  return c.outerHTML.replace(
    /<div class="cm-gap" style="height: [\d.]+px;"><\/div>/g,
    `<div class="cm-gap"></div>`,
  );
};

describe("sequential edit sync", () => {
  it("character-by-character insertion of a new action line matches a from-scratch rebuild", () => {
    const before =
      `INT. KITCHEN - NIGHT\n` +
      `\n` +
      `Bunny enters.\n` +
      `\n` +
      `He sits down.\n`;
    const insertion = "He looks around. ";
    const insertPos = before.indexOf("He sits down.");
    expect(insertPos).toBeGreaterThan(-1);
    const after = before.slice(0, insertPos) + insertion + before.slice(insertPos);

    // Sequential: dispatch ONE character at a time, like a real user
    // typing. The parser may or may not reparse between each.
    const incremental = mount(before);
    for (let i = 0; i < insertion.length; i++) {
      incremental.dispatch({
        changes: { from: insertPos + i, insert: insertion[i]! },
      });
    }
    const incrementalHTML = contentHTML(incremental);

    const fullRebuild = mount(after);
    const fullRebuildHTML = contentHTML(fullRebuild);

    expect(incrementalHTML).toBe(fullRebuildHTML);
  });

  it("typing a new line at end of dialogue + a follow-up action line stays in sync", () => {
    const before =
      `BUNNY:\n` +
      `  Hello.\n` +
      `\n` +
      `He waits.\n`;
    // Simulate two distinct edits (e.g. user presses Enter, then types).
    // Each dispatch happens before the parser reparses the whole doc.
    const edits = [
      // (1) Press Enter at end of "Hello.": insert "\n  " (newline + indent)
      // for a continuation line under BUNNY.
      { pos: before.indexOf("\n\nHe waits"), insert: "\n  Are you home?" },
    ];
    let after = before;
    for (const e of edits) after = after.slice(0, e.pos) + e.insert + after.slice(e.pos);

    const incremental = mount(before);
    let cursor = 0;
    for (const e of edits) {
      incremental.dispatch({ changes: { from: e.pos + cursor, insert: e.insert } });
      cursor += e.insert.length;
    }
    const incrementalHTML = contentHTML(incremental);

    const fullRebuild = mount(after);
    const fullRebuildHTML = contentHTML(fullRebuild);

    expect(incrementalHTML).toBe(fullRebuildHTML);
  });

  it("rapid sequential edits across multiple distant locations stay in sync", () => {
    const before =
      `INT. CASINO - NIGHT\n` +
      `\n` +
      `A neon sign flickers.\n` +
      `\n` +
      `BUNNY:\n` +
      `  Hello.\n` +
      `\n` +
      `RAFFLES:\n` +
      `  Goodbye.\n`;
    // Three edits at different positions, applied in order. After each
    // dispatch, the cursor positions of LATER edits shift by the
    // length of the inserts before them.
    const edits: { needle: string; insert: string }[] = [
      { needle: "A neon sign flickers.", insert: "A neon sign flickers BRIGHTLY." },
      { needle: "Hello.", insert: "Hello, friend." },
      { needle: "Goodbye.", insert: "Goodbye, my friend." },
    ];
    let after = before;
    for (const e of edits) after = after.replace(e.needle, e.insert);

    const incremental = mount(before);
    for (const e of edits) {
      const pos = incremental.state.doc.toString().indexOf(e.needle);
      expect(pos).toBeGreaterThan(-1);
      incremental.dispatch({
        changes: { from: pos, to: pos + e.needle.length, insert: e.insert },
      });
    }
    const incrementalHTML = contentHTML(incremental);

    const fullRebuild = mount(after);
    const fullRebuildHTML = contentHTML(fullRebuild);

    expect(incrementalHTML).toBe(fullRebuildHTML);
  });
});
