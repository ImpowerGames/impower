// Incremental version of dual-after-single.test.ts.
//
// User report: dual dialogue not displaying. From-scratch renders OK
// (see dual-after-single.test.ts). The plausible mechanism is the same
// class of incremental-edit drift that produced the trailing-line
// "delete and replace" symptom — but applied to the dual-dialogue
// widget instead of the trailing line.
//
// Strategy: dispatch single-character insertions to build the same
// fixture as dual-after-single.test.ts and assert the resulting DOM
// matches a from-scratch render.

import { ensureSyntaxTree, language } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  SCREENPLAY_LANGUAGE_SUPPORT,
  default as screenplayFormatting,
} from "../src/modules/screenplay-preview/utils/screenplayFormatting";

const FIXTURE =
  `BUNNY:\n` +
  `  [[animate stage with shake]]\n` +
  `  ((m_todo_sfx_emotional_yelling+temp_sfx_smack))\n` +
  `  I can do crime!!\n` +
  `\n` +
  `RAFFLES [<]:\n` +
  `  B--\n` +
  `\n` +
  `BUNNY [>]:\n` +
  `  [[animate stage with shake]]\n` +
  `  ((m_todo_sfx_emotional_yelling+temp_sfx_smack))\n` +
  `  Would'ya QUIT Bunny-ing me??\n` +
  `  [[animate stage with shake]]\n` +
  `  ((m_todo_sfx_emotional_yelling+temp_sfx_smack))\n` +
  `  I REFUSE TO BE 'BUNNY'-ED!!!\n` +
  `\n` +
  `RAFFLES:\n` +
  `  Bunny, I asked if you wanted to movie hop once and you nearly had a panic attack.\n`;

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
  ensureSyntaxTree(view.state, view.state.doc.length, 30_000);
  view.dispatch({});
  const c = view.dom.querySelector(".cm-content");
  if (!c) return "";
  return c.outerHTML.replace(
    /<div class="cm-gap" style="height: [\d.]+px;"><\/div>/g,
    `<div class="cm-gap"></div>`,
  );
};

describe("dual dialogue incremental construction", () => {
  it(
    "character-by-character insertion produces the same DOM as a from-scratch render",
    { timeout: 30_000 },
    () => {
      // Start with nothing, build the fixture one character at a time.
      // ~600 single-char dispatches; passes in ~2.5s alone but crosses
      // the default 5s timeout when other test files are running in
      // parallel workers. Matches the pattern dual-real-incremental
      // already uses for long-running incremental tests.
      const incremental = mount("");
      for (let i = 0; i < FIXTURE.length; i++) {
        incremental.dispatch({
          changes: { from: i, insert: FIXTURE[i]! },
        });
      }
      const incrementalHTML = contentHTML(incremental);

      const fullRebuild = mount(FIXTURE);
      const fullRebuildHTML = contentHTML(fullRebuild);

      expect(incrementalHTML).toBe(fullRebuildHTML);
    },
  );

  it("inserting the dual pair into an already-rendered single dialogue matches from-scratch", () => {
    // The case the user likely actually hit: had the BUNNY single + the
    // final RAFFLES single, then opened a hole between them and pasted /
    // typed the dual pair in.
    const before =
      `BUNNY:\n` +
      `  [[animate stage with shake]]\n` +
      `  ((m_todo_sfx_emotional_yelling+temp_sfx_smack))\n` +
      `  I can do crime!!\n` +
      `\n` +
      `RAFFLES:\n` +
      `  Bunny, I asked if you wanted to movie hop once and you nearly had a panic attack.\n`;
    const insertion =
      `RAFFLES [<]:\n` +
      `  B--\n` +
      `\n` +
      `BUNNY [>]:\n` +
      `  [[animate stage with shake]]\n` +
      `  ((m_todo_sfx_emotional_yelling+temp_sfx_smack))\n` +
      `  Would'ya QUIT Bunny-ing me??\n` +
      `  [[animate stage with shake]]\n` +
      `  ((m_todo_sfx_emotional_yelling+temp_sfx_smack))\n` +
      `  I REFUSE TO BE 'BUNNY'-ED!!!\n` +
      `\n`;
    const insertPos = before.indexOf("RAFFLES:");
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

  it("changing a single dialogue into the LEFT half of a dual pair (typing ` [<]`) matches from-scratch", () => {
    // Suspected workflow: the user had RAFFLES: as a single dialogue
    // and converted it to `RAFFLES [<]:` by typing ` [<]` between
    // RAFFLES and the colon. The cue mutates partway through and the
    // adjacent BUNNY block that was already typed as dual right doesn't
    // re-render its container.
    const before =
      `RAFFLES:\n` +
      `  B--\n` +
      `\n` +
      `BUNNY [>]:\n` +
      `  Would'ya QUIT Bunny-ing me??\n`;
    const insertion = ` [<]`;
    const insertPos = before.indexOf(":");
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
});
