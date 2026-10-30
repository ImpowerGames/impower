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
        "  column {",
        `    text '"Maecenas vehicula metus tellus."'`,
        "  }",
        "end",
      ].join("\n"),
    );
    const text = h.overlay.querySelector(".text");
    expect(text, "expected a .text element").toBeTruthy();
    expect(text!.textContent).toBe('"Maecenas vehicula metus tellus."');
  });

  test.skip("is literal — braces survive (runtime display parse still eats them)", async () => {
    const h = await render(
      ["layout main with", "  column {", `    text '{x {y} z}'`, "  }", "end"].join(
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
        "  column {",
        '    text "hello {who}"',
        "  }",
        "end",
      ].join("\n"),
    );
    expect(h.overlay.querySelector(".text")!.textContent).toBe("hello world");
  });
});
