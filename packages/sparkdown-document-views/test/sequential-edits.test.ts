import { language } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  SCREENPLAY_LANGUAGE_SUPPORT,
  default as screenplayFormatting,
} from "../src/modules/screenplay-preview/utils/screenplayFormatting";
import { settleParse } from "./helpers/parseSettle";

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
  settleParse(view);
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
    const edits = [
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
