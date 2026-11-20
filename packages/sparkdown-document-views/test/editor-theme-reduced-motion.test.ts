import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import EDITOR_THEME from "../src/modules/script-editor/constants/EDITOR_THEME";

type Spec = Record<string, Record<string, unknown>>;

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
});

const reducedMotionRules = () => {
  const css = [...document.querySelectorAll("style")].map((style) => style.textContent ?? "").join("\n");
  const blocks: string[] = [];
  const pattern = /@media \(prefers-reduced-motion: reduce\)\s*\{/g;
  for (let match = pattern.exec(css); match; match = pattern.exec(css)) {
    let depth = 1;
    let at = pattern.lastIndex;
    while (at < css.length && depth > 0) {
      if (css[at] === "{") depth++;
      if (css[at] === "}") depth--;
      at++;
    }
    blocks.push(css.slice(pattern.lastIndex, at - 1));
  }
  return blocks.join("\n");
};

describe("the script editor theme under reduced motion", () => {
  it("turns off every transition it declares, in the CSS the editor installs", () => {
    view = new EditorView({
      state: EditorState.create({ doc: "scene start\nend\n", extensions: [EditorView.theme(EDITOR_THEME, { dark: true })] }),
      parent: document.body.appendChild(document.createElement("div")),
    });
    const moving = Object.entries(EDITOR_THEME as unknown as Spec)
      .filter(([key, style]) => !key.startsWith("@") && typeof style["transition"] === "string" && style["transition"] !== "none")
      .flatMap(([key]) => key.split(",").map((s) => s.trim().replace(/^&\s*/, "")));
    expect(moving.length).toBeGreaterThan(0);
    const reduced = reducedMotionRules();
    for (const selector of moving) {
      const rule = new RegExp(`[^{}]*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^{}]*\\{[^}]*transition:\\s*none`);
      expect(reduced, selector).toMatch(rule);
    }
  });
});
