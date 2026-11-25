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

const editAndDone = async (
  scriptHeight: number,
  scrollTop: number,
  readLayoutFirst: boolean,
) => {
  const tab = await browser.newPage({ viewport: { width: 400, height: 700 } });
  try {
    await tab.setContent(page(scriptHeight));
    return await tab.evaluate(
      async ([source, scrollTop, readLayoutFirst]) => {
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
        if (readLayoutFirst) {
          scroller.getBoundingClientRect();
        }
        const hidden = await seenBeforePaint();
        await frame();
        const hiddenLater = line.getBoundingClientRect().top;
        header.style.display = "";
        if (readLayoutFirst) {
          scroller.getBoundingClientRect();
        }
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
      [keepScriptStill.toString(), scrollTop, readLayoutFirst] as const,
    );
  } finally {
    await tab.close();
  }
};

const toggleDuringMomentum = async (startHidden: boolean) => {
  const tab = await browser.newPage({ viewport: { width: 400, height: 700 } });
  try {
    await tab.setContent(page(3000));
    return await tab.evaluate(
      async ([source, startHidden]) => {
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
        scroller.scrollTop = 600;
        keep(column);
        if (startHidden) {
          header.style.display = "none";
        }
        await frame();
        await frame();
        const STEP = 20;
        return await new Promise<{ before: number; after: number }>((done) => {
          let frames = 0;
          const step = () => {
            frames += 1;
            const before = line.getBoundingClientRect().top;
            scroller.scrollTop += STEP;
            if (frames === 4) {
              header.style.display = startHidden ? "" : "none";
              const after = new ResizeObserver(() => {
                after.disconnect();
                done({ before: before - STEP, after: line.getBoundingClientRect().top });
              });
              after.observe(header);
              return;
            }
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });
      },
      [keepScriptStill.toString(), startHidden] as const,
    );
  } finally {
    await tab.close();
  }
};

describe("the script under its header", () => {
  for (const [label, startHidden] of [
    ["returns", true],
    ["hides", false],
  ] as const) {
    it(`keeps the momentum step of a JavaScript fling when the header ${label} in that frame`, async () => {
      const moves = await toggleDuringMomentum(startHidden);

      expect(moves.after).toBe(moves.before);
    });
  }

  for (const [label, scriptHeight, scrollTop, readLayoutFirst] of [
    ["scrolled well down a long script", 3000, 800, false],
    ["at the top of a long script", 3000, 0, false],
    ["less than the header's height down a long script", 3000, 20, false],
    ["in a script too short to scroll", 300, 0, false],
    ["at the end of a long script", 3000, 100_000, false],
    ["at the end of a long script, with the layout read before the frame", 3000, 100_000, true],
    ["near the end of a long script, with the layout read before the frame", 3000, 2420, true],
  ] as const) {
    it(`holds the text still in the frame the header hides and in the frame it returns, ${label}`, async () => {
      const moves = await editAndDone(scriptHeight, scrollTop, readLayoutFirst);

      expect(moves.startScroll).toBe(Math.min(scrollTop, Math.max(0, scriptHeight - 552)));
      expect(moves.hidden).toBe(moves.start);
      expect(moves.hiddenLater).toBe(moves.start);
      expect(moves.shown).toBe(moves.start);
      expect(moves.shownLater).toBe(moves.start);
      expect(moves.endScroll).toBe(moves.startScroll);
      expect(moves.endPadding).toBe("");
      expect(moves.releasedPadding).toBe("");
    });
  }
});
