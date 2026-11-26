import { ensureSyntaxTree, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { vscodeLanguage } from "@impower/codemirror-vscode-language/src";
import CONFIG_DEFINITION from "@impower/sparkdown/language/sparkdown.language-config.json";
import { sparkdownGrammarFor } from "@impower/sparkdown/src/compiler/utils/sparkdownGrammarFor";
import { tags, type Tag } from "@lezer/highlight";
import { afterEach, describe, expect, it } from "vitest";
import EDITOR_HIGHLIGHTS from "../src/modules/script-editor/constants/EDITOR_HIGHLIGHTS";

const SCRIPT = ["scene start", "  BUNNY [shout]: I'm busy!", "  RAFFLES [<]: Well--", "end"].join("\n");

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
});

const classesOf = (text: string) => {
  const span = [...view!.contentDOM.querySelectorAll("span")].find((el) => el.textContent === text);
  expect(span, text).toBeDefined();
  return [...span!.classList];
};

const classOf = (tag: Tag) => EDITOR_HIGHLIGHTS.style([tag])!;

describe("the editor colours a cue's bracket word as a variant (#2741)", () => {
  it("marks the word as a label and its brackets as brackets, not as an escape", () => {
    view = new EditorView({
      state: EditorState.create({
        doc: SCRIPT,
        extensions: [
          vscodeLanguage({
            name: "sparkdown",
            grammar: sparkdownGrammarFor("file:///main.sd"),
            configs: { sparkdown: CONFIG_DEFINITION as never },
          }),
          syntaxHighlighting(EDITOR_HIGHLIGHTS),
        ],
      }),
      parent: document.body.appendChild(document.createElement("div")),
    });
    ensureSyntaxTree(view.state, view.state.doc.length, 5000);
    view.dispatch({});
    for (const word of ["shout", "<"]) {
      expect(classesOf(word)).toContain(classOf(tags.labelName));
      expect(classesOf(word)).not.toContain(classOf(tags.escape));
    }
    expect(classesOf("[")).toContain(classOf(tags.bracket));
    expect(classesOf("[")).not.toContain(classOf(tags.escape));
  });
});
