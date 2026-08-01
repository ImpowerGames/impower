import { openSearchPanel } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView, showPanel } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import EDITOR_THEME from "../src/modules/script-editor/constants/EDITOR_THEME";
import { customSearchPanel } from "../src/modules/script-editor/utils/extensions/customSearch";

// The layers the editor is sandwiched between. Nothing between `.cm-panels`
// and <body> establishes a stacking context, so the numbers this theme picks
// compete with the host's directly.
//
// Bottom of the host chrome band -- every sticky header and tab bar in the web
// editor (FileEditorNavigation.tsx:35, MainWindow.tsx:93/125,
// HeaderNavigation.tsx:116, LogicList.tsx:83, Assets.tsx:73, Share.tsx:31).
// Editor chrome that does NOT overlap the host must stay under this.
const HOST_CHROME_Z_MIN = 10;
// Top of that band: the progress strip this package paints over the host's
// tab row (SparkdownScriptEditor.tsx:131, `zIndex: 20`). A top panel that
// covers the header has to clear the whole band, not just its floor.
const HOST_CHROME_Z_MAX = 20;
// The host's dialogs (TrashPanel.tsx:179, ConflictDialogHost.tsx:59,
// AddUrlDialog.tsx:82, ...), toasts (60) and drag overlay (400) must still
// cover the editor.
const HOST_DIALOG_Z = 50;

let view: EditorView | undefined;

const mount = (...extensions: readonly unknown[]) => {
  const parent = document.body.appendChild(document.createElement("div"));
  view = new EditorView({
    state: EditorState.create({
      doc: "$:\n  A MOONLIT ROOFTOP\n",
      extensions: [
        ...(extensions as never[]),
        // `{ dark: true }` mirrors createEditorView.ts:496 -- the production
        // mount -- so this resolves the same rule set the app does.
        EditorView.theme(EDITOR_THEME, { dark: true }),
      ],
    }),
    parent,
  });
  return view;
};

// getComputedStyle is NOT usable here: jsdom applies matching rules in source
// order and ignores specificity, so `.cm-panels.cm-panels-top { z-index: 30 }`
// reads as 2 whenever it happens to be written ABOVE `.cm-panels`. Verified
// directly -- a browser resolves that pair to 30, jsdom to 2. Reading the
// cascade the way a real browser does keeps this test from going red on a
// pure reordering, and from passing on a rule a browser would discard.
// Not a general CSS specificity implementation -- just enough for the flat
// class/descendant selectors these themes emit. The character classes must NOT
// be \w-based: CodeMirror's generated theme class is a non-ASCII identifier
// (`.ͼ5`), and \w would skip it and undercount every selector by one.
const specificity = (selector: string) => {
  const ids = (selector.match(/#[^\s.:#[>+~,()]+/g) || []).length;
  const classes = (selector.match(/[.:[][^\s.:#[>+~,()]+/g) || []).length;
  const types = (
    selector.replace(/[.#:[][^\s>+~,()]*/g, " ").match(/[a-zA-Z][\w-]*/g) || []
  ).length;
  return ids * 10_000 + classes * 100 + types;
};

/**
 * The winning declaration for `prop` (kebab-case) on `el` among the top-level
 * style rules in the document, ordered by (specificity, source order) the way
 * a browser would. At-rules and `!important` are NOT handled -- this resolves
 * the flat rule set these themes emit, not the full cascade. Returns null when
 * no rule declares it, so a selector that stopped matching fails loudly
 * instead of reading as an empty string.
 *
 * Read via getPropertyValue, NOT `rule.style.zIndex`: jsdom's CSSStyleRule
 * exposes no camelCase accessors, so the camelCase form silently yields
 * undefined and every assertion built on it passes vacuously.
 */
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
        // Other extensions mount selectors jsdom's matcher cannot parse
        // (statusPanel.ts uses `:has(...)`). A rule we cannot evaluate must be
        // skipped, not allowed to red the whole test.
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

/** Declared z-index, or null if no rule sets one. Never coerces null to 0. */
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
  // The resolver above is the harness the two real tests stand on; if its
  // specificity ordering is wrong they both assert the wrong rule.
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

    // The theme pulls the top panel UP into the host's 48px header band. That
    // overlap is the whole reason the z-index matters, so assert it directly
    // rather than guarding on it -- a guard would delete the assertion below
    // the moment the overlap is expressed some other way.
    expect(resolved(panel!, "margin-top")).toBe("-48px");

    // Overlapping is only safe if the panel also outranks what it overlaps. At
    // the inherited z-index 2 the header painted over the entire Find row --
    // search input, toggles, next/prev and close all invisible and unclickable.
    const z = resolvedZ(panels!);
    expect(z).not.toBeNull();
    expect(Number.isFinite(z)).toBe(true);
    expect(z!).toBeGreaterThan(HOST_CHROME_Z_MAX);
    // ...but not so high that it covers the host's dialogs and toasts.
    expect(z!).toBeLessThan(HOST_DIALOG_Z);

    // The editor's own popups must still overhang an open panel -- autocomplete
    // and hover tooltips render outside the panel and have to stay on top of
    // it. Nothing else pins this ceiling, so a future bump past 300 would hide
    // completions with no other test noticing.
    const tooltip = document.createElement("div");
    tooltip.className = "cm-tooltip";
    view.dom.appendChild(tooltip);
    const tooltipZ = resolvedZ(tooltip);
    expect(tooltipZ).not.toBeNull();
    expect(z!).toBeLessThan(tooltipZ!);
  });

  it("leaves bottom panels below the whole host chrome band", () => {
    // Raising `.cm-panels` wholesale would also fix #337, and would reintroduce
    // the bug the `z-index: 2` exists to prevent: editor chrome climbing over
    // the host's UI. Bounding this at the FLOOR of the chrome band (not at the
    // dialog layer) is what makes that shortcut fail here.
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

    // Non-vacuity: if the theme's rule stopped reaching this element the
    // resolver returns null, which fails here instead of coercing to 0 and
    // sliding under the bound.
    const z = resolvedZ(panels!);
    expect(z).not.toBeNull();
    expect(Number.isFinite(z)).toBe(true);
    expect(z!).toBeLessThan(HOST_CHROME_Z_MIN);
  });
});
