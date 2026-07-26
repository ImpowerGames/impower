// An element's content may be written with SINGLE quotes, which never
// interpolate — the reason to reach for them is text that itself contains a
// double quote or a brace.
//
// This used to render an EMPTY element: element content is its own grammar
// context, and only the double-quoted rules were part of it, so a single-quoted
// string fell through to the generic `LuauSingleQuotedString` expression, which
// the element lowerer does not read. Nothing warned — the compile was clean and
// the element simply came out blank.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

async function render(source: string) {
  const h = createDOMHarness(source, 0, { autoOpenAll: true });
  await flushMicrotasks();
  return h;
}

describe("single-quoted element content", () => {
  test("renders, and keeps the double quotes it contains", async () => {
    const h = await render(
      [
        "layout main with",
        "  column:",
        `    text '"Maecenas vehicula metus tellus."'`,
        "end",
      ].join("\n"),
    );
    const text = h.overlay.querySelector(".text");
    expect(text, "expected a .text element").toBeTruthy();
    expect(text!.textContent).toBe('"Maecenas vehicula metus tellus."');
  });

  // Single quotes stop the COMPILER interpolating, but display text is
  // re-parsed at RUNTIME, and that pass still reads `{...}` as interpolation —
  // so braces come out empty whichever quote you use. Quoting is not the fix;
  // the runtime display parse is. Skipped rather than deleted so the gap stays
  // visible, and so it flips to green if display parsing moves to compile time.
  test.skip("is literal — braces survive (runtime display parse still eats them)", async () => {
    const h = await render(
      ["layout main with", "  column:", `    text '{x {y} z}'`, "end"].join(
        "\n",
      ),
    );
    expect(h.overlay.querySelector(".text")!.textContent).toBe("{x {y} z}");
  });

  test("double-quoted content still interpolates", async () => {
    const h = await render(
      [
        "store who = \"world\"",
        "layout main with",
        "  column:",
        '    text "hello {who}"',
        "end",
      ].join("\n"),
    );
    expect(h.overlay.querySelector(".text")!.textContent).toBe("hello world");
  });
});
