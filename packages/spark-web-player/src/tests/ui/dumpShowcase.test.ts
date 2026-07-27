// DEV UTILITY, not a test assertion: renders the Pico showcase through the real
// engine -> UIManager under jsdom and writes a self-contained static page, so
// the visual comparison against Pico does not depend on scraping the live
// editor (the automation browser intermittently cannot reach loopback).
//
//   DUMP_SHOWCASE=<abs path to ours.html> npx vitest run src/tests/ui/dumpShowcase.test.ts
//
// Inert unless DUMP_SHOWCASE is set.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const OUT = process.env["DUMP_SHOWCASE"];

function findShowcase(): string {
  let dir = resolve(process.cwd());
  for (;;) {
    const candidate = join(dir, "docs", "sparkle", "pico-showcase.sd");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("showcase not found");
    dir = parent;
  }
}

describe.skipIf(!OUT)("dump showcase", () => {
  test("writes a self-contained page", async () => {
    const src = readFileSync(findShowcase(), "utf8");
    const h = createDOMHarness(src, 0, { autoOpenAll: true });
    // UIModule batches its DOM writes on a microtask, so the overlay is empty
    // until this settles.
    await flushMicrotasks();
    const doc = h.overlay.ownerDocument;

    // The layouts layer is revealed by a narrative beat, which a UI-only
    // project never reaches; for a static capture, reveal it directly.
    const layouts = h.overlay.querySelector(".layouts") as HTMLElement | null;
    if (layouts) {
      layouts.style.opacity = "1";
    }

    const css = [...doc.querySelectorAll("style")]
      .map((s) => s.textContent ?? "")
      .join("\n");

    // The overlay is what the player mounts inside `spark-web-player #game`, so
    // reproduce that ancestor chain or every scoped selector misses — AND load
    // the player's OWN stylesheet, which the engine-generated `<style>` elements
    // do not include.
    //
    // That stylesheet is not cosmetic: it is where `box-sizing: border-box`,
    // `pointer-events: none`, `touch-action: none` and a global
    // `display: flex; flex-direction: column` live, plus the height chain the
    // overlay's `height: 100%` scroller resolves against. A capture without it
    // is a DIFFERENT layout engine from the real player — it silently hid a
    // caption that stacks vertically in the browser, and reported content-box
    // sizing that made an explicit control height look 29px wrong. Read it off
    // disk rather than restating it, so the capture cannot drift from the real
    // thing again.
    const shell =
      `html,body{margin:0;height:100%}` +
      readFileSync(
        resolve(findShowcase(), "../../..", "packages/spark-web-player/src/spark-web-player.css"),
        "utf8",
      );

    // `config.ui.root_text_size` is applied by UIManager to the DOCUMENT root,
    // not to anything inside the overlay, so it would be dropped by serializing
    // `overlay.innerHTML` alone — and every `rem` in the capture would silently
    // fall back to the browser's 16px default.
    const rootFontSize = doc.documentElement.style.fontSize;
    const rootStyle = rootFontSize ? ` style="font-size:${rootFontSize}"` : "";

    const page =
      `<!doctype html><html${rootStyle}><head><meta charset="utf-8">` +
      `<title>Ours</title><style>${shell}</style><style>${css}</style></head>` +
      `<body><spark-web-player><div id="viewport"><div id="game">` +
      `${h.overlay.innerHTML}` +
      `</div></div></spark-web-player></body></html>`;

    writeFileSync(OUT!, page, "utf8");
    expect(page.length).toBeGreaterThan(1000);
    // eslint-disable-next-line no-console
    console.log(`[dump] wrote ${page.length} bytes to ${OUT}`);
  });
});
