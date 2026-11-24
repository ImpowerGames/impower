import { compile, optimize } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Diagnostic, DocumentSymbol } from "vscode-languageserver-protocol";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { window: {}, search: {} },
}));

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: Outline } = await import("../../src/modules/spark-editor/components/outline/Outline");

const SRC = resolve("../packages/impower-ui/src");
const URI = "file://p/main.sd";
const RAIL_WIDTH = 231;

const span = (start: number, end: number) => ({
  start: { line: start, character: 0 },
  end: { line: end, character: 3 },
});

const symbol = (name: string, kind: number, start: number, end: number, children: DocumentSymbol[] = []): DocumentSymbol => ({
  name,
  kind,
  range: span(start, end),
  selectionRange: span(start, start),
  children,
});

const LONG = "Where should the friends go now that the storm has finally passed the harbor?";

const SYMBOLS: DocumentSymbol[] = [
  symbol("harbor", 5, 0, 12, [
    symbol("storm", 11, 2, 8, [symbol(LONG, 10, 3, 5)]),
    symbol("Where now?", 10, 9, 11),
  ]),
  symbol("dock", 5, 13, 15),
  symbol("market", 5, 16, 20, [symbol("quiet", 11, 17, 19)]),
];

const MANY: DocumentSymbol[] = [
  ...SYMBOLS,
  ...Array.from({ length: 30 }, (_, i) => symbol(`extra_${i}`, 5, 30 + i * 3, 31 + i * 3)),
];

const problem = (line: number, severity: 1 | 2 | 3): Diagnostic => ({
  range: { start: { line, character: 1 }, end: { line, character: 4 } },
  severity,
  message: "broken",
});

const PROBLEMS = [problem(1, 1), problem(7, 2), problem(4, 3), problem(14, 2), problem(18, 3)];

const setCaret = (line: number) => {
  const state = workspace.current;
  const logic = state.panes.logic;
  workspace.current = {
    ...state,
    panes: {
      ...state.panes,
      logic: {
        ...logic,
        panel: "main",
        panels: {
          ...logic.panels,
          main: {
            ...logic.panels.main,
            activeEditor: {
              open: true,
              filename: "main.sd",
              selectedRange: { start: { line, character: 4 }, end: { line, character: 4 } },
            },
          },
        },
      },
    },
  };
};

const railMarkup = (symbols: DocumentSymbol[], diagnostics: Diagnostic[]) => {
  workspace.outline.value = { uri: URI, symbols, diagnostics, firstContentLine: 0 };
  return renderToString(h(Outline, null));
};

let browser: Browser;
let css: string;
const markups: Record<string, string> = {};

beforeAll(async () => {
  setCaret(9);
  markups.badged = railMarkup(SYMBOLS, PROBLEMS);
  markups.clean = railMarkup(SYMBOLS, []);
  markups.scrolling = railMarkup(MANY, PROBLEMS);
  const compiler = await compile(readFileSync(join(SRC, "style.css"), "utf8"), {
    base: SRC,
    onDependency: () => {},
  });
  const decoded = Object.values(markups)
    .join("")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
  const candidates = new Set(decoded.split(/[\s"']+/).filter(Boolean));
  css = optimize(compiler.build([...candidates]), { minify: false }).code;
  browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number };

const measure = async (
  markup: string,
  theme: "charcoal" | "chalk",
  pointer: "fine" | "coarse" = "fine",
  width = 1440,
) => {
  const coarse = pointer === "coarse";
  const layout = width > 1100 ? "desktop" : width > 700 ? "compact" : "phone";
  const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: coarse });
  try {
    await page.setContent(
      `<!doctype html><html data-theme="${theme}" data-layout="${layout}" data-pointer="${pointer}"><head><style>${css}</style></head><body style="margin:0"><div id="rail" style="width:${RAIL_WIDTH}px;height:525px;display:flex;flex-direction:column">${markup}</div></body></html>`,
    );
    return await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:absolute;top:0;left:-200px;width:100px;height:50px;visibility:hidden;overflow-y:scroll;scrollbar-width:thin;scrollbar-gutter:stable";
      document.body.appendChild(probe);
      document.documentElement.style.setProperty("--scrollbar-size", `${probe.offsetWidth - probe.clientWidth}px`);
      probe.remove();
      const box = (el: Element | null | undefined) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      const list = document.querySelector('[role="list"]')!;
      const scroller = list.parentElement!;
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
      const swatch = document.createElement("span");
      swatch.style.color = accent;
      document.body.appendChild(swatch);
      const accentColor = getComputedStyle(swatch).color;
      swatch.remove();
      return {
        accentColor,
        headingLeft: document.querySelector("nav h2")!.getBoundingClientRect().left,
        listPaddingLeft: getComputedStyle(scroller).paddingLeft,
        scrollbar: scroller.offsetWidth - scroller.clientWidth,
        overflows: scroller.scrollHeight > scroller.clientHeight,
        rows: [...list.querySelectorAll('[role="listitem"]')].map((item) => {
          const row = item.firstElementChild!;
          const open = [...row.querySelectorAll(":scope > button")].find(
            (b) => !b.hasAttribute("data-list-row-badge"),
          )!;
          const badge = row.querySelector(":scope > [data-list-row-icon-control] > [data-list-row-badge]");
          const label = open.querySelector(":scope > span > span")!;
          const guides = [...row.querySelectorAll(':scope > span[aria-hidden="true"]')].map((g) => box(g)!);
          return {
            name: open.getAttribute("aria-label")!,
            slot: box(item)!,
            row: box(row)!,
            open: box(open)!,
            glyph: box(open.querySelector(":scope > svg")),
            label: box(label)!,
            labelLines: Math.round(label.getBoundingClientRect().height / parseFloat(getComputedStyle(label).lineHeight)),
            font: getComputedStyle(label).fontSize,
            lineHeight: getComputedStyle(label).lineHeight,
            badge: box(badge),
            mark: box(badge?.querySelector("svg")),
            toggle: box(row.querySelector("button[aria-expanded]")),
            guides,
            current: open.getAttribute("aria-current"),
            borderLeft: getComputedStyle(row).borderLeftColor,
            background: getComputedStyle(row).backgroundColor,
            labelColor: getComputedStyle(label).color,
            glyphColor: open.querySelector(":scope > svg") ? getComputedStyle(open.querySelector(":scope > svg")!).color : null,
            glyphVisible: getComputedStyle(open.querySelector(":scope > svg")!).visibility !== "hidden",
            hits: (() => {
              const glyph = open.querySelector(":scope > svg")!.getBoundingClientRect();
              const x = glyph.left + glyph.width / 2;
              const r = row.getBoundingClientRect();
              const at = (y: number) => {
                const hit = document.elementFromPoint(x, y);
                return badge?.contains(hit) ? "badge" : open.contains(hit) ? "row" : "other";
              };
              return { top: at(r.top + 2), centre: at(glyph.top + glyph.height / 2), bottom: at(r.bottom - 2) };
            })(),
            badgeInsideOpen: badge ? open.contains(badge) : null,
          };
        }),
      };
    });
  } finally {
    await page.close();
  }
};

type Measured = Awaited<ReturnType<typeof measure>>;
type Row = Measured["rows"][number];

const DEPTHS: Record<string, number> = {
  harbor: 0,
  storm: 1,
  [LONG]: 2,
  "Where now?": 1,
  dock: 0,
  market: 0,
  quiet: 1,
};

const byName = (m: Measured) => {
  const rows: Record<string, Row> = {};
  for (const r of m.rows) {
    const key = Object.keys(DEPTHS).find((name) => r.name.includes(`: ${name}`));
    if (key) rows[key] = r;
  }
  return rows;
};

const centre = (b: Box) => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 });

const expectOnGlyph = (r: Row, name: string, target: number) => {
  expect(r.badge, name).not.toBeNull();
  expect(r.badgeInsideOpen, name).toBe(false);
  expect(r.glyphVisible, name).toBe(false);
  expect(r.badge!.width, name).toBe(target);
  expect(r.badge!.height, name).toBe(target);
  expect(r.mark!.width, name).toBe(17);
  expect(r.mark!.height, name).toBe(17);
  const mark = centre(r.mark!);
  const glyph = centre(r.glyph!);
  const badge = centre(r.badge!);
  expect(Math.abs(mark.x - glyph.x), name).toBeLessThanOrEqual(0.5);
  expect(Math.abs(mark.y - glyph.y), name).toBeLessThanOrEqual(0.5);
  expect(Math.abs(badge.x - glyph.x), name).toBeLessThanOrEqual(0.5);
};

const geometry = (r: Row) => ({
  row: r.row,
  open: r.open,
  glyph: r.glyph,
  label: r.label,
  toggle: r.toggle,
});

describe("the docked Outline rail's rows, in Chromium at 1440", () => {
  for (const theme of ["charcoal", "chalk"] as const) {
    it(`draw a problem's 17px mark where the row's glyph was, a 28px target of its own outside the row's button, at every depth, in ${theme}`, async () => {
      const rows = byName(await measure(markups.badged!, theme));
      expect(Object.keys(rows).sort()).toEqual(Object.keys(DEPTHS).sort());
      for (const name of ["harbor", "storm", LONG, "dock", "market", "quiet"]) {
        const r = rows[name]!;
        expectOnGlyph(r, name, 28);
        expect(r.badge!.right, name).toBeLessThanOrEqual(r.label.left);
        expect(r.hits, name).toEqual({ top: "row", centre: "badge", bottom: "row" });
      }
      const clean = rows["Where now?"]!;
      expect(clean.badge).toBeNull();
      expect(clean.glyphVisible).toBe(true);
    }, 60_000);

    it(`indent each nested row 18px as a whole row with a 1px guide, rows 44px with 12px labels ending 14px from the rail's edge, in ${theme}`, async () => {
      const m = await measure(markups.badged!, theme);
      const rows = byName(m);
      for (const [name, depth] of Object.entries(DEPTHS)) {
        const r = rows[name]!;
        expect(r.row.left, name).toBe(14 + depth * 18);
        expect(r.row.right, name).toBe(RAIL_WIDTH - 14);
        expect(r.row.height, name).toBe(44);
        expect(r.glyph!.left - r.row.left, name).toBe(11);
        expect(r.glyph!.width, name).toBe(17);
        expect(r.glyph!.height, name).toBe(18);
        expect(r.label.left - r.row.left, name).toBe(36);
        expect(r.font, name).toBe("12px");
        const guideLefts = r.guides.flatMap((g) =>
          g.width <= 1 ? [g.left] : Array.from({ length: Math.round(g.width / 18) }, (_, k) => g.left + k * 18),
        );
        const expected = Array.from({ length: depth }, (_, k) => r.row.left - k * 18).filter(
          (x, k) => !(k === 0 && r.current === "location"),
        );
        expect(guideLefts.sort((a, b) => a - b), name).toEqual(expected.sort((a, b) => a - b));
      }
      const first = rows.harbor!.row.top;
      expect(Object.keys(DEPTHS).map((name) => rows[name]!.row.top - first)).toEqual([0, 46, 92, 144, 196, 242, 288]);
      const levelOne = [rows.storm!, rows[LONG]!, rows["Where now?"]!]
        .flatMap((r) => r.guides)
        .filter((g) => g.left === rows.storm!.row.left)
        .sort((a, b) => a.top - b.top);
      let reach = rows.storm!.row.top;
      for (const g of levelOne) {
        expect(g.top).toBeLessThanOrEqual(reach);
        reach = Math.max(reach, g.bottom);
      }
      expect(reach).toBe(rows["Where now?"]!.row.top);
      const levelTwo = rows[LONG]!.guides.filter((g) => g.left === rows[LONG]!.row.left);
      expect(levelTwo.map((g) => [g.top, g.bottom])).toEqual([[rows[LONG]!.row.top, rows[LONG]!.row.bottom]]);
      expect(rows.harbor!.toggle!.right).toBe(RAIL_WIDTH - 14);
      expect(rows.harbor!.toggle!.width).toBe(44);
      const current = rows["Where now?"]!;
      expect(current.current).toBe("location");
      expect(current.borderLeft).toBe(m.accentColor);
    }, 60_000);

    it(`colour the current row's label and glyph in the accent, as its scene's, and every other glyph like its label, in ${theme}`, async () => {
      const m = await measure(markups.badged!, theme);
      const rows = byName(m);
      for (const name of ["Where now?", "harbor"]) {
        expect(rows[name]!.labelColor, name).toBe(m.accentColor);
        expect(rows[name]!.glyphColor, name).toBe(m.accentColor);
      }
      for (const name of ["storm", LONG, "dock", "market", "quiet"]) {
        expect(rows[name]!.labelColor, name).not.toBe(m.accentColor);
        expect(rows[name]!.glyphColor, name).toBe(rows[name]!.labelColor);
      }
      const rgb = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      const luminance = (color: string) => {
        const [r, g, b] = rgb(color).map((c) => {
          const v = c / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      const ink = luminance(m.accentColor);
      const tint = luminance(rows["Where now?"]!.background);
      expect((Math.max(ink, tint) + 0.05) / (Math.min(ink, tint) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }, 60_000);

    it(`clamp only a choose row to two lines inside the 44px pitch, in ${theme}`, async () => {
      const rows = byName(await measure(markups.badged!, theme));
      const choose = rows[LONG]!;
      expect(choose.lineHeight).toBe("16px");
      expect(choose.labelLines).toBe(2);
      expect(choose.row.height).toBe(44);
      for (const name of ["harbor", "storm", "dock", "quiet", "Where now?"]) {
        expect(rows[name]!.labelLines, name).toBe(1);
        expect(rows[name]!.row.height, name).toBe(44);
      }
    }, 60_000);

    it(`move nothing when a badge appears or goes, in ${theme}`, async () => {
      const badged = byName(await measure(markups.badged!, theme));
      const clean = byName(await measure(markups.clean!, theme));
      for (const name of Object.keys(DEPTHS)) {
        expect(clean[name]!.badge, name).toBeNull();
        expect(geometry(badged[name]!), name).toEqual(geometry(clean[name]!));
      }
    }, 60_000);

    it(`keep the rows' right edge when the list scrolls, in ${theme}`, async () => {
      const resting = await measure(markups.badged!, theme);
      const scrolling = await measure(markups.scrolling!, theme);
      expect(resting.overflows).toBe(false);
      expect(scrolling.overflows).toBe(true);
      expect(scrolling.scrollbar).toBeGreaterThan(0);
      const still = byName(resting);
      const moving = byName(scrolling);
      for (const name of Object.keys(DEPTHS)) {
        expect(moving[name]!.row.left, name).toBe(still[name]!.row.left);
        expect(moving[name]!.row.right, name).toBe(still[name]!.row.right);
      }
    }, 60_000);
  }

  const INSETS = [
    { width: 1024, inset: 10, heading: 18 },
    { width: 1100, inset: 10, heading: 18 },
    { width: 1101, inset: 14, heading: 24 },
  ] as const;
  for (const { width, inset, heading } of INSETS) {
    for (const theme of ["charcoal", "chalk"] as const) {
      it(`start and end the rows ${inset}px inside the rail at ${width}, reserving no column for a problem's mark, the heading over the glyphs, in ${theme}`, async () => {
        const badgedM = await measure(markups.badged!, theme, "fine", width);
        const badged = byName(badgedM);
        const clean = byName(await measure(markups.clean!, theme, "fine", width));
        expect(badgedM.listPaddingLeft).toBe(`${inset}px`);
        expect(badgedM.headingLeft).toBe(heading);
        for (const [name, depth] of Object.entries(DEPTHS)) {
          const r = badged[name]!;
          expect(r.row.left, name).toBe(inset + depth * 18);
          expect(r.row.right, name).toBe(RAIL_WIDTH - inset);
          expect(geometry(r), name).toEqual(geometry(clean[name]!));
          if (r.badge) expectOnGlyph(r, name, 28);
        }
      }, 60_000);
    }
  }

  it("widens the mark's press target to 44px under a coarse pointer, centred on the glyph inside the rail, the row keeping its inset and height", async () => {
    const m = await measure(markups.badged!, "charcoal", "coarse");
    const rows = byName(m);
    expect(m.listPaddingLeft).toBe("14px");
    for (const name of ["harbor", "storm", LONG, "dock", "market", "quiet"]) {
      const r = rows[name]!;
      expectOnGlyph(r, name, 44);
      expect(r.badge!.left, name).toBeGreaterThanOrEqual(0);
      expect(r.row.left, name).toBe(14 + DEPTHS[name]! * 18);
      expect(r.row.height, name).toBe(44);
      expect(r.label.left - r.row.left, name).toBe(36);
    }
  }, 60_000);
});
