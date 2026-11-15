import { ListRow, ListRowBadge } from "@impower/impower-ui/components";
import { compile, optimize } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import { Fragment, h } from "preact";
import { renderToString } from "preact-render-to-string";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import RowMenu from "../../src/modules/spark-editor/components/scripts-page/RowMenu";

const SRC = resolve("../packages/impower-ui/src");

const row = (id: string, name: string, severity?: "error" | "warning") =>
  renderToString(
    h(
      "div",
      { id, style: "width:100%" },
      h(ListRow, {
        size: "library",
        label: name,
        description: "Modified just now · 48 B",
        actions: h(
          Fragment,
          null,
          severity &&
            h(ListRowBadge, {
              placement: "trailing",
              severity,
              label: `1 ${severity} in ${name}`,
              onClick: () => {},
            }),
          h(RowMenu, { name, main: false, onAction: () => {} }),
        ),
        onClick: () => {},
      }),
    ),
  );

const LONG = `${"a_rather_long_script_name_".repeat(10)}.sd`;

const markup =
  row("plain", "main.sd") +
  row("warning", "chapter_1.sd", "warning") +
  row("error", "chapter_2.sd", "error") +
  row("long", LONG, "warning");

const VIEWPORTS = [
  { width: 430, layout: "phone", pointer: "coarse" },
  { width: 768, layout: "compact", pointer: "fine" },
  { width: 1440, layout: "desktop", pointer: "fine" },
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

const measure = async (
  viewport: (typeof VIEWPORTS)[number],
  theme: "charcoal" | "chalk",
) => {
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
      const box = (el: Element | null) => {
        const r = el!.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      const probe = (value: string) => {
        const el = document.body.appendChild(document.createElement("span"));
        el.style.color = value;
        const color = getComputedStyle(el).color;
        el.remove();
        return color;
      };
      const read = (id: string) => {
        const host = document.getElementById(id)!;
        const rowBox = host.firstElementChild!;
        const open = rowBox.querySelector("button:not([data-list-row-badge])")!;
        const label = open.querySelector("span > span")!;
        const badge = rowBox.querySelector("[data-list-row-badge]");
        const menu = rowBox.querySelector('button[aria-label^="Options for"]')!;
        return {
          row: box(rowBox),
          label: box(label),
          labelScroll: (label as HTMLElement).scrollWidth,
          menu: box(menu),
          badge: badge ? box(badge) : null,
          mark: badge ? box(badge.querySelector("svg")) : null,
          markColor: badge ? getComputedStyle(badge.querySelector("svg")!).color : null,
        };
      };
      return {
        plain: read("plain"),
        warning: read("warning"),
        error: read("error"),
        long: read("long"),
        warningColor: probe("var(--warning)"),
        errorColor: probe("var(--error)"),
      };
    });
  } finally {
    await page.close();
  }
};

describe("Scripts row problem badge, in Chromium", () => {
  for (const viewport of VIEWPORTS) {
    for (const theme of ["charcoal", "chalk"] as const) {
      it(`sits before the menu as a 44px target with a 14px mark at ${viewport.width} in ${theme}, moving nothing`, async () => {
        const m = await measure(viewport, theme);
        expect(m.plain.row.width).toBe(viewport.width);
        for (const kind of ["warning", "error", "long"] as const) {
          const r = m[kind];
          expect(r.badge, kind).not.toBeNull();
          expect(r.row.height).toBe(m.plain.row.height);
          expect(r.label.left).toBe(m.plain.label.left);
          expect(r.menu.left).toBe(m.plain.menu.left);
          expect(r.menu.width).toBe(m.plain.menu.width);
          expect(r.badge!.width).toBe(44);
          expect(r.badge!.height).toBe(44);
          expect(r.badge!.right).toBeLessThanOrEqual(r.menu.left);
          expect(r.menu.left - r.badge!.right).toBe(0);
          expect(r.badge!.top - r.row.top).toBe(r.row.bottom - r.badge!.bottom);
          expect(r.mark!.width).toBe(14);
          expect(r.mark!.height).toBe(14);
          expect(r.mark!.left + r.mark!.width / 2).toBe(r.badge!.left + 22);
          expect(r.label.right).toBeLessThanOrEqual(r.badge!.left);
        }
        expect(m.plain.badge).toBeNull();
        expect(m.warning.markColor).toBe(m.warningColor);
        expect(m.error.markColor).toBe(m.errorColor);
        expect(m.long.labelScroll).toBeGreaterThan(m.long.label.width);
      }, 60_000);
    }
  }
});
