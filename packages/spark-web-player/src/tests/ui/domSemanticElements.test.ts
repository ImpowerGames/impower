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
  list:
    item "Alpha"
    item "Beta"
  ordered_list:
    item "First"
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

  test("quote/citation are tags; inline styling is CLASSES, not tags", async () => {
    const h = await render(`layout main with
  quote:
    text "Quoted."
    citation "- Someone"
  strong "important"
  emphasis "stressed"
  text bold "bold"
  text italic "italic"
  text underline "u"
  text strikethrough "s"
  text code "x = 1"
  text kbd "Ctrl"
  kbd "Esc"
  h2 "Heading"
  small "fine print"
  paragraph "Prose."
  text highlight "highlit"
  text deleted "gone"
  text inserted "added"
  text abbreviation "HTML"
end
`);
    // Structural text elements keep real tags.
    expect(h.overlay.querySelector("blockquote")).toBeTruthy();
    expect(h.overlay.querySelector("cite")?.textContent).toBe("- Someone");

    // SEMANTIC inline elements survive as tags: <strong> means importance and
    // <em> means stress emphasis, and assistive tech acts on both.
    expect(h.overlay.querySelector("strong")?.textContent).toBe("important");
    expect(h.overlay.querySelector("em")?.textContent).toBe("stressed");

    // Promoted from style CLASSES to elements. A heading is what assistive tech
    // navigates by and a `<div class="h2">` is not one; `<kbd>` is the key to
    // press and `<small>` is fine print. The class spelling still works — these
    // are additive — so only the ELEMENT form proves the promotion landed.
    expect(h.overlay.querySelector("kbd")?.textContent).toBe("Esc");
    expect(h.overlay.querySelector("h2")?.textContent).toBe("Heading");
    expect(h.overlay.querySelector("small")?.textContent).toBe("fine print");

    // `paragraph` is a real <p> AND the one block builtin that ships with a
    // margin — everything else takes its rhythm from a container's `child-gap`.
    // The margin is the reason it exists as a separate element from `text`: a
    // paragraph's closing space belongs to the paragraph, so prose reads right
    // in a grid cell, where a gap cannot reach and a margin cannot collapse.
    // The margin arrives as a SHEET rule on `.paragraph`, not an inline style —
    // a builtin's `style` block always does. Only an inline `#prop` lands on the
    // element itself.
    const p = h.overlay.querySelector("p");
    expect(p?.textContent).toBe("Prose.");
    expect(p?.className).toContain("paragraph");
    const sheet = [...h.overlay.querySelectorAll("style")]
      .map((s) => s.textContent ?? "")
      .join("\n");
    const rule = sheet.slice(sheet.indexOf(".paragraph {"));
    expect(rule.slice(0, 120)).toContain("margin-bottom");

    // VISUAL styling is a CLASS on a text element — <b>/<i> are defined as
    // stylistic-only, so there is no element for them. Styling WITHIN a line
    // uses rich-text tags (see domRichText.test.ts).
    //
    // `kbd` is NOT in this list any more — it is a real element now, because
    // "the key you press" is meaning, not appearance. It still works as a class
    // (`text kbd "Ctrl"` above renders a div), which is why this list passing
    // was never evidence: the fixture happens to use the class form, so the
    // assertion held while the claim it encodes had already become false.
    for (const tag of ["mark", "del", "ins", "abbr"]) {
      expect(
        h.overlay.querySelector(tag),
        `<${tag}> should no longer be a builtin tag`,
      ).toBeNull();
    }
    for (const cls of [
      "bold",
      "italic",
      "underline",
      "strikethrough",
      "code",
      "kbd",
      "highlight",
      "deleted",
      "inserted",
      "abbreviation",
    ]) {
      expect(
        h.overlay.querySelector(`.text.${cls}`),
        `expected a .text.${cls}`,
      ).toBeTruthy();
    }
    expect(h.overlay.querySelector(".text.bold")?.textContent).toBe("bold");
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
    field_group:
      group_label "Choose"
      field #value="x"
  foldout "More":
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
    table_header:
      table_row:
        head "Name"
        head "Qty"
    table_body:
      table_row:
        cell "Sword"
        cell "1"
      table_row:
        cell "Potion"
        cell "3"
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
  list:
    item "x"
  quote:
    text "q"
  text code "c"
end
`);
    const css = [...h.overlay.querySelectorAll("style")]
      .map((s) => s.textContent ?? "")
      .join("\n");
    for (const cls of ["list", "item", "quote", "code", "kbd", "highlight"]) {
      expect(css, `expected default styles for .${cls}`).toContain(`.${cls}`);
    }
  });
});
