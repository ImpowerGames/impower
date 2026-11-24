import { EditorState } from "@codemirror/state";
import { EditorView, showPanel } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import EDITOR_THEME from "../src/modules/script-editor/constants/EDITOR_THEME";

let view: EditorView | undefined;

const panel = (className: string, hidden = false) =>
  showPanel.of(() => {
    const dom = document.createElement("div");
    dom.className = className;
    dom.hidden = hidden;
    return { dom, top: false };
  });

const mount = (...extensions: readonly unknown[]) => {
  const parent = document.body.appendChild(document.createElement("div"));
  view = new EditorView({
    state: EditorState.create({
      doc: "scene start",
      extensions: [
        ...(extensions as never[]),
        EditorView.theme(EDITOR_THEME, { dark: true }),
      ],
    }),
    parent,
  });
  return view;
};

const specificity = (selector: string) => {
  const ids = (selector.match(/#[^\s.:#[>+~,()]+/g) || []).length;
  const classes = (selector.match(/[.:[][^\s.:#[>+~,()]+/g) || []).length;
  const types = (
    selector.replace(/[.#:[][^\s>+~,()]*/g, " ").match(/[a-zA-Z][\w-]*/g) || []
  ).length;
  return ids * 10_000 + classes * 100 + types;
};

const resolved = (el: Element, prop: string) => {
  let winner: string | null = null;
  let bestKey = -1;
  let order = 0;
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRule[] = [];
    try {
      rules = Array.from(sheet.cssRules);
    } catch {
      continue;
    }
    for (const rule of rules) {
      order += 1;
      const styleRule = rule as CSSStyleRule;
      if (typeof styleRule.selectorText !== "string") continue;
      const value = styleRule.style?.getPropertyValue(prop);
      if (!value) continue;
      for (const selector of styleRule.selectorText.split(",")) {
        const sel = selector.trim();
        if (!sel) continue;
        let matched = false;
        try {
          matched = el.matches(sel);
        } catch {
          continue;
        }
        if (!matched) continue;
        const key = specificity(sel) * 1_000_000 + order;
        if (key > bestKey) {
          bestKey = key;
          winner = value;
        }
      }
    }
  }
  return winner;
};

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
});

describe("the line above the writer bar (I-2716)", () => {
  it("draws no edge on the bottom panels' container, so a hidden status line and a hidden toolbar add nothing to the bar's own border", () => {
    const editor = mount(
      panel("cm-toolbar cm-status", true),
      panel("cm-toolbar cm-keyboard-toolbar"),
    );
    const panels = editor.dom.querySelector(".cm-panels-bottom")!;
    expect(resolved(panels, "border-top") ?? "none").not.toMatch(/solid/);
  });

  it("puts the divider on the status line itself, the one bottom panel without an edge of its own", () => {
    const editor = mount(panel("cm-toolbar cm-status"));
    const status = editor.dom.querySelector(".cm-panels-bottom > .cm-status")!;
    expect(resolved(status, "border-top")).toBe("1px solid var(--editor-panel-edge)");
  });
});
