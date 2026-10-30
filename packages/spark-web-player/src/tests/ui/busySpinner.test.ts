import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

async function css(src: string): Promise<string> {
  const h = createDOMHarness(src, 0, { autoOpenAll: true });
  await h.ready;
  await flushMicrotasks(20);
  return [...h.overlay.querySelectorAll("style")]
    .map((s) => s.textContent ?? "")
    .join("\n");
}

function globalSpinnerBlock(sheet: string): string {
  const at = sheet.indexOf('[aria-busy="true"]');
  expect(at, "no global aria-busy rule").toBeGreaterThanOrEqual(0);
  const before = sheet.indexOf("::before", at);
  const open = sheet.indexOf("{", before);
  const close = sheet.indexOf("}", open);
  return sheet.slice(open + 1, close);
}

describe("busy spinner", () => {
  test("is declared once, globally, not per component", async () => {
    const sheet = await css(`layout main with
  box #busy=true
end
`);
    const spinners = sheet.match(/animation-name:\s*spin\b/g) ?? [];
    expect(spinners.length).toBe(1);
  });

  test("draws on a plain container, not only button and article", async () => {
    const sheet = await css(`layout main with
  box #busy=true
end
`);
    const block = globalSpinnerBlock(sheet);
    expect(block).toContain("content:");
    expect(block).toMatch(/border-top-color:\s*var\(--spinner-color/);
    expect(block).toMatch(/width:\s*1em/);
    expect(block).toMatch(/height:\s*1em/);
  });

  async function inlineSpinnerColor(prop: string): Promise<string> {
    const h = createDOMHarness(
      `layout main with
  box #busy=true ${prop}
end
`,
      0,
      { autoOpenAll: true },
    );
    await h.ready;
    await flushMicrotasks(20);
    const el = h.overlay.querySelector<HTMLElement>('[aria-busy="true"]');
    expect(el, "no busy element was mounted").toBeTruthy();
    return el!.style.getPropertyValue("--spinner-color").trim();
  }

  test("`#spinner-color` sets the custom property the spinner reads", async () => {
    expect(await inlineSpinnerColor('#spinner-color="#8891a4"')).toBe("#8891a4");
  });

  test("an explicit theme variable is passed through untouched", async () => {
    expect(
      await inlineSpinnerColor('#spinner-color="var(--theme-color-sky_60)"'),
    ).toBe("var(--theme-color-sky_60)");
  });

  test("a bare theme token resolves, like every other colour prop", async () => {
    expect(await inlineSpinnerColor("#spinner-color=sky_60")).toBe(
      "var(--theme-color-sky_60)",
    );
  });
});
