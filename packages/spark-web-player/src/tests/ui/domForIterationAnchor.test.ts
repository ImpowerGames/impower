// Wrapperless positioning: the insertion anchor for a region nested INSIDE a
// for-iteration.
//
// `anchorFor` walks the region's local siblings, then escalates to
// `region.owner`. For a region inside an iteration that owner is the FOR, whose
// `siblings` is the outer group where the loop lives — so the escalation jumped
// over every remaining iteration and answered "append to the parent".
//
// The answer is asserted DIRECTLY rather than through the rendered order,
// because the `for`'s reconcile moves retained element-runs into place
// afterwards (`ui/move`) and repairs the mis-anchored insert. Every fixture
// tried rendered correctly with the bug present. So this is a latent defect:
// real at the seam, currently masked by a downstream pass — which is exactly
// the kind that surfaces the day that pass is skipped or reordered.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const SOURCE = `store rows = { "1", "2" }
store shown = ""
function reveal()
  shown = "1"
end
layout main with
  for r in rows do
    text "A{r}"
    if shown == r then
      text "B{r}"
    end
  end
end
`;

/** The cond region living inside for-iteration `index`, and the for itself. */
function regionsOf(h: any, index: number) {
  const ui: any = h.game.module.ui;
  const scope = ui._mountedLayouts.get("main")?.scope;
  const forRegion = scope?.regions?.find((r: any) => r.kind === "for");
  const iteration = forRegion?.iterations?.[index];
  const cond = iteration?.content
    ?.map((it: any) => it.region)
    .find((r: any) => r?.kind === "cond");
  return { forRegion, iteration, cond, ui };
}

describe("anchorFor escaping a for-iteration", () => {
  test("a region in a non-last iteration anchors before the NEXT iteration", async () => {
    const h = createDOMHarness(SOURCE, 0, { reactive: true });
    await h.ready;
    await flushMicrotasks(20);

    const { forRegion, cond, ui } = regionsOf(h, 0);
    // Guard the reach-in: if the shape changes, fail loudly rather than pass
    // vacuously on an `undefined` that never reaches the assertion.
    expect(forRegion?.iterations?.length).toBe(2);
    expect(cond?.kind).toBe("cond");

    // The cond is the LAST item of iteration 0, so nothing follows it locally
    // and `anchorFor` must escalate — the case under test.
    const anchor = ui.anchorFor(cond);
    // It must land before iteration 1's leading element ("A2"), NOT at the end
    // of the parent (which is what `null` means).
    const nextIterationFirst = ui.firstLiveOfGroup(
      forRegion.iterations[1].content,
    );
    expect(nextIterationFirst).toBeTruthy();
    expect(anchor).toBe(nextIterationFirst);
  });

  test("a region in the LAST iteration still escalates past the loop", async () => {
    const h = createDOMHarness(SOURCE, 0, { reactive: true });
    await h.ready;
    await flushMicrotasks(20);

    const { cond, ui } = regionsOf(h, 1);
    expect(cond?.kind).toBe("cond");
    // Nothing follows the loop in this layout, so append-to-parent is correct.
    expect(ui.anchorFor(cond)).toBe(null);
  });

  // The rendered order must be right regardless of which pass gets it there.
  test("a revealed row renders inside its own iteration", async () => {
    const h = createDOMHarness(SOURCE, 0, { reactive: true });
    await h.ready;
    await flushMicrotasks(20);

    const textOrder = () =>
      [...h.overlay.querySelectorAll("span, .text")]
        .filter((el: Element) => el.querySelector("span, .text") === null)
        .map((el: Element) => (el.textContent ?? "").trim())
        .filter((t: string) => t !== "");

    expect(textOrder()).toEqual(["A1", "A2"]);
    (h.game.story as any).EvaluateFunction("reveal", []);
    (h.game.module.ui as any).refreshLayouts();
    await flushMicrotasks(20);
    expect(textOrder()).toEqual(["A1", "B1", "A2"]);
  });
});
