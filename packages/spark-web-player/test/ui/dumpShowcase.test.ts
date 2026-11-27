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
    await flushMicrotasks();
    const doc = h.overlay.ownerDocument;

    const layouts = h.overlay.querySelector(".layouts") as HTMLElement | null;
    if (layouts) {
      layouts.style.opacity = "1";
    }

    const css = [...doc.querySelectorAll("style")]
      .map((s) => s.textContent ?? "")
      .join("\n");

    const shell =
      `html,body{margin:0;height:100%}` +
      readFileSync(
        resolve(findShowcase(), "../../..", "packages/spark-web-player/src/spark-web-player.css"),
        "utf8",
      );

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
