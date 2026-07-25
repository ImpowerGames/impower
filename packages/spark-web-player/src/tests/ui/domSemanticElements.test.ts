// Phase 3a: the semantic element tags. Builtins that carry real HTML meaning
// now render as that tag instead of a styled <div>, so the overlay tree is
// navigable (links, lists, tables, headings-in-context) rather than div soup.
//
// Names that already exist as style CLASSES (`small`, `nav`, `progress`,
// `group`, `grid`, `muted`, …) are deliberately NOT promoted to tags — doing so
// would turn existing authoring like `text small "…"` into a
// two-tags-on-one-line warning, and a styled <div> renders identically.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

async function render(src: string) {
  const h = createDOMHarness(src, 0, { autoOpenAll: true });
  await h.ready;
  await flushMicrotasks(20);
  return h;
}

describe("dom semantic elements", () => {
  test("interactive builtins render as their real HTML tags", async () => {
    const h = await render(`layout main with
  link "Home"
  button "Go"
  label "Name"
  span "inline"
  divider
end
`);
    expect(h.overlay.querySelector("a")?.textContent).toBe("Home");
    expect(h.overlay.querySelector("button")?.textContent).toBe("Go");
    expect(h.overlay.querySelector("label")?.textContent).toBe("Name");
    expect(h.overlay.querySelector("span.span")?.textContent).toBe("inline");
    expect(h.overlay.querySelector("hr")).toBeTruthy();
  });

  test("lists render as real ul/ol/li", async () => {
    const h = await render(`layout main with
  ul:
    li "Alpha"
    li "Beta"
  ol:
    li "First"
end
`);
    const ul = h.overlay.querySelector("ul");
    const ol = h.overlay.querySelector("ol");
    expect(ul).toBeTruthy();
    expect(ol).toBeTruthy();
    // <li>s must be DIRECT children so the list markers apply.
    expect([...ul!.children].every((c) => c.tagName === "LI")).toBe(true);
    expect(ul!.children.length).toBe(2);
    expect(ul!.children[0]!.textContent).toBe("Alpha");
    expect(ol!.children.length).toBe(1);
  });

  test("blockquote + inline text elements render as their tags", async () => {
    const h = await render(`layout main with
  blockquote:
    text "Quoted."
    cite "- Someone"
  strong "bold"
  em "italic"
  code "x = 1"
  kbd "Ctrl"
  mark "highlit"
  del "gone"
  ins "added"
  abbr "HTML"
  sub "2"
  sup "3"
end
`);
    for (const tag of [
      "blockquote",
      "cite",
      "strong",
      "em",
      "code",
      "kbd",
      "mark",
      "del",
      "ins",
      "abbr",
      "sub",
      "sup",
    ]) {
      expect(h.overlay.querySelector(tag), `expected a <${tag}>`).toBeTruthy();
    }
    expect(h.overlay.querySelector("strong")?.textContent).toBe("bold");
  });

  test("structure builtins render as their tags", async () => {
    const h = await render(`layout main with
  article:
    header "Title"
    text "Body"
    footer "Foot"
  section:
    text "In a section"
  form:
    fieldset:
      legend "Choose"
      field #value="x"
  details:
    summary "More"
    text "Hidden detail"
end
`);
    for (const tag of [
      "article",
      "header",
      "footer",
      "section",
      "form",
      "fieldset",
      "legend",
      "details",
      "summary",
    ]) {
      expect(h.overlay.querySelector(tag), `expected a <${tag}>`).toBeTruthy();
    }
    // <summary> must be a direct child of <details> for native disclosure.
    expect(h.overlay.querySelector("details > summary")).toBeTruthy();
  });

  test("tables render as a real table with direct-child rows and cells", async () => {
    const h = await render(`layout main with
  table:
    thead:
      tr:
        th "Name"
        th "Qty"
    tbody:
      tr:
        td "Sword"
        td "1"
      tr:
        td "Potion"
        td "3"
end
`);
    const table = h.overlay.querySelector("table");
    expect(table).toBeTruthy();
    // Parentage matters: a wrapper div between these would break table layout.
    expect(h.overlay.querySelector("table > thead > tr > th")).toBeTruthy();
    expect(h.overlay.querySelectorAll("table > tbody > tr").length).toBe(2);
    expect(h.overlay.querySelectorAll("tbody td").length).toBe(4);
    expect(
      (h.overlay.querySelector("thead tr")?.textContent ?? "").trim(),
    ).toBe("NameQty");
  });

  test("style-class names are NOT promoted to tags (no bogus warning path)", async () => {
    const h = await render(`layout main with
  text small "Small print"
  row nav #child-gap=8:
    link "Home"
end
`);
    // `small` stayed a class on a text div, not a <small> element.
    expect(h.overlay.querySelector("small")).toBeNull();
    expect(h.overlay.querySelector(".text.small")?.textContent).toBe(
      "Small print",
    );
    // `nav` likewise stays a class.
    expect(h.overlay.querySelector("nav")).toBeNull();
    expect(h.overlay.querySelector(".nav")).toBeTruthy();
  });

  test("the new semantic builtins ship default styles", async () => {
    const h = await render(`layout main with
  ul:
    li "x"
  blockquote:
    text "q"
  code "c"
end
`);
    const css = [...h.overlay.querySelectorAll("style")]
      .map((s) => s.textContent ?? "")
      .join("\n");
    for (const cls of ["ul", "li", "blockquote", "code", "kbd", "mark"]) {
      expect(css, `expected default styles for .${cls}`).toContain(`.${cls}`);
    }
  });
});
