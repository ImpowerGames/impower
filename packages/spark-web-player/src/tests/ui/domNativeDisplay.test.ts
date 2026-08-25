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
    table_header:
      table_row:
        head "A"
    table_body:
      table_row:
        cell "1"
end
`);
    expect(display(h, "table")).toBe("table");
    expect(display(h, "thead")).toBe("table-header-group");
    expect(display(h, "tbody")).toBe("table-row-group");
    expect(display(h, "tr")).toBe("table-row");
    expect(display(h, "th")).toBe("table-cell");
    expect(display(h, "td")).toBe("table-cell");
  });

  test("list + foldout builtins declare their native display", async () => {
    const css = sheet(
      await render(`layout main with
  list:
    item "a"
  foldout "More":
end
`),
    );
    expect(ruleBlock(css, ".list")).toContain("display: block;");
    // A flex <li> renders NO marker; list-item is what draws it.
    expect(ruleBlock(css, ".item")).toContain("display: list-item;");
    expect(ruleBlock(css, ".foldout")).toContain("display: block;");
    expect(ruleBlock(css, ".foldout_label")).toContain(
      "display: list-item;",
    );
  });

  // `prose` is a non-flex box. It mattered when inline text elements existed
  // (CSS blockifies the children of a flex container, so they stacked). Inline
  // styling is now done with rich-text tags, whose runs are spans inside the
  // text element's own inline span — but `prose` is still the container for
  // flowing a real ELEMENT, such as a link, inside running text.
  test("`prose` is a non-flex box so children can flow inline", async () => {
    const h = await render(`layout main with
  box prose:
    text "See "
    link "the docs" #href="#"
end
`);
    expect(display(h, ".prose")).toBe("block");
    expect(ruleBlock(sheet(h), ".prose")).toContain("display: block;");
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
