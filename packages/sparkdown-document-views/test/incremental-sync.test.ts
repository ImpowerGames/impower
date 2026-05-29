// When the user edits a script, the screenplay-preview CodeMirror view
// receives transactions and updates its decoration set incrementally
// (see replaceDecorations.update in screenplayFormatting.ts). This test
// pins down the invariant that the incremental update must agree with a
// from-scratch decoration of the post-edit document.
//
// Bug we're hunting:
//   - "A train rumbles below." inserted at the start of an action line
//     doesn't appear in the preview.
//   - The trailing "E" of "SUBWAY ENTRANCE" loses its bold styling.
// Both symptoms are explained by the partial reparse window dropping
// decorations adjacent to the edit and not regenerating them.

import { language } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
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

// CodeMirror reserves vertical space for unrendered (off-screen) lines via
// a `.cm-gap` div. Under jsdom there's no layout engine, so the estimated
// height of that gap is computed from defaults and varies run-to-run even
// for identical decoration sets. Strip it out — we care about the rendered
// line decorations, not how many estimated pixels were reserved for the
// virtual scroll.
const contentHTML = (view: EditorView): string => {
  const c = view.dom.querySelector(".cm-content");
  if (!c) return "";
  return c.outerHTML.replace(
    /<div class="cm-gap" style="height: [\d.]+px;"><\/div>/g,
    `<div class="cm-gap"></div>`,
  );
};

// We use the real screenplay file as the fixture so the doc is big enough
// for the parser to take the partial-reparse code path (small fixtures
// just do full reparses and would mask the bug).
const MAIN_SD = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "raffles-and-bunny-screenplay",
  "main.sd",
);

describe("incremental edit sync", () => {
  it.skipIf(!existsSync(MAIN_SD))(
    "inserting 'A train rumbles below.' in main.sd matches a from-scratch rebuild",
    () => {
      const after = readFileSync(MAIN_SD, "utf8");
      const insertion = "A train rumbles below.   ";
      const insertPos = after.indexOf(insertion);
      expect(insertPos).toBeGreaterThan(-1);
      // Reconstruct the "before" state by removing the insertion.
      const before =
        after.slice(0, insertPos) + after.slice(insertPos + insertion.length);

      const incremental = mount(before);
      incremental.dispatch({
        changes: { from: insertPos, insert: insertion },
      });
      const incrementalHTML = contentHTML(incremental);

      const fullRebuild = mount(after);
      const fullRebuildHTML = contentHTML(fullRebuild);

      expect(incrementalHTML).toBe(fullRebuildHTML);
    },
  );
});
