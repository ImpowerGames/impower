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

const SIZE_KEYS = ["minWidth", "minHeight", "maxWidth", "maxHeight"];

const capsSize = (spec: Spec): string[] =>
  Object.entries(spec).flatMap(([key, value]) =>
    SIZE_KEYS.includes(key) && px(value) < 44
      ? [key]
      : value && typeof value === "object"
        ? capsSize(value as Spec).map((inner) => `${key} ${inner}`)
        : [],
  );

describe("the code editor's controls on a coarse pointer", () => {
  it("leaves every button's 44px minimum to the shared coarse-pointer rule: nothing caps a minimum or maximum below it", () => {
    expect(capsSize(EDITOR_THEME as Spec).filter((path) => /button/i.test(path))).toEqual([]);
  });

  it("give the case, word and regex toggles, which are labels, a 44px square outside the field", () => {
    const toggles = ruleFor("cm-search label:has(input[type='checkbox'])");
    expect(px(toggles["width"])).toBeGreaterThanOrEqual(44);
    expect(px(toggles["height"])).toBeGreaterThanOrEqual(44);
    expect(toggles["position"]).toBe("relative");
    expect(toggles["gridRow"]).toBe("2");
  });

  it("raise the find, replace and go-to-line fields, whose own theme sets a 32px minimum, to 44px", () => {
    expect(px((EDITOR_THEME["& .cm-textfield"] as Spec)["minHeight"])).toBe(32);
    expect(px(ruleFor("cm-search .cm-textfield")["minHeight"])).toBeGreaterThanOrEqual(44);
    expect(px(ruleFor("cm-gotoLine .cm-textfield")["height"])).toBeGreaterThanOrEqual(44);
  });
});

describe("the context menu and suggestion rows the shared rule reaches", () => {
  it("marks the context menu and each of its items with menu roles", async () => {
    const { EditorState } = await import("@codemirror/state");
    const { EditorView } = await import("@codemirror/view");
    const lsp = await import("@impower/codemirror-vscode-lsp-client/src");
    const view = new EditorView({
      state: EditorState.create({ doc: "scene start", extensions: [lsp.contextMenu()] }),
      parent: document.body.appendChild(document.createElement("div")),
    });
    try {
      lsp.showContextMenu(view, { pos: 0, x: 10, y: 10 });
      const menu = document.querySelector(".cm-context-menu");
      expect(menu?.getAttribute("role")).toBe("menu");
      const items = Array.from(document.querySelectorAll(".cm-context-menu .cm-menu-item"));
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => item.getAttribute("role") === "menuitem")).toBe(true);
    } finally {
      view.destroy();
      document.body.innerHTML = "";
    }
  });

  it("renders suggestions as role=option rows", async () => {
    const { EditorState } = await import("@codemirror/state");
    const { EditorView } = await import("@codemirror/view");
    const { autocompletion, startCompletion } = await import("@codemirror/autocomplete");
    const view = new EditorView({
      state: EditorState.create({
        doc: "sc",
        selection: { anchor: 2 },
        extensions: [autocompletion({ override: [() => ({ from: 0, options: [{ label: "scene" }, { label: "screen" }] })] })],
      }),
      parent: document.body.appendChild(document.createElement("div")),
    });
    try {
      startCompletion(view);
      await new Promise((resolve) => setTimeout(resolve, 200));
      const rows = Array.from(document.querySelectorAll(".cm-tooltip-autocomplete li"));
      expect(rows.length).toBe(2);
      expect(rows.every((row) => row.getAttribute("role") === "option")).toBe(true);
    } finally {
      view.destroy();
      document.body.innerHTML = "";
    }
  });
});

describe("focus drawn outside the shared :focus-visible rule", () => {
  it("draws the selected problem's edge while the list has keyboard focus, in Highlight under forced colours", () => {
    expect(EDITOR_THEME["& .cm-panel.cm-panel-lint ul:focus-visible [aria-selected]"]).toEqual({
      outline: "1px solid var(--accent)",
      outlineOffset: "-1px",
    });
    const forced = EDITOR_THEME["@media (forced-colors: active)"] as Spec;
    expect((forced[".cm-panel.cm-panel-lint ul:focus-visible [aria-selected]"] as Spec)["outlineColor"]).toBe("Highlight");
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
