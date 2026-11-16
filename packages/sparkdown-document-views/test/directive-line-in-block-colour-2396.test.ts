import { ensureSyntaxTree, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { vscodeLanguage } from "@impower/codemirror-vscode-language/src";
import CONFIG_DEFINITION from "@impower/sparkdown/language/sparkdown.language-config.json";
import { sparkdownGrammarFor } from "@impower/sparkdown/src/compiler/utils/sparkdownGrammarFor";
import { afterEach, describe, expect, it } from "vitest";
import { scriptAppearance } from "../src/cm-script-appearance/scriptAppearance";
import type { ScriptAppearance } from "../src/cm-script-appearance/scriptAppearanceOptions";
import EDITOR_HIGHLIGHTS from "../src/modules/script-editor/constants/EDITOR_HIGHLIGHTS";
import EDITOR_THEME from "../src/modules/script-editor/constants/EDITOR_THEME";
import { ALL_OFF_APPEARANCE, ALL_ON_APPEARANCE } from "./fixtures/scriptAppearance";

const language = vscodeLanguage({
  name: "sparkdown",
  grammar: sparkdownGrammarFor("file:///main.sd"),
  configs: { sparkdown: CONFIG_DEFINITION as never },
});

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
});

const mount = (doc: string, appearance: ScriptAppearance) => {
  const parent = document.body.appendChild(document.createElement("div"));
  view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        language,
        syntaxHighlighting(EDITOR_HIGHLIGHTS),
        scriptAppearance(appearance),
        EditorView.theme(EDITOR_THEME, { dark: true }),
      ],
    }),
    parent,
  });
  ensureSyntaxTree(view.state, doc.length, 5000);
  view.dispatch({});
};

const renderedColours = (): Map<number, string> => {
  const colours = new Map<number, string>();
  const walker = document.createTreeWalker(view!.contentDOM, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const start = view!.posAtDOM(text, 0);
    const colour = getComputedStyle(text.parentElement!).getPropertyValue("color");
    for (let i = 0; i < (text.textContent ?? "").length; i++) {
      colours.set(start + i, colour);
    }
  }
  return colours;
};

const visibleColours = (colours: Map<number, string>, line: string, from: number) =>
  [...line].flatMap((char, i) => (/\S/.test(char) ? [`${char} ${colours.get(from + i)}`] : []));

const HEADS = ["BUNNY:", "BUNNY (softly):", ":", "^:", "%:", "$:", "@hud:"];

const LINES = [
  "[[show overlay bunny@serious]]",
  "[[hide overlay bunny]]",
  "((play music theme))",
  "[[bunny@serious]] ((play music theme))",
];

const APPEARANCES: [string, ScriptAppearance][] = [
  ["untinted", ALL_OFF_APPEARANCE],
  ["tinted", ALL_ON_APPEARANCE],
];

describe("a directive line inside a display block is coloured as at scene level (I-2396)", () => {
  for (const [appearanceName, appearance] of APPEARANCES) {
    for (const head of HEADS) {
      for (const line of LINES) {
        it(`${appearanceName} ${head} ${line}`, () => {
          const doc = `scene start\n  ${line}\n  ${head}\n    ${line}\n    Hello.\nend\n`;
          const scene = doc.indexOf(line);
          const block = doc.indexOf(line, scene + line.length);
          mount(doc, appearance);
          const colours = renderedColours();
          expect(visibleColours(colours, line, scene).filter((entry) => !/ var\(--syntax-[a-z-]+\)$/.test(entry))).toEqual([]);
          expect(visibleColours(colours, line, block)).toEqual(visibleColours(colours, line, scene));
        });
      }
    }
  }
});
