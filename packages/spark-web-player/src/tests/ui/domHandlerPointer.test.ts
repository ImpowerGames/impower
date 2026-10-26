// An element with an event handler takes the pointer through the ui's
// `data-ui-handler` marker and the builtin `layouts` rule that opts it in. The
// rule has to lose to every author lock: an `interactable = false` prop is an
// inline style and wins anyway, and a class rule wins because the builtin
// rule sits at one class's specificity and comes before every author style.
// jsdom has no cascade for nested rules, so these tests match the rendered
// elements against the selector the stylesheet emits and check its place;
// the rendered lock is checked in the browser.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

/** A top-level rule's body, up to its closing brace at column 0. */
function ruleAt(css: string, selector: string): { at: number; body: string } {
  const at = css.indexOf(`spark-web-player #game ${selector} {\n`);
  const end = css.indexOf("\n}", at);
  return { at, body: at < 0 ? "" : css.slice(at, end) };
}

const SOURCE = `store n = 0
style locked with
  interactable = false
end
layout main with
  column {
    button.locked "Class lock" @click={ n = n + 1 }
    button "Prop lock" #interactable=false @click={ n = n + 1 }
    button "Open" @click={ n = n + 1 }
    checkbox "Labelled" @change={ n = n + 1 }
    box "No handler"
  }
end
`;

async function render(source: string) {
  const h = createDOMHarness(source, 0, { reactive: true });
  await h.ready;
  await flushMicrotasks(20);
  const css = [...h.overlay.querySelectorAll("style")]
    .map((s) => s.textContent ?? "")
    .join("\n");
  return { h, css };
}

describe("handler pointer opt-in in the page", () => {
  test("handler elements carry the marker and no inline pointer", async () => {
    const { h } = await render(SOURCE);
    const buttons = [...h.overlay.querySelectorAll<HTMLElement>("button")];
    expect(buttons, h.overlay.innerHTML).toHaveLength(3);
    for (const button of buttons) {
      expect(button.hasAttribute("data-ui-handler"), button.outerHTML).toBe(true);
    }
    expect(buttons[0]!.style.pointerEvents).toBe("");
    expect(buttons[1]!.style.pointerEvents).toBe("none");
    expect(buttons[2]!.style.pointerEvents).toBe("");
    const box = h.overlay.querySelector<HTMLElement>(".box");
    expect(box?.hasAttribute("data-ui-handler")).toBe(false);
  });

  test("the opt-in reaches handler elements, not a labelled control, and precedes author styles", async () => {
    const { h, css } = await render(SOURCE);
    const layouts = ruleAt(css, ".layouts");
    expect(layouts.at, css.slice(0, 400)).toBeGreaterThanOrEqual(0);
    // `& >> :where(#data-ui-handler) { &:where(:not(#data-widget-control)) { … } }`
    const outer = layouts.body.match(/\n  & :where\(([^\n]+)\) \{\n/);
    expect(outer, layouts.body.slice(0, 600)).not.toBeNull();
    const rest = layouts.body.slice(outer!.index!);
    const inner = rest.match(
      /&:where\(:not\(([^()]+)\)\) \{\s*pointer-events: auto;/,
    );
    expect(inner, rest.slice(0, 400)).not.toBeNull();
    const reaches = (el: Element) =>
      el.matches(outer![1]!) && !el.matches(inner![1]!);

    const buttons = [...h.overlay.querySelectorAll<HTMLElement>("button")];
    for (const button of buttons) {
      expect(reaches(button), button.outerHTML).toBe(true);
    }
    const control = h.overlay.querySelector<HTMLElement>("label input");
    expect(control, h.overlay.innerHTML).not.toBeNull();
    expect(control!.hasAttribute("data-ui-handler")).toBe(true);
    expect(reaches(control!)).toBe(false);

    // One class's weight, the same as the author's `.locked`, which comes
    // after it and so wins.
    const locked = ruleAt(css, ".locked");
    expect(locked.at).toBeGreaterThan(layouts.at);
    expect(locked.body).toMatch(/pointer-events: none;/);
  });

  test("the builtin styles that turn the pointer off leave handler elements out", async () => {
    const { h, css } = await render(`store n = 0
layout main with
  stroke "Outline" @click={ n = n + 1 }
  box #data-ui-handler="forged"
end
`);
    const stroke = h.overlay.querySelector<HTMLElement>(".stroke");
    expect(stroke?.hasAttribute("data-ui-handler"), h.overlay.innerHTML).toBe(true);
    // An authored marker is reserved and never written.
    expect(h.overlay.querySelectorAll("[data-ui-handler]")).toHaveLength(1);

    for (const name of [".stroke", ".screen"]) {
      const rule = ruleAt(css, name);
      expect(rule.at, name).toBeGreaterThan(ruleAt(css, ".layouts").at);
      // Every `pointer-events: none` in the rule sits under an exception
      // that the marked element does not pass.
      const nones = rule.body.split("pointer-events: none;").length - 1;
      const guarded = [
        ...rule.body.matchAll(
          /:where\(:not\(([^()]+)\)\) \{\s*pointer-events: none;/g,
        ),
      ];
      expect(nones, rule.body).toBeGreaterThan(0);
      expect(guarded, rule.body).toHaveLength(nones);
      for (const g of guarded) {
        expect(stroke!.matches(g[1]!), `${name}: ${g[1]}`).toBe(true);
      }
    }
  });
});
