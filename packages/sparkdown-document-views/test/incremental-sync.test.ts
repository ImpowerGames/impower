// Incremental action-line edits must produce the same preview as rendering
// the updated document from scratch. The pinned long fixture exercises edits
// beyond CodeMirror's initial parse viewport without another repository.

import { language } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  SCREENPLAY_LANGUAGE_SUPPORT,
  default as screenplayFormatting,
} from "../src/modules/screenplay-preview/utils/screenplayFormatting";
import { settleParse } from "./helpers/parseSettle";
import { LARGE_SCREENPLAY } from "./fixtures/largeScreenplay";

const mount = (source: string) => {
  const parent = document.createElement("div");
  parent.style.width = "800px";
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

const contentHTML = (view: EditorView): string => {
  // Commit the whole parse before comparing, avoiding wall-clock-dependent
  // truncation (#281). Ignore jsdom's variable off-screen gap heights.
  settleParse(view);
  const content = view.dom.querySelector(".cm-content");
  expect(content).not.toBeNull();
  return content!.outerHTML.replace(
    /<div class="cm-gap" style="height: [\d.]+px;"><\/div>/g,
    '<div class="cm-gap"></div>',
  );
};

describe("incremental edit sync", () => {
  it("inserting an action line in a large screenplay matches a from-scratch rebuild", () => {
    const after = LARGE_SCREENPLAY;
    const insertion = "A train rumbles below.   ";
    const insertPos = after.indexOf(insertion);
    expect(insertPos).toBeGreaterThan(3000);
    const before = after.slice(0, insertPos) + after.slice(insertPos + insertion.length);
    const incremental = mount(before);
    const fullRebuild = mount(after);
    try {
      incremental.view.dispatch({ changes: { from: insertPos, insert: insertion } });
      expect(contentHTML(incremental.view)).toBe(contentHTML(fullRebuild.view));
    } finally {
      incremental.view.destroy();
      incremental.parent.remove();
      fullRebuild.view.destroy();
      fullRebuild.parent.remove();
    }
  });
});
