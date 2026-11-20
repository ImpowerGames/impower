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

const installedCss = () => [...document.querySelectorAll("style")].map((style) => style.textContent ?? "").join("\n");

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const reducedMotionRules = () => {
  const css = installedCss();
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
    const css = installedCss();
    const overrideAt = css.lastIndexOf("@media (prefers-reduced-motion: reduce)");
    for (const selector of moving) {
      expect(reduced, selector).toMatch(new RegExp(`[^{}]*${escape(selector)}[^{}]*\\{[^}]*transition:\\s*none`));
      const base = [...css.matchAll(new RegExp(`[^{}]*${escape(selector)}[^{}]*\\{[^}]*transition:(?!\\s*none)`, "g"))];
      expect(base.length, selector).toBeGreaterThan(0);
      expect(base.at(-1)!.index, `${selector} is declared after its reduced-motion override, which then loses the cascade`).toBeLessThan(overrideAt);
    }
  });
});
