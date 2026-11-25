// @vitest-environment node
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { keepScriptStill } from "../../src/modules/spark-editor/components/logic-script-editor/keepScriptStill";

const page = (scriptHeight: number) => `<!doctype html><html><body style="margin:0">
<div id="column" style="display:flex;flex-direction:column;height:600px">
  <header data-script-header style="height:48px;flex:none"></header>
  <div style="flex:1;min-height:0;display:flex">
    <div class="cm-scroller" style="flex:1;overflow:auto">
      <div style="height:${scriptHeight}px;position:relative"><div id="line" style="position:absolute;top:${Math.min(1000, scriptHeight / 2)}px;height:20px;width:10px"></div></div>
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

const editAndDone = async (scriptHeight: number, scrollTop: number) => {
  const tab = await browser.newPage({ viewport: { width: 400, height: 700 } });
  try {
    await tab.setContent(page(scriptHeight));
    return await tab.evaluate(
      async ([source, scrollTop]) => {
        const keep = new Function(`return (${source})`)() as (
          column: HTMLElement,
        ) => () => void;
        const column = document.getElementById("column")!;
        const header = column.querySelector<HTMLElement>("[data-script-header]")!;
        const scroller = column.querySelector<HTMLElement>(".cm-scroller")!;
        const line = document.getElementById("line")!;
        const frame = () =>
          new Promise((done) =>
            requestAnimationFrame(() => requestAnimationFrame(done)),
          );
        scroller.scrollTop = scrollTop;
        const release = keep(column);
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
        const startScroll = scroller.scrollTop;
        header.style.display = "none";
        const hidden = await seenBeforePaint();
        await frame();
        const hiddenLater = line.getBoundingClientRect().top;
        header.style.display = "";
        const shown = await seenBeforePaint();
        await frame();
        const shownLater = line.getBoundingClientRect().top;
        const endScroll = scroller.scrollTop;
        const endPadding = scroller.style.paddingTop;
        header.style.display = "none";
        await frame();
        release();
        return {
          start,
          hidden,
          hiddenLater,
          shown,
          shownLater,
          startScroll,
          endScroll,
          endPadding,
          releasedPadding: scroller.style.paddingTop,
        };
      },
      [keepScriptStill.toString(), scrollTop] as const,
    );
  } finally {
    await tab.close();
  }
};

describe("the script under its header", () => {
  for (const [label, scriptHeight, scrollTop] of [
    ["scrolled well down a long script", 3000, 800],
    ["at the top of a long script", 3000, 0],
    ["less than the header's height down a long script", 3000, 20],
    ["in a script too short to scroll", 300, 0],
  ] as const) {
    it(`holds the text still in the frame the header hides and in the frame it returns, ${label}`, async () => {
      const moves = await editAndDone(scriptHeight, scrollTop);

      expect(moves.startScroll).toBe(scrollTop);
      expect(moves.hidden).toBe(moves.start);
      expect(moves.hiddenLater).toBe(moves.start);
      expect(moves.shown).toBe(moves.start);
      expect(moves.shownLater).toBe(moves.start);
      expect(moves.endScroll).toBe(scrollTop);
      expect(moves.endPadding).toBe("");
      expect(moves.releasedPadding).toBe("");
    });
  }
});
