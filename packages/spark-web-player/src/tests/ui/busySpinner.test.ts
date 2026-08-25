// `#busy` is authorable on ANY element, so the spinner has to be drawn for any
// element.
//
// It was not. The spinner lived inside `style button` and `style article` as two
// separate copies, so `box #busy=true` set `aria-busy` on the DOM, passed every
// check, and drew nothing — the state was real and simply invisible. The copies
// had also drifted apart (0.75rem vs 1.25rem, two different colours), so the
// same state looked like two unrelated components.
//
// It is one rule in `style layouts` now. These tests pin the two properties that
// made the old arrangement wrong: that it applies GENERALLY, and that there is
// only ONE definition of what a spinner looks like.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

async function css(src: string): Promise<string> {
  const h = createDOMHarness(src, 0, { autoOpenAll: true });
  await h.ready;
  await flushMicrotasks(20);
  return [...h.overlay.querySelectorAll("style")]
    .map((s) => s.textContent ?? "")
    .join("\n");
}

/** The `::before` body of the one global `[aria-busy="true"]` rule. */
function globalSpinnerBlock(sheet: string): string {
  const at = sheet.indexOf('[aria-busy="true"]');
  expect(at, "no global aria-busy rule").toBeGreaterThanOrEqual(0);
  const before = sheet.indexOf("::before", at);
  const open = sheet.indexOf("{", before);
  const close = sheet.indexOf("}", open);
  return sheet.slice(open + 1, close);
}

describe("busy spinner", () => {
  test("is declared once, globally, not per component", async () => {
    const sheet = await css(`layout main with
  box #busy=true
end
`);
    // The spinner is identified by the animation that makes it spin. More than
    // one occurrence means a component has grown its own copy again, which is
    // exactly how the two drifted out of agreement.
    const spinners = sheet.match(/animation-name:\s*spin\b/g) ?? [];
    expect(spinners.length).toBe(1);
  });

  test("draws on a plain container, not only button and article", async () => {
    // A `box` is neither. Under the old per-component rules this produced no
    // spinner at all.
    const sheet = await css(`layout main with
  box #busy=true
end
`);
    const block = globalSpinnerBlock(sheet);
    expect(block).toContain("content:");
    expect(block).toMatch(/border-top-color:\s*var\(--spinner-color/);
    // Sized in `em` so it tracks whatever text it sits beside at any scale.
    expect(block).toMatch(/width:\s*1em/);
    expect(block).toMatch(/height:\s*1em/);
  });

  /** The inline custom property an authored `#spinner-color` lands as. */
  async function inlineSpinnerColor(prop: string): Promise<string> {
    const h = createDOMHarness(
      `layout main with
  box #busy=true ${prop}
end
`,
      0,
      { autoOpenAll: true },
    );
    await h.ready;
    await flushMicrotasks(20);
    // An inline prop is written to the ELEMENT, like the slider's
    // `--_fill-percentage` — not into the stylesheet.
    const el = h.overlay.querySelector<HTMLElement>('[aria-busy="true"]');
    expect(el, "no busy element was mounted").toBeTruthy();
    return el!.style.getPropertyValue("--spinner-color").trim();
  }

  test("`#spinner-color` sets the custom property the spinner reads", async () => {
    // The authored name carries no `--`. The spinner is a pseudo-element, which
    // no inline prop can address, so the value has to arrive as a variable —
    // but that is the builtin's plumbing and not something an author should
    // have to know to spell differently from every other prop.
    expect(await inlineSpinnerColor('#spinner-color="#8891a4"')).toBe("#8891a4");
  });

  test("an explicit theme variable is passed through untouched", async () => {
    expect(
      await inlineSpinnerColor('#spinner-color="var(--theme-color-sky_60)"'),
    ).toBe("var(--theme-color-sky_60)");
  });

  // The point of the whole alias. `#background-color=sky_60` has always resolved
  // a bare token; for a while this one did not, and emitted the inert string
  // `sky_60`. Two spellings that look identical in source where only one did
  // anything — which is the failure mode the named-props list exists to prevent,
  // reintroduced in a new shape.
  //
  // It resolves because the prop is declared in CSS_UTILITIES with a
  // `getCssColor` transformer, exactly like `accent-color` and `caret-color`,
  // NOT because the renderer renames it.
  test("a bare theme token resolves, like every other colour prop", async () => {
    expect(await inlineSpinnerColor("#spinner-color=sky_60")).toBe(
      "var(--theme-color-sky_60)",
    );
  });
});
