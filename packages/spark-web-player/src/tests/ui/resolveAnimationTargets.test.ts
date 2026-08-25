// Unit test for the D15 animation-target redirection (code-review finding).
//
// Animation targeting is invisible to the DOM-render golden (jsdom stubs WAAPI,
// and which element an animation binds to leaves no DOM trace), so this locks
// the redirection logic directly: a non-"self" `target` must animate the
// matching DESCENDANTS (e.g. the builtin align_* → "instance" layer), not the
// element itself — the behavior the engine's `enqueueAnimation` used to provide.

import { beforeAll, describe, expect, test } from "vitest";
import { resolveAnimationTargets } from "../../../../spark-dom/src/utils/resolveAnimationTargets";

beforeAll(() => {
  // resolveAnimationTargets uses CSS.escape; jsdom may not expose it on the
  // global. Test selectors are plain identifiers, so identity escaping suffices.
  const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
  if (typeof g.CSS?.escape !== "function") {
    g.CSS = { ...(g.CSS ?? {}), escape: (s: string) => s };
  }
});

function el(html: string): HTMLElement {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.firstElementChild as HTMLElement;
}

describe("resolveAnimationTargets", () => {
  test('"self" → the element itself', () => {
    const e = el(`<div class="instance"></div>`);
    expect(resolveAnimationTargets(e, "self")).toEqual([e]);
  });

  test("undefined target → the element itself", () => {
    const e = el(`<div class="instance"></div>`);
    expect(resolveAnimationTargets(e, undefined)).toEqual([e]);
  });

  test("target matching the element's own class → the element itself", () => {
    const e = el(`<div class="instance"></div>`);
    expect(resolveAnimationTargets(e, "instance")).toEqual([e]);
  });

  test("non-self target → matching descendants (align_* → instance)", () => {
    const wrapper = el(
      `<div class="backdrop"><span class="instance"></span></div>`,
    );
    const inst = wrapper.querySelector(".instance") as HTMLElement;
    expect(resolveAnimationTargets(wrapper, "instance")).toEqual([inst]);
  });

  test("non-self target with no matching descendant → empty", () => {
    const e = el(`<div class="backdrop"></div>`);
    expect(resolveAnimationTargets(e, "instance")).toEqual([]);
  });
});
