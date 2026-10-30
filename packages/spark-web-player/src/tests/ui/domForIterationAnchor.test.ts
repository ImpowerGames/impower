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
    expect(forRegion?.iterations?.length).toBe(2);
    expect(cond?.kind).toBe("cond");

    const anchor = ui.anchorFor(cond);
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
    expect(ui.anchorFor(cond)).toBe(null);
  });

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
