import { openSearchPanel } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView, showPanel } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import EDITOR_THEME from "../src/modules/script-editor/constants/EDITOR_THEME";
import { customSearchPanel } from "../src/modules/script-editor/utils/extensions/customSearch";

const HOST_CHROME_Z_MIN = 10;
const HOST_CHROME_Z_MAX = 20;
const HOST_DIALOG_Z = 50;

let view: EditorView | undefined;

const mount = (...extensions: readonly unknown[]) => {
  const parent = document.body.appendChild(document.createElement("div"));
  view = new EditorView({
    state: EditorState.create({
      doc: "$:\n  A MOONLIT ROOFTOP\n",
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

const resolvedZ = (el: Element) => {
  const raw = resolved(el, "z-index");
  return raw === null ? null : Number(raw);
};

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
});

describe("editor panel layering vs the host app's chrome (#337)", () => {
  it("resolves the theme's own selectors by specificity", () => {
    expect(specificity(".ͼ5 .cm-panels.cm-panels-top")).toBeGreaterThan(
      specificity(".ͼ5 .cm-panels")
    );
  });

  it("keeps the open search panel above the host's header band", () => {
    const view = mount(customSearchPanel());
    openSearchPanel(view);

    const panels = view.dom.querySelector(".cm-panels-top");
    const panel = view.dom.querySelector<HTMLElement>(".cm-panel.cm-search");
    expect(panels).toBeTruthy();
    expect(panel).toBeTruthy();

    expect(resolved(panel!, "margin-top")).toBe("-48px");

    const z = resolvedZ(panels!);
    expect(z).not.toBeNull();
    expect(Number.isFinite(z)).toBe(true);
    expect(z!).toBeGreaterThan(HOST_CHROME_Z_MAX);
    expect(z!).toBeLessThan(HOST_DIALOG_Z);

    const tooltip = document.createElement("div");
    tooltip.className = "cm-tooltip";
    view.dom.appendChild(tooltip);
    const tooltipZ = resolvedZ(tooltip);
    expect(tooltipZ).not.toBeNull();
    expect(z!).toBeLessThan(tooltipZ!);
  });

  it("leaves bottom panels below the whole host chrome band", () => {
    const view = mount(
      showPanel.of(() => ({
        dom: Object.assign(document.createElement("div"), {
          className: "cm-status-bar",
        }),
        top: false,
      }))
    );

    const panels = view.dom.querySelector(".cm-panels-bottom");
    expect(panels).toBeTruthy();

    const z = resolvedZ(panels!);
    expect(z).not.toBeNull();
    expect(Number.isFinite(z)).toBe(true);
    expect(z!).toBeLessThan(HOST_CHROME_Z_MIN);
  });
});
