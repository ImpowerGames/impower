import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const SOURCE = `layout main with
  slider #min=0 #max=100
end
`;

async function builtinCss(): Promise<string> {
  const h = createDOMHarness(SOURCE, 0, { autoOpenAll: true });
  await h.ready;
  await flushMicrotasks(20);
  return [...h.overlay.querySelectorAll("style")]
    .map((s) => s.textContent ?? "")
    .join("\n");
}

function pseudoBlock(css: string, pseudo: string): string {
  const start = css.indexOf(".slider");
  expect(start, "no `.slider` rule was emitted").toBeGreaterThanOrEqual(0);
  const at = css.indexOf(`&::${pseudo}`, start);
  expect(at, `no \`&::${pseudo}\` block under .slider`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function lengthPx(block: string, prop: string): number {
  const m = block.match(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*(-?[\\d.]+)(rem|px)`));
  expect(m, `\`${prop}\` was not declared`).toBeTruthy();
  const [, value, unit] = m!;
  return unit === "rem" ? Number(value) * 16 : Number(value);
}

describe("slider thumb geometry", () => {
  test("the thumb's offset centres it on the track it overhangs", async () => {
    const css = await builtinCss();
    const track = pseudoBlock(css, "-webkit-slider-runnable-track");
    const thumb = pseudoBlock(css, "-webkit-slider-thumb");

    const trackHeight = lengthPx(track, "height");
    const thumbHeight = lengthPx(thumb, "height");
    const offset = lengthPx(thumb, "margin-top");

    expect(thumbHeight).toBeGreaterThan(trackHeight);
    expect(offset).toBeCloseTo(-(thumbHeight - trackHeight) / 2, 5);
  });

  test("the thumb is square, so `border-radius: 50%` draws a circle", async () => {
    const thumb = pseudoBlock(await builtinCss(), "-webkit-slider-thumb");
    expect(lengthPx(thumb, "width")).toBe(lengthPx(thumb, "height"));
  });

  test("the thumb's ring is a fixed length, not a typographic one", async () => {
    const thumb = pseudoBlock(await builtinCss(), "-webkit-slider-thumb");
    expect(thumb).toMatch(/border-width\s*:\s*[\d.]+px/);
  });
});
