// Regression guard for #281: "full-suite runs fail one test per run, a
// different one each time".
//
// Root cause: `@codemirror/language` budgets the initial parse by wall clock
// (20ms, over at most the first 3000 characters) and truncates the tree if it
// runs out. Every helper that read the tree straight after creating a state or
// view was therefore reading a document whose tail hadn't been parsed yet —
// how much tail depended on how busy the machine was. Alone: fine. Inside a
// ~100s full-suite run: a random test each time saw a short document and
// failed on a count or a missing decoration.
//
// These tests use a fixture deliberately LONGER than the 3000-character
// initial-parse viewport, which makes the truncation unconditional rather than
// load-dependent. So they fail deterministically if a helper ever goes back to
// reading the un-settled tree — no flake-chasing required.

import { language, syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { completeTree, settleParse } from "./helpers/parseSettle";
import { extractPreviewText } from "./helpers/previewText";
import {
  SCREENPLAY_LANGUAGE_SUPPORT,
  default as screenplayFormatting,
} from "../src/modules/screenplay-preview/utils/screenplayFormatting";

// One self-contained dialogue exchange, ~150 characters.
const EXCHANGE = (n: number) =>
  `RAFFLES:\n` +
  `  [[raffles_concerned~coat]]\n` +
  `  Take ${n}, and no arguing about it.\n` +
  `\n` +
  `BUNNY:\n` +
  `  [[bunny_realization~jacket]]\n` +
  `  Right you are, old chap.\n` +
  `\n`;

const EXCHANGES = 30;
const LONG_FIXTURE = Array.from({ length: EXCHANGES }, (_, i) =>
  EXCHANGE(i + 1),
).join("");

// The whole point of the fixture: it must exceed the initial-parse viewport,
// so a helper that reads the un-settled tree sees a truncated document every
// single run rather than only on a loaded machine.
const INIT_PARSE_VIEWPORT = 3000;

describe("parse settling (regression guard for #281)", () => {
  it("the fixture is longer than CodeMirror's initial-parse viewport", () => {
    expect(LONG_FIXTURE.length).toBeGreaterThan(INIT_PARSE_VIEWPORT);
  });

  it("completeTree parses the whole document, not just the initial viewport", () => {
    const state = EditorState.create({
      doc: LONG_FIXTURE,
      extensions: [language.of(SCREENPLAY_LANGUAGE_SUPPORT.language)],
    });
    expect(completeTree(state).length).toBe(LONG_FIXTURE.length);
  });

  it("extractPreviewText classifies every character cue, including past the initial viewport", () => {
    const preview = extractPreviewText(LONG_FIXTURE);
    const cues = preview
      .split("\n")
      .filter((l) => l.startsWith("<character>"));
    // Two cues per exchange. A truncated tree leaves the tail unclassified
    // (`<unknown>`), which is exactly how #281 showed up: "expected 1 to be
    // greater than or equal to 2".
    expect(cues.length).toBe(EXCHANGES * 2);
    expect(preview).not.toContain("<unknown>");
  });

  // This is the invariant the DOM-reading helpers (renderPreview,
  // extractVisibleText) and the incremental-edit tests all depend on: after
  // settling, the tree the decoration field sees covers the whole document.
  // Asserting it here rather than through rendered output is deliberate — a
  // CodeMirror view only renders its viewport (under jsdom that's the first
  // handful of lines; the rest is a `cm-gap` placeholder), so rendered output
  // can't distinguish "parse stopped early" from "not in the viewport".
  it("settleParse commits the complete tree into the view's state", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    try {
      const view = new EditorView({
        state: EditorState.create({
          doc: LONG_FIXTURE,
          extensions: [
            language.of(SCREENPLAY_LANGUAGE_SUPPORT.language),
            screenplayFormatting(),
          ],
        }),
        parent,
      });
      // Sanity: without settling, the tree really is short — that's the
      // hazard, and it's what makes this guard meaningful.
      expect(syntaxTree(view.state).length).toBeLessThan(LONG_FIXTURE.length);
      settleParse(view);
      expect(syntaxTree(view.state).length).toBe(LONG_FIXTURE.length);
      view.destroy();
    } finally {
      parent.remove();
    }
  });
});
