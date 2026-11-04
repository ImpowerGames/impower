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

const collapses = (view: EditorView): number => {
  settleParse(view);
  return view.dom.querySelectorAll(".collapse").length;
};

const TYPED = "\nThe next line.\n";
const ROUNDS = 6;

describe("blank-line collapse while typing at the end of a script", () => {
  it("places one collapse per blank line, as a fresh render does", () => {
    const view = mount("The first line.\n");
    for (let round = 0; round < ROUNDS; round++) {
      for (const ch of TYPED) {
        const end = view.state.doc.length;
        view.dispatch({ changes: { from: end, insert: ch } });
        settleParse(view);
      }
    }
    const typed = view.state.doc.toString();
    const blankLines = typed
      .split("\n")
      .slice(0, -1)
      .filter((line) => line.trim() === "").length;
    expect(blankLines).toBe(ROUNDS);
    expect(collapses(mount(typed))).toBe(blankLines);
    expect(collapses(view)).toBe(blankLines);
  });
});
