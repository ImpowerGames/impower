import { compile } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    window: { getActiveEditorForPane: () => undefined },
    fs: { getFiles: () => new Promise(() => {}) },
  },
}));

const { default: PreviewScreenplay } = await import(
  "../../src/modules/spark-editor/components/preview-screenplay/PreviewScreenplay"
);
const { default: workspaceSettings } = await import(
  "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings"
);

const UI_PACKAGE = resolve(process.cwd(), "../packages/impower-ui");
const SCREENPLAY_CSS = readFileSync(
  resolve(process.cwd(), "../packages/sparkdown-document-views/src/modules/screenplay-preview/sparkdown-screenplay-preview.css"),
  "utf8",
);

type Theme = "chalk" | "charcoal";

const markupFor = async (paper: "paper" | "theme") => {
  workspaceSettings.setPreference("screenplayPaper", paper);
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(PreviewScreenplay, {}), host));
  const markup = host.innerHTML;
  await act(async () => render(null, host));
  host.remove();
  return markup;
};

const lane = async (markup: string, theme: Theme) => {
  const compiler = await compile('@import "./src/style.css";', { base: UI_PACKAGE, onDependency: () => {} });
  const css = compiler.build([...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1]!.replace(/&amp;/g, "&").split(/\s+/)));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(
      `<!doctype html><html data-theme="${theme}" data-layout="desktop"><head><style>${css}</style><style>${SCREENPLAY_CSS}</style></head><body style="margin:0"><div style="position:relative;display:flex;width:544px;height:400px;background:rgb(17, 18, 19)">${markup}</div></body></html>`,
    );
    return await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>(".sparkdown-screenplay-preview-root")!;
      root.style.minHeight = "2000px";
      const scroller = root.parentElement!;
      const box = scroller.getBoundingClientRect();
      const probe = root.appendChild(document.createElement("div"));
      probe.style.backgroundColor = "var(--sp-paper)";
      const pagePaper = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const beside = document.elementFromPoint(box.right - 3, box.top + box.height / 2)!;
      return {
        overflows: scroller.scrollHeight > scroller.clientHeight,
        laneWidth: scroller.offsetWidth - scroller.clientWidth,
        besideIsScroller: beside === scroller,
        lane: getComputedStyle(beside).backgroundColor,
        pagePaper,
      };
    });
  } finally {
    await browser.close();
  }
};

describe("the Screenplay page's scroller lane (I-2517)", () => {
  it.each<[Theme, "paper" | "theme"]>([
    ["chalk", "paper"],
    ["charcoal", "paper"],
    ["chalk", "theme"],
    ["charcoal", "theme"],
  ])("paints the lane beside an overflowing page with the page's own paper in %s with %s", async (theme, paper) => {
    const markup = await markupFor(paper);
    const measured = await lane(markup, theme);
    expect(measured.overflows).toBe(true);
    expect(measured.laneWidth).toBeGreaterThan(0);
    expect(measured.besideIsScroller).toBe(true);
    expect(measured.pagePaper).not.toBe("rgba(0, 0, 0, 0)");
    expect(measured.lane).toBe(measured.pagePaper);
  }, 60_000);
});
