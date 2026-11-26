import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  scriptAppearance,
  setScriptAppearance,
} from "../src/cm-script-appearance/scriptAppearance";
import type { ScriptAppearance } from "../src/cm-script-appearance/scriptAppearanceOptions";
import EDITOR_THEME from "../src/modules/script-editor/constants/EDITOR_THEME";
import { ALL_OFF_APPEARANCE } from "./fixtures/scriptAppearance";

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.replaceChildren();
});

const mount = (appearance: ScriptAppearance) => {
  view = new EditorView({
    state: EditorState.create({
      doc: "one\ntwo\nthree",
      extensions: [
        lineNumbers(),
        EditorView.theme(EDITOR_THEME, { dark: true }),
        scriptAppearance(appearance),
      ],
    }),
    parent: document.body.appendChild(document.createElement("div")),
  });
  return view;
};

const gutterTransition = () => {
  const cell = view!.dom.querySelector(".cm-lineNumbers .cm-gutterElement");
  expect(cell).not.toBeNull();
  const root = view!.dom.getRootNode() as Document | ShadowRoot;
  const sheets = [
    ...Array.from(document.styleSheets),
    ...(root.adoptedStyleSheets ?? []),
  ];
  return sheets
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .filter(
      (rule): rule is CSSStyleRule =>
        rule instanceof CSSStyleRule && cell!.matches(rule.selectorText),
    )
    .map((rule) => rule.style.transition)
    .filter(Boolean)
    .join(" ");
};

describe("line-number gutter motion", () => {
  for (const on of [false, true]) {
    it(`does not transition the gutter when an editor mounts with line numbers ${on ? "on" : "off"}`, () => {
      mount({ ...ALL_OFF_APPEARANCE, lineNumbers: on });
      expect(gutterTransition()).not.toMatch(/opacity/);
    });

    it(`transitions the gutter once line numbers are toggled ${on ? "off" : "on"}`, () => {
      const previous = { ...ALL_OFF_APPEARANCE, lineNumbers: on };
      const v = mount(previous);
      setScriptAppearance(v, previous, { ...previous, lineNumbers: !on });
      expect(gutterTransition()).toMatch(/opacity/);
    });
  }
});
