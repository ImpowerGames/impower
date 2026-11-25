// @vitest-environment node
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { keepScriptStill } from "../../src/modules/spark-editor/components/logic-script-editor/keepScriptStill";

const PAGE = `<!doctype html><html><body style="margin:0">
<div id="column" style="display:flex;flex-direction:column;height:600px">
  <header data-script-header style="height:48px;flex:none"></header>
  <div style="flex:1;min-height:0;display:flex">
    <div class="cm-scroller" style="flex:1;overflow:auto">
      <div style="height:3000px;position:relative"><div id="line" style="position:absolute;top:1000px;height:20px;width:10px"></div></div>
    </div>
  </div>
</div></body></html>`;

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe("the script under its header", () => {
  it("holds the text still in the frame the header hides and in the frame it returns", async () => {
    const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
    try {
      await page.setContent(PAGE);
      const moves = await page.evaluate(async (source) => {
        const keep = new Function(`return (${source})`)() as (column: HTMLElement) => () => void;
        const column = document.getElementById("column")!;
        const header = column.querySelector<HTMLElement>("[data-script-header]")!;
        const scroller = column.querySelector<HTMLElement>(".cm-scroller")!;
        const line = document.getElementById("line")!;
        const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        scroller.scrollTop = 800;
        keep(column);
        await frame();
        const seenBeforePaint = () =>
          new Promise<number>((done) => {
            const after = new ResizeObserver(() => {
              after.disconnect();
              done(line.getBoundingClientRect().top);
            });
            after.observe(header);
          });
        const start = line.getBoundingClientRect().top;
        const firstFrame = seenBeforePaint();
        await frame();
        header.style.display = "none";
        const hidden = await seenBeforePaint();
        await frame();
        const hiddenLater = line.getBoundingClientRect().top;
        header.style.display = "";
        const shown = await seenBeforePaint();
        await frame();
        return {
          start,
          first: await firstFrame,
          hidden,
          hiddenLater,
          shown,
          shownLater: line.getBoundingClientRect().top,
          scrollTop: scroller.scrollTop,
        };
      }, keepScriptStill.toString());

      expect(moves.first).toBe(moves.start);
      expect(moves.hidden).toBe(moves.start);
      expect(moves.hiddenLater).toBe(moves.start);
      expect(moves.shown).toBe(moves.start);
      expect(moves.shownLater).toBe(moves.start);
      expect(moves.scrollTop).toBe(800);
    } finally {
      await page.close();
    }
  });
});
