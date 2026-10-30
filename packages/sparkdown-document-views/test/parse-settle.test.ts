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
    expect(cues.length).toBe(EXCHANGES * 2);
    expect(preview).not.toContain("<unknown>");
  });

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
      expect(syntaxTree(view.state).length).toBeLessThan(LONG_FIXTURE.length);
      settleParse(view);
      expect(syntaxTree(view.state).length).toBe(LONG_FIXTURE.length);
      view.destroy();
    } finally {
      parent.remove();
    }
  });
});
