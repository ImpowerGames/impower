// Inline rich text inside a `text` element, using UI Toolkit's tag vocabulary.
//
// This is the capability that nested inline ELEMENTS can't provide: mixed runs
// inside one flowing line (`Some <b>bold</b> in a sentence`). Tags are an
// AUTHORING syntax only — the engine parses them once into styled runs, so the
// web renderer emits spans and a Unity front-end can re-serialize the same runs
// back into `<b>…</b>` without a translation table.
//
// The exception is the SEMANTIC tags (`<sub>`, `<sup>`), which mount as their
// real element: a styled span cannot carry meaning to a screen reader, and no
// amount of `vertical-align` makes one a subscript.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

async function render(src: string) {
  const h = createDOMHarness(src, 0, { autoOpenAll: true });
  await h.ready;
  await flushMicrotasks(20);
  return h;
}

/** A run is usually a <span>, but a SEMANTIC tag (`<sub>`, `<sup>`) mounts as
 *  that real element instead — so a selector of `span` alone silently misses
 *  those runs rather than failing, and they read as "no such run". */
const RUN_SELECTOR = "span, sub, sup";

/** The LEAF run nodes of the first `.text` element. Plain content renders as
 *  one node carrying the text; tagged content nests one node per run inside. */
function runNodes(h: any): Element[] {
  const el = h.overlay.querySelector(".text");
  return [...el.querySelectorAll(RUN_SELECTOR)]
    .filter((s: Element) => s.querySelector(RUN_SELECTOR) === null)
    .filter((s: Element) => (s.textContent ?? "") !== "");
}

/** The rendered runs of the first `.text` element: [text, inline style]. */
function runs(h: any): [string, string][] {
  return runNodes(h).map((s: Element) => [
    s.textContent ?? "",
    s.getAttribute("style") ?? "",
  ]) as [string, string][];
}

describe("inline rich text", () => {
  test("plain text is still a single unstyled run", async () => {
    const h = await render(`layout main with
  text "Just words."
end
`);
    const r = runs(h);
    expect(r.length).toBe(1);
    expect(r[0]![0]).toBe("Just words.");
    expect(r[0]![1]).not.toContain("font-weight");
  });

  test("mixed runs flow inside one line", async () => {
    const h = await render(`layout main with
  text "Some <b>bold</b> and <i>italic</i> here."
end
`);
    const r = runs(h);
    expect(r.map((x) => x[0])).toEqual([
      "Some ",
      "bold",
      " and ",
      "italic",
      " here.",
    ]);
    expect(r[1]![1]).toContain("font-weight: 700");
    expect(r[3]![1]).toContain("font-style: italic");
    // The unstyled runs stay unstyled.
    expect(r[0]![1]).not.toContain("font-weight");
  });

  test("nested tags merge, and the whole set of flag tags maps", async () => {
    const h = await render(`layout main with
  text "<b><i>bi</i></b><u>u</u><s>s</s><sup>up</sup><nobr>nb</nobr>"
end
`);
    const r = runs(h);
    const byText = Object.fromEntries(r);
    expect(byText["bi"]).toContain("font-weight: 700");
    expect(byText["bi"]).toContain("font-style: italic");
    expect(byText["u"]).toContain("underline");
    expect(byText["s"]).toContain("line-through");
    expect(byText["nb"]).toContain("nowrap");

    // `<sup>` is SEMANTIC, so it mounts a real <sup> rather than a styled span
    // — the meaning is the point, and only the element carries it.
    const sup = runNodes(h).find((n) => n.textContent === "up");
    expect(sup?.tagName.toLowerCase()).toBe("sup");
    // It must NOT also carry the old inline styling. `vertical-align: super`
    // is not how a browser renders <sup> (that is `baseline` plus a `top`
    // offset AND `line-height: 0`), so leaving it on would fight the real
    // thing and re-grow the line box the normalize rules exist to keep flat.
    expect(byText["up"]).not.toContain("vertical-align");
    expect(byText["up"]).not.toContain("font-size");
  });

  test("value tags resolve theme colors and sizes", async () => {
    const h = await render(`layout main with
  text "<color=sky_60>tinted</color><mark=amber_60>hl</mark><size=2rem>big</size>"
end
`);
    const byText = Object.fromEntries(runs(h));
    // A theme colour resolves like any other colour prop.
    expect(byText["tinted"]).toContain("var(--theme-color-sky_60)");
    expect(byText["hl"]).toContain("var(--theme-color-amber_60)");
    expect(byText["big"]).toContain("font-size: 2rem");
  });

  // The value normalizer stripped quotes BEFORE trimming, so a leading space
  // pushed the opening quote off the `^` anchor and it survived into the CSS as
  // `"red` — a value the browser silently drops, leaving unstyled text.
  test("a quoted value survives whitespace on either side of it", async () => {
    const h = await render(`layout main with
  text '<color= "red">spaced</color><color="blue" >tight</color>'
end
`);
    const byText = Object.fromEntries(runs(h));
    expect(byText["spaced"]).toContain("red");
    expect(byText["spaced"]).not.toContain('"');
    expect(byText["tight"]).toContain("blue");
  });

  test("`<noparse>` and unknown tags stay literal", async () => {
    const h = await render(`layout main with
  text "<noparse><b>kept</b></noparse> 5 < 6 <notatag>x"
end
`);
    // One unstyled run: nothing here should have been treated as markup.
    const r = runs(h);
    expect(r.length).toBe(1);
    expect(r[0]![0]).toBe("<b>kept</b> 5 < 6 <notatag>x");
  });

  test("`<br>` becomes a line break", async () => {
    const h = await render(`layout main with
  text "a<br>b"
end
`);
    expect(runs(h)[0]![0]).toBe("a\nb");
  });

  test("a bound value can change the run STRUCTURE, not just the text", async () => {
    const h = await render(`store label = "<b>bold</b>"
function plain()
  label = "plain"
end
layout main with
  text "x {label}"
  button "Go" @click=plain
end
`);
    expect(runs(h).map((x) => x[0])).toEqual(["x ", "bold"]);
    const ui: any = (h.game as any).module.ui;
    const before = runs(h).length;
    expect(before).toBe(2);

    // Drive the handler directly, then refresh — the wrapper's children must be
    // rebuilt from freshly parsed runs (patching one span's text would leave
    // the stale <b> run behind).
    (h.game as any).story.EvaluateFunction("plain", []);
    ui.refreshLayouts();
    await flushMicrotasks(20);

    const after = runs(h);
    expect(after.map((x) => x[0]).join("")).toBe("x plain");
    expect(after.some((x) => x[1].includes("font-weight: 700"))).toBe(false);
  });
});
