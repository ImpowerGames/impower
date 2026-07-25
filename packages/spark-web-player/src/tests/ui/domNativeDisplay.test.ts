// The overlay lays every element out as FLEX. That default silently defeats the
// native layout of the semantic tags: a flex <table>/<tr>/<td> does no table
// layout (columns stop aligning), a flex <li> renders no marker, and a flex
// <summary> loses its disclosure triangle. Each builtin therefore has to state
// its native display explicitly — browser defaults never get a chance to apply.
//
// The table case is asserted through COMPUTED style (jsdom implements table
// display); the rest are asserted on the emitted CSS, because jsdom's cascade
// does not resolve `list-item` or `inline`. Their visual result was verified in
// a real browser: table columns align across rows, list markers appear, and the
// inline elements flow on one line inside `prose`.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

async function render(src: string) {
  const h = createDOMHarness(src, 0, { autoOpenAll: true });
  await h.ready;
  await flushMicrotasks(20);
  return h;
}

const display = (h: any, sel: string) => {
  const el = h.overlay.querySelector(sel);
  if (!el) return "missing";
  return el.ownerDocument.defaultView!.getComputedStyle(el).display;
};

const sheet = (h: any) =>
  [...h.overlay.querySelectorAll("style")]
    .map((s: Element) => s.textContent ?? "")
    .join("\n");

/** The declarations inside one top-level rule block. */
function ruleBlock(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return "";
  return css.slice(start, css.indexOf("\n}", start));
}

describe("native display", () => {
  test("the table family lays out as a real table", async () => {
    const h = await render(`layout main with
  table:
    thead:
      tr:
        th "A"
    tbody:
      tr:
        td "1"
end
`);
    expect(display(h, "table")).toBe("table");
    expect(display(h, "thead")).toBe("table-header-group");
    expect(display(h, "tbody")).toBe("table-row-group");
    expect(display(h, "tr")).toBe("table-row");
    expect(display(h, "th")).toBe("table-cell");
    expect(display(h, "td")).toBe("table-cell");
  });

  test("list + disclosure builtins declare their native display", async () => {
    const css = sheet(
      await render(`layout main with
  ul:
    li "a"
  details:
    summary "More"
end
`),
    );
    expect(ruleBlock(css, ".ul")).toContain("display: block;");
    // A flex <li> renders NO marker; list-item is what draws it.
    expect(ruleBlock(css, ".li")).toContain("display: list-item;");
    expect(ruleBlock(css, ".details")).toContain("display: block;");
    expect(ruleBlock(css, ".summary")).toContain("display: list-item;");
  });

  test("`prose` is a non-flex box so inline elements can flow", async () => {
    const css = sheet(
      await render(`layout main with
  box prose:
    strong "b"
    sub "2"
end
`),
    );
    // CSS blockifies the children of a flex container, so inline text elements
    // only behave as inline inside a non-flex box — that is what `prose` is.
    expect(ruleBlock(css, ".prose")).toContain("display: block;");
    expect(ruleBlock(css, ".strong")).toContain("display: inline;");
    expect(ruleBlock(css, ".sub")).toContain("display: inline;");
    expect(ruleBlock(css, ".sub")).toContain("vertical-align: sub;");
    expect(ruleBlock(css, ".sup")).toContain("vertical-align: super;");
  });

  test("divider renders a real rule", async () => {
    const h = await render(`layout main with
  divider
end
`);
    expect(h.overlay.querySelector("hr")).toBeTruthy();
    expect(ruleBlock(sheet(h), ".divider")).toContain("display: block;");
  });
});
