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

    // The overlay is what the player mounts inside `spark-web-player #game`;
    // reproduce that ancestor chain or every scoped selector misses.
    // The player's shell supplies the height chain that the overlay's
    // `height: 100%` scroller resolves against; it lives outside the captured
    // styles, so without this the page lays out at zero height and paints blank.
    // The player's shell supplies both the height chain that the overlay's
    // `height: 100%` scroller resolves against AND the normalize that makes form
    // controls inherit the page font — neither lives in the engine-generated
    // styles. Without the latter every control falls back to the UA's 13.33px
    // and the capture looks like a styling bug that is not there.
    const shell =
      `html,body{margin:0;height:100%}` +
      `spark-web-player,#viewport,#game{display:block;height:100%}` +
      // Controls AND `summary` otherwise fall back to `medium` (16px) rather
      // than the page's 18px, which makes every one of them look 2px small in a
      // capture. Zero-specificity so anything the engine states still wins;
      // font only, so deliberate per-element leading (inline chips) survives.
      `#game *{font-family:inherit;font-size:inherit}` +
      `button,input,select,textarea{color:inherit;margin:0}`;

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
