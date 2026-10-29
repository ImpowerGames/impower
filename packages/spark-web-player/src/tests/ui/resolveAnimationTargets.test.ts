import { beforeAll, describe, expect, test } from "vitest";
import { resolveAnimationTargets } from "../../../../spark-dom/src/utils/resolveAnimationTargets";

beforeAll(() => {
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
