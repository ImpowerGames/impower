import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import EDITOR_THEME from "../src/modules/script-editor/constants/EDITOR_THEME";

type Spec = { [key: string]: unknown };

const coarse = EDITOR_THEME["@media (pointer: coarse)"] as Spec;
const find = EDITOR_THEME["& .cm-panel.cm-search"] as Spec;
const px = (value: unknown) => Number.parseFloat(String(value));

const ruleFor = (part: string): Spec => {
  const key = Object.keys(coarse).find((selector) => selector.includes(part));
  expect(key, `a coarse-pointer rule for ${part}`).toBeDefined();
  return coarse[key!] as Spec;
};

describe("the code editor's find and go-to-line panels on a coarse pointer", () => {
  it("give every find button a 44px square", () => {
    const buttons = ruleFor("cm-search button:not([name='close'])");
    expect(px(buttons["width"])).toBeGreaterThanOrEqual(44);
    expect(px(buttons["height"])).toBeGreaterThanOrEqual(44);
    expect(px(ruleFor("cm-search button[name='close']")["width"])).toBeGreaterThanOrEqual(44);
  });

  it("give the case, word and regex toggles a 44px square outside the field", () => {
    const toggles = ruleFor("cm-search label:has(input[type='checkbox'])");
    expect(px(toggles["width"])).toBeGreaterThanOrEqual(44);
    expect(px(toggles["height"])).toBeGreaterThanOrEqual(44);
    expect(toggles["position"]).toBe("relative");
    expect(toggles["gridRow"]).toBe("2");
  });

  it("give the find and replace fields and the go-to-line controls 44px", () => {
    expect(px(ruleFor("cm-search .cm-textfield")["minHeight"])).toBeGreaterThanOrEqual(44);
    const gotoLine = ruleFor("cm-gotoLine button");
    expect(px(gotoLine["height"])).toBeGreaterThanOrEqual(44);
    expect(px(gotoLine["minWidth"])).toBeGreaterThanOrEqual(44);
  });
});

describe("the code editor's own scroll containers", () => {
  it("keep a stable gutter on the find fields and the problems list", () => {
    const fields = find["& [contenteditable][name='search'], & [contenteditable][name='replace']"] as Spec;
    expect(fields["overflowY"]).toBe("auto");
    expect(fields["scrollbarGutter"]).toBe("stable");
    expect((EDITOR_THEME["& .cm-panel.cm-panel-lint ul"] as Spec)["scrollbarGutter"]).toBe("stable");
  });
});

describe("the code editor's focus edge", () => {
  it("draws the accent on a control's own edge and Highlight under forced colours", () => {
    expect(EDITOR_THEME["& button:focus-visible"]).toEqual({ outline: "1px solid var(--accent)", outlineOffset: "-1px" });
    const forced = EDITOR_THEME["@media (forced-colors: active)"] as Spec;
    expect(Object.values(forced).some((rule) => (rule as Spec)["outlineColor"] === "Highlight")).toBe(true);
  });
});

describe("the code editor under prefers-reduced-motion", () => {
  const css = readFileSync(resolve(__dirname, "../src/modules/script-editor/sparkdown-script-editor.css"), "utf8");

  it("removes every transition and animation inside the editor, inline styles included", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toMatch(/\.sparkdown-script-editor-root \*,/);
    expect(block).toMatch(/\.sparkdown-script-editor-root \*::before,/);
    expect(block).toMatch(/transition: none !important;/);
    expect(block).toMatch(/animation: none !important;/);
  });

  it("keeps the fold arrow's fade inside the editor root the rule covers", () => {
    const fold = (EDITOR_THEME["& .cm-foldGutter"] as Spec)["& .cm-fold-arrow"] as Spec;
    expect(fold["transition"]).toBe("opacity .25s");
    expect(css).toMatch(/\.sparkdown-script-editor-root \.editor \{[^}]*transition: opacity 0\.25s;/);
  });
});
