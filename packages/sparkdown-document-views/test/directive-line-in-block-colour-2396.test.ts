import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { vscodeLanguage } from "@impower/codemirror-vscode-language/src";
import CONFIG_DEFINITION from "@impower/sparkdown/language/sparkdown.language-config.json";
import { sparkdownGrammarFor } from "@impower/sparkdown/src/compiler/utils/sparkdownGrammarFor";
import { highlightTree } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import EDITOR_HIGHLIGHTS from "../src/modules/script-editor/constants/EDITOR_HIGHLIGHTS";

const language = vscodeLanguage({
  name: "sparkdown",
  grammar: sparkdownGrammarFor("file:///main.sd"),
  configs: { sparkdown: CONFIG_DEFINITION as never },
});

const classColours = new Map<string, { colour: string; order: number }>();
EDITOR_HIGHLIGHTS.specs.forEach((spec, order) => {
  const className = EDITOR_HIGHLIGHTS.style(Array.isArray(spec.tag) ? spec.tag : [spec.tag]);
  if (className && typeof spec["color"] === "string") {
    classColours.set(className, { colour: spec["color"], order });
  }
});

const colourOfClasses = (classes: string): string | undefined => {
  let winner: { colour: string; order: number } | undefined;
  for (const className of classes.split(" ")) {
    const candidate = classColours.get(className);
    if (candidate && (!winner || candidate.order > winner.order)) {
      winner = candidate;
    }
  }
  return winner?.colour;
};

const colours = (doc: string): (string | undefined)[] => {
  const state = EditorState.create({ doc, extensions: [language] });
  const tree = ensureSyntaxTree(state, doc.length, 5000);
  expect(tree).toBeTruthy();
  const perChar: (string | undefined)[] = new Array(doc.length).fill(undefined);
  highlightTree(tree!, EDITOR_HIGHLIGHTS, (from, to, classes) => {
    const colour = colourOfClasses(classes);
    for (let i = from; i < to; i++) perChar[i] = colour;
  });
  return perChar;
};

const HEADS = ["BUNNY:", "BUNNY (softly):", ":", "^:", "%:", "$:", "@hud:"];

const LINES = [
  "[[show overlay bunny@serious]]",
  "[[hide overlay bunny]]",
  "((play music theme))",
  "[[bunny@serious]] ((play music theme))",
];

describe("a directive line inside a display block is coloured as at scene level (I-2396)", () => {
  for (const head of HEADS) {
    for (const line of LINES) {
      it(`${head} ${line}`, () => {
        const doc = `scene start\n  ${line}\n  ${head}\n    ${line}\n    Hello.\nend\n`;
        const scene = doc.indexOf(line);
        const block = doc.indexOf(line, scene + line.length);
        const perChar = colours(doc);
        const visible = [...line].flatMap((char, i) => (/\S/.test(char) ? [i] : []));
        const sceneColours = visible.map((i) => `${line[i]} ${perChar[scene + i]}`);
        const blockColours = visible.map((i) => `${line[i]} ${perChar[block + i]}`);
        expect(blockColours).toEqual(sceneColours);
      });
    }
  }
});
