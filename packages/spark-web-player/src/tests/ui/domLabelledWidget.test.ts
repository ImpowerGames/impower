// A labelled input widget (`slider "Master Volume"`) renders as one <label>
// that carries the widget's name and classes, with the <input> inside it named
// `control`. The page resolves a transition's targets by class name, preferring
// elements whose class name is exactly the target, so the label's class name
// must be the widget's name and nothing more: otherwise a bare `slider` beside
// it takes every `slider` target and the labelled one is skipped.
//
// The lock: `interactable = false` on the widget sets the label's
// pointer-events, and the control inherits it through its builtin style. That
// rule follows the control's own `pointer-events: auto` at the same
// specificity, so it wins over it while an author's `> control` rule and
// `@disabled` still win over it; and the tooltip opt-in leaves a `control`
// alone, or a locked checkbox with a tooltip would toggle on click. jsdom has
// no cascade for nested rules, so these tests pin the emitted rules; the
// rendered lock is checked in the browser.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

async function builtinCss(source: string): Promise<string> {
  const h = createDOMHarness(source, 0, { autoOpenAll: true });
  await h.ready;
  await flushMicrotasks(20);
  return [...h.overlay.querySelectorAll("style")]
    .map((s) => s.textContent ?? "")
    .join("\n");
}

/** A top-level rule's body, up to its closing brace at column 0. */
function ruleBody(css: string, selector: string): string | undefined {
  const start = css.indexOf(`spark-web-player #game ${selector} {\n`);
  if (start < 0) return undefined;
  const end = css.indexOf("\n}", start);
  return css.slice(start, end);
}

describe("labelled input widgets in the page", () => {
  test("a widget's name finds it labelled or bare alike", async () => {
    const h = createDOMHarness(
      `layout settings with
  column {
    slider "Named volume" #value=50
    slider #value=50
  }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    const label = h.overlay.querySelector<HTMLElement>("label");
    expect(label, h.overlay.innerHTML).not.toBeNull();
    expect(label!.className).toBe("slider");
    const bare = [...h.overlay.querySelectorAll<HTMLElement>("input")].find(
      (el) => el.parentElement !== label,
    );
    expect((h.ui as any).findTargetElements("slider")).toEqual([label, bare]);
  });

  test("each control style hands its label's pointer to the control last", async () => {
    const css = await builtinCss(`layout main with
  checkbox "Locked" #interactable=false #tooltip="Help"
end
`);
    for (const name of ["checkbox", "radio", "switch", "input", "slider"]) {
      const body = ruleBody(css, `.${name}`);
      expect(body, name).toBeDefined();
      const own = body!.indexOf("&:where(:not(label)), >:where(.control) {");
      const inherit = body!.indexOf(
        "  >:where(.control) {\n    pointer-events: inherit;",
      );
      expect(own, name).toBeGreaterThan(0);
      // After the control's own `pointer-events: auto`, at the same
      // specificity, so it wins over it.
      expect(inherit, name).toBeGreaterThan(own);
    }
  });

  test("the tooltip opt-in leaves a labelled widget's control to its label", async () => {
    const css = await builtinCss(`layout main with
  checkbox "Locked" #interactable=false #tooltip="Help"
end
`);
    const layouts = ruleBody(css, ".layouts");
    expect(layouts).toBeDefined();
    const tooltip = layouts!.slice(layouts!.indexOf("& [data-tooltip] {"));
    const optIn = tooltip.match(/&:where\(:not\(\.control\)\) \{\s*pointer-events: auto;/);
    expect(optIn, tooltip.slice(0, 400)).not.toBeNull();
    // The opt-in is not also stated for every tooltip element.
    const head = tooltip.slice(0, tooltip.indexOf("&:where(:not(.control))"));
    expect(head).not.toMatch(/pointer-events: auto;/);
  });
});
