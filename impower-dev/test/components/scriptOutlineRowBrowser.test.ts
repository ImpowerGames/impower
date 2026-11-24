import { VIRTUAL_LIST_ROW_HEIGHT, virtualListSlotVariants } from "@impower/impower-ui/components";
import { compile, optimize } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Diagnostic, DocumentSymbol } from "vscode-languageserver-protocol";
import { OutlineListRow } from "../../src/modules/spark-editor/components/outline";
import { SCRIPT_OUTLINE_ROW } from "../../src/modules/spark-editor/components/scripts-page/ScriptOutlineTab";
import { outlineRows } from "../../src/modules/spark-editor/components/outline/outlineRows";

const SRC = resolve("../packages/impower-ui/src");

const at = (line: number) => ({
  start: { line, character: 0 },
  end: { line, character: 5 },
});

const scene = (name: string, line: number, children: DocumentSymbol[]): DocumentSymbol => ({
  name,
  kind: 5,
  range: { start: { line, character: 0 }, end: { line: line + 3, character: 3 } },
  selectionRange: at(line),
  children,
});

const LONG = "a_rather_long_scene_name_".repeat(8);

const SYMBOLS: DocumentSymbol[] = [
  scene("dock", 0, [{ name: "quiet", kind: 11, range: at(1), selectionRange: at(1) }]),
  scene("harbor", 4, [
    { name: "Where now", kind: 10, range: at(5), selectionRange: at(5) },
    { name: "storm", kind: 11, range: at(6), selectionRange: at(6) },
  ]),
  scene(LONG, 8, [{ name: "calm", kind: 11, range: at(9), selectionRange: at(9) }]),
];

const problem = (line: number, severity: 1 | 2 | 3): Diagnostic => ({
  range: { start: { line, character: 1 }, end: { line, character: 4 } },
  severity,
  message: "broken",
});

const { rows } = outlineRows({
  symbols: SYMBOLS,
  diagnostics: [problem(6, 1), problem(6, 2), problem(5, 3), problem(8, 2)],
  caret: { line: 1, character: 0 },
  firstContentLine: 0,
});

const markup = rows
  .map((row) =>
    renderToString(
      h(
        "div",
        {
          id: row.label === LONG ? "long" : row.label.replace(/\s+/g, "-"),
          "data-depth": row.depth,
          class: "relative",
          style: `width:100%;height:${VIRTUAL_LIST_ROW_HEIGHT[SCRIPT_OUTLINE_ROW?.size as "outline"]}px`,
        },
        h(
          "div",
          { class: virtualListSlotVariants({ size: SCRIPT_OUTLINE_ROW?.size }), style: "top:0;height:100%" },
          h(OutlineListRow, { uri: "file://p/main.sd", row, ...SCRIPT_OUTLINE_ROW, onOpen: () => {} }),
        ),
      ),
    ),
  )
  .join("");

const VIEWPORTS = [
  { width: 430, layout: "phone", pointer: "coarse", font: "13px" },
  { width: 768, layout: "compact", pointer: "fine", font: "13px" },
  { width: 1440, layout: "desktop", pointer: "fine", font: "14px" },
] as const;

let browser: Browser;
let css: string;

beforeAll(async () => {
  const compiler = await compile(readFileSync(join(SRC, "style.css"), "utf8"), {
    base: SRC,
    onDependency: () => {},
  });
  const decoded = markup.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
  const candidates = new Set(decoded.split(/[\s"']+/).filter(Boolean));
  css = optimize(compiler.build([...candidates]), { minify: false }).code;
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

const measure = async (viewport: (typeof VIEWPORTS)[number], theme: "charcoal" | "chalk") => {
  const coarse = viewport.pointer === "coarse";
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: 900 },
    hasTouch: coarse,
    isMobile: coarse,
  });
  try {
    await page.setContent(
      `<!doctype html><html data-theme="${theme}" data-layout="${viewport.layout}" data-pointer="${viewport.pointer}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body style="margin:0">${markup}</body></html>`,
    );
    return await page.evaluate(() => {
      const swatch = document.body.appendChild(document.createElement("span"));
      swatch.style.color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
      const accent = getComputedStyle(swatch).color;
      swatch.remove();
      const box = (el: Element | null) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      return [...document.body.children].map((host) => {
        const rowBox = host.firstElementChild!.firstElementChild!;
        const open = rowBox.querySelector("button:not([data-list-row-badge]):not([aria-expanded])")!;
        const label = open.querySelector("span > span")!;
        const badge = rowBox.querySelector(":scope > [data-list-row-icon-control] > [data-list-row-badge]");
        return {
          id: host.id,
          depth: Number(host.getAttribute("data-depth")),
          row: box(rowBox)!,
          open: box(open)!,
          glyph: box(open.querySelector(":scope > svg")),
          label: box(label)!,
          labelScroll: (label as HTMLElement).scrollWidth,
          font: getComputedStyle(label).fontSize,
          lineHeight: getComputedStyle(label).lineHeight,
          pitch: box(host)!.height,
          current: open.getAttribute("aria-current"),
          accent,
          labelColor: getComputedStyle(label).color,
          glyphColor: open.querySelector(":scope > svg") ? getComputedStyle(open.querySelector(":scope > svg")!).color : null,
          badge: box(badge),
          badgeLabel: badge?.getAttribute("aria-label") ?? null,
          mark: box(badge?.querySelector("svg") ?? null),
          toggle: box(rowBox.querySelector("button[aria-expanded]")),
          glyphVisible: getComputedStyle(open.querySelector(":scope > svg")!).visibility !== "hidden",
          badgeInsideOpen: badge ? open.contains(badge) : null,
          badgeCount: rowBox.querySelectorAll("[data-list-row-badge]").length,
        };
      });
    });
  } finally {
    await page.close();
  }
};

describe("the In this script tab's outline rows, in Chromium", () => {
  for (const viewport of VIEWPORTS) {
    for (const theme of ["charcoal", "chalk"] as const) {
      it(`are 48px with a problem's mark drawn where the glyph was and nowhere else at ${viewport.width} in ${theme}`, async () => {
        const m = await measure(viewport, theme);
        const byId = Object.fromEntries(m.map((r) => [r.id, r]));
        expect(Object.keys(byId)).toEqual(["dock", "quiet", "harbor", "Where-now", "storm", "long", "calm"]);
        for (const r of m) {
          expect(r.row.height, r.id).toBe(48);
          expect(r.glyph, r.id).not.toBeNull();
          expect(r.glyph!.width, r.id).toBe(17);
          expect(r.glyph!.height, r.id).toBe(18);
          expect(r.font, r.id).toBe(viewport.font);
          expect(parseFloat(r.lineHeight), r.id).toBeCloseTo(parseFloat(viewport.font) * 1.6, 2);
          expect(r.pitch, r.id).toBe(50);
          const scene = r.depth === 0;
          if (scene) {
            expect(r.glyph!.left - r.row.left, r.id).toBe(13);
            expect(r.label.left - r.row.left, r.id).toBe(38);
            expect(r.toggle, r.id).not.toBeNull();
            expect(r.toggle!.width).toBe(44);
            expect(r.toggle!.height).toBe(44);
            expect(r.toggle!.right).toBe(r.row.right);
          }
          expect(r.badgeCount, r.id).toBe(r.badge ? 1 : 0);
          expect(r.glyphVisible, r.id).toBe(!r.badge);
          if (r.badge) {
            const target = viewport.pointer === "coarse" ? 44 : 28;
            expect(r.badgeInsideOpen, r.id).toBe(false);
            expect(r.badge.width, r.id).toBe(target);
            expect(r.badge.height, r.id).toBe(target);
            expect(r.mark!.width).toBe(17);
            expect(r.mark!.height).toBe(17);
            const mid = (b: { left: number; top: number; width: number; height: number }) => [b.left + b.width / 2, b.top + b.height / 2];
            const [mx, my] = mid(r.mark!);
            const [gx, gy] = mid(r.glyph!);
            expect(Math.abs(mx! - gx!), r.id).toBeLessThanOrEqual(0.5);
            expect(Math.abs(my! - gy!), r.id).toBeLessThanOrEqual(0.5);
            expect(r.badge.left, r.id).toBeGreaterThanOrEqual(r.row.left - 2);
          }
        }
        const dock = byId.dock!;
        for (const id of ["harbor", "long"]) {
          expect(byId[id]!.badge, id).not.toBeNull();
          expect(byId[id]!.glyph!.left).toBe(dock.glyph!.left);
          expect(byId[id]!.label.left).toBe(dock.label.left);
          expect(byId[id]!.toggle).toEqual({ ...dock.toggle!, top: byId[id]!.toggle!.top, bottom: byId[id]!.toggle!.bottom });
        }
        expect(dock.badge).toBeNull();
        expect(byId.storm!.badge).not.toBeNull();
        expect(byId.storm!.label.left).toBe(byId.quiet!.label.left);
        expect(byId.harbor!.badgeLabel).toBe("Show 1 error, 1 warning, 1 note in harbor, choices and branches included");
        expect(byId.quiet!.current).toBe("location");
        expect(byId.long!.labelScroll).toBeGreaterThan(byId.long!.label.width);
      }, 60_000);
    }
  }

  for (const theme of ["charcoal", "chalk"] as const) {
    it(`colour the current row's label and glyph in the accent, as its scene's, in ${theme}`, async () => {
      const m = await measure(VIEWPORTS[2], theme);
      const byId = Object.fromEntries(m.map((r) => [r.id, r]));
      for (const id of ["quiet", "dock"]) {
        expect(byId[id]!.labelColor, id).toBe(byId[id]!.accent);
        expect(byId[id]!.glyphColor, id).toBe(byId[id]!.accent);
      }
      for (const id of ["harbor", "storm", "long"]) {
        expect(byId[id]!.glyphColor, id).not.toBe(byId[id]!.accent);
      }
    }, 60_000);
  }

  const MUTED = { charcoal: "rgb(185, 185, 189)", chalk: "rgb(98, 99, 106)" } as const;
  for (const viewport of VIEWPORTS) {
    for (const theme of ["charcoal", "chalk"] as const) {
      it(`draw every row but the current one in the muted colour, label and glyph, at ${viewport.width} in ${theme}`, async () => {
        const m = await measure(viewport, theme);
        const byId = Object.fromEntries(m.map((r) => [r.id, r]));
        for (const id of ["harbor", "Where-now", "storm", "long", "calm"]) {
          expect(byId[id]!.labelColor, id).toBe(MUTED[theme]);
          expect(byId[id]!.glyphColor, id).toBe(MUTED[theme]);
        }
        for (const id of ["quiet", "dock"]) {
          expect(byId[id]!.labelColor, id).toBe(byId[id]!.accent);
        }
      }, 60_000);
    }
  }
});
