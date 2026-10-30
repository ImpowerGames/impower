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

function ruleBlock(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return "";
  return css.slice(start, css.indexOf("\n}", start));
}

describe("native display", () => {
  test("the table family lays out as a real table", async () => {
    const h = await render(`layout main with
  table {
    table_header {
      table_row {
        head "A"
      }
    }
    table_body {
      table_row {
        cell "1"
      }
    }
  }
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
  list {
    item "a"
  }
  foldout "More" {}
end
`),
    );
    expect(ruleBlock(css, ".list")).toContain("display: block;");
    expect(ruleBlock(css, ".item")).toContain("display: list-item;");
    expect(ruleBlock(css, ".foldout")).toContain("display: block;");
    expect(ruleBlock(css, ".foldout_label")).toContain(
      "display: list-item;",
    );
  });

  test("`prose` is a non-flex box so children can flow inline", async () => {
    const h = await render(`layout main with
  box.prose {
    text "See "
    link "the docs" #href="#"
  }
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
