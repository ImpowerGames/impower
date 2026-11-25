import { compile } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import EDITOR_THEME from "@impower/sparkdown-document-views/src/modules/script-editor/constants/EDITOR_THEME";

const IMPOWER_UI_SRC = resolve("../packages/impower-ui/src");
const DOCUMENT_CSS = readFileSync(resolve("src/public/document.css"), "utf8");
const SCROLLER_PADDING = (
  EDITOR_THEME as Record<string, Record<string, string>>
)["& .cm-scroller"]!.padding!;

vi.mock("@impower/impower-ui/layout", () => ({
  useLayout: () => "phone",
  useCoarsePointer: () => true,
  layoutState: { current: () => "phone", subscribe: () => () => {} },
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { window: {} },
}));

const { default: ScriptHeader } =
  await import("../../src/modules/spark-editor/components/script-header/ScriptHeader");
const { default: WriterBar } =
  await import("../../src/modules/spark-editor/components/writer-bar/WriterBar");
const { default: BottomNavigation } =
  await import("../../src/modules/spark-editor/components/desktop-shell/BottomNavigation");

let browser: Browser;
let headerMarkup = "";
let writerBarMarkup = "";
let navigationMarkup = "";
let headerCss = "";

const markupOf = async (vnode: ReturnType<typeof h>, selector: string) => {
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(vnode, host));
  const element = host.querySelector(selector)!;
  const markup = element.outerHTML;
  const classes = Array.from(element.querySelectorAll("[class]"))
    .concat(element)
    .flatMap((child) => Array.from(child.classList));
  await act(async () => render(null, host));
  host.remove();
  return { markup, classes };
};

beforeAll(async () => {
  const header = await markupOf(h(ScriptHeader, { filename: "main.sd" }), "[data-script-header]");
  const writerBar = await markupOf(h(WriterBar, { filename: "main.sd" }), "[data-writer-bar]");
  const navigation = await markupOf(h(BottomNavigation, null), "[data-bottom-navigation]");
  headerMarkup = header.markup;
  writerBarMarkup = writerBar.markup;
  navigationMarkup = navigation.markup;
  const compiler = await compile(
    readFileSync(join(IMPOWER_UI_SRC, "style.css"), "utf8"),
    { base: IMPOWER_UI_SRC, onDependency: () => {} },
  );
  headerCss = compiler.build([
    ...header.classes,
    ...writerBar.classes,
    ...navigation.classes,
  ]);
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

const page = (scriptHeight: number) => `<!doctype html>
<html data-layout="phone" data-theme="chalk"><head>
<style>${DOCUMENT_CSS}</style><style>${headerCss}</style>
<style>.cm-scroller { display: flex; align-items: flex-start; flex: 1; min-height: 0; overflow: auto; padding: ${SCROLLER_PADDING}; }</style>
</head><body><div id="app"><div id="shell" data-phone-shell style="display:flex;flex-direction:column;height:760px">
<div data-script-column style="display:flex;flex-direction:column;flex:1;min-height:0">
${headerMarkup}
<div style="flex:1;min-height:0;display:flex"><div class="cm-scroller"><div style="flex:1;height:${scriptHeight}px;position:relative">
<div id="first" style="position:absolute;top:0;height:20px;width:10px"></div>
<div id="line" style="position:absolute;top:${Math.min(1000, scriptHeight / 2)}px;height:20px;width:10px"></div>
</div></div></div>
${writerBarMarkup}
</div>
${navigationMarkup}
</div></div></body></html>`;

const open = async (scriptHeight: number) => {
  const tab = await browser.newPage({ viewport: { width: 430, height: 900 } });
  await tab.setContent(page(scriptHeight));
  return tab;
};

describe("the script while its header and the phone's bottom bars hide for editing", () => {
  for (const [label, scriptHeight, scrollTop] of [
    ["scrolled well down a long script", 3000, 800],
    ["at the top of a long script", 3000, 0],
    ["less than the header's height down a long script", 3000, 20],
    ["at the end of a long script", 3000, 100_000],
    ["in a script too short to scroll", 300, 0],
  ] as const) {
    it(`does not move in the frame Edit hides the header and bottom bars or Done returns them, ${label}`, async () => {
      const tab = await open(scriptHeight);
      try {
        const moves = await tab.evaluate((scrollTop) => {
          const shell = document.getElementById("shell")!;
          const header = document.querySelector<HTMLElement>("[data-script-header]")!;
          const writerBar = document.querySelector<HTMLElement>("[data-writer-bar]")!;
          const navigation = document.querySelector<HTMLElement>("[data-bottom-navigation]")!;
          const scroller = document.querySelector<HTMLElement>(".cm-scroller")!;
          const line = document.getElementById("line")!;
          const measure = () => ({
            top: line.getBoundingClientRect().top,
            scroll: scroller.scrollTop,
            header: header.offsetHeight,
            bars: writerBar.offsetHeight + navigation.offsetHeight,
          });
          scroller.scrollTop = scrollTop;
          const start = measure();
          shell.setAttribute("data-editing", "");
          navigation.hidden = true;
          const editing = measure();
          shell.removeAttribute("data-editing");
          navigation.hidden = false;
          const reading = measure();
          return { start, editing, reading };
        }, scrollTop);

        expect(moves.start.header).toBe(48);
        expect(moves.start.bars).toBe(117);
        expect(moves.editing.header).toBe(0);
        expect(moves.editing.bars).toBe(0);
        expect(moves.editing.top).toBe(moves.start.top);
        expect(moves.editing.scroll).toBe(moves.start.scroll);
        expect(moves.reading).toEqual(moves.start);
      } finally {
        await tab.close();
      }
    });
  }

  it("does not move when Done returns the header and bottom bars with the script scrolled to its end while editing", async () => {
    const tab = await open(3000);
    try {
      const moves = await tab.evaluate(() => {
        const shell = document.getElementById("shell")!;
        const navigation = document.querySelector<HTMLElement>("[data-bottom-navigation]")!;
        const scroller = document.querySelector<HTMLElement>(".cm-scroller")!;
        const line = document.getElementById("line")!;
        shell.setAttribute("data-editing", "");
        navigation.hidden = true;
        scroller.scrollTop = scroller.scrollHeight;
        const editing = { top: line.getBoundingClientRect().top, scroll: scroller.scrollTop };
        shell.removeAttribute("data-editing");
        navigation.hidden = false;
        const reading = { top: line.getBoundingClientRect().top, scroll: scroller.scrollTop };
        return { editing, reading };
      });

      expect(moves.reading).toEqual(moves.editing);
    } finally {
      await tab.close();
    }
  });

  for (const [label, startEditing] of [
    ["Done returns the header", true],
    ["Edit hides the header", false],
  ] as const) {
    it(`keeps a JavaScript fling's momentum step when ${label} in that frame`, async () => {
      const tab = await open(3000);
      try {
        const moves = await tab.evaluate(async (startEditing) => {
          const shell = document.getElementById("shell")!;
          const navigation = document.querySelector<HTMLElement>("[data-bottom-navigation]")!;
          const scroller = document.querySelector<HTMLElement>(".cm-scroller")!;
          const line = document.getElementById("line")!;
          if (startEditing) {
            shell.setAttribute("data-editing", "");
            navigation.hidden = true;
          }
          scroller.scrollTop = 600;
          const STEP = 20;
          return await new Promise<{ before: number; after: number }>((done) => {
            let frames = 0;
            const step = () => {
              frames += 1;
              const before = line.getBoundingClientRect().top;
              scroller.scrollTop += STEP;
              if (frames === 4) {
                navigation.hidden = shell.toggleAttribute("data-editing");
                done({ before: before - STEP, after: line.getBoundingClientRect().top });
                return;
              }
              requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          });
        }, startEditing);

        expect(moves.after).toBe(moves.before);
      } finally {
        await tab.close();
      }
    });
  }

  it("leaves the top of the script in view when the header grows with the layout while reading", async () => {
    const tab = await open(3000);
    try {
      const moves = await tab.evaluate(() => {
        const header = document.querySelector<HTMLElement>("[data-script-header]")!;
        const scroller = document.querySelector<HTMLElement>(".cm-scroller")!;
        const first = document.getElementById("first")!;
        const inset = () => first.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        const before = { header: header.offsetHeight, scroll: scroller.scrollTop, inset: inset() };
        document.documentElement.dataset.layout = "desktop";
        const after = { header: header.offsetHeight, scroll: scroller.scrollTop, inset: inset() };
        return { before, after };
      });

      expect(moves.after.header).toBeGreaterThan(moves.before.header);
      expect(moves.after.scroll).toBe(0);
      expect(moves.after.inset).toBe(moves.before.inset);
    } finally {
      await tab.close();
    }
  });
});
