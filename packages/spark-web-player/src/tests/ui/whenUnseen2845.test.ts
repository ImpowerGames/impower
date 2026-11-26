import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import ts from "typescript";
import { afterAll, beforeAll, expect, test } from "vitest";

interface Run {
  early: boolean;
  opacity: string;
  later: string;
  settled: boolean;
}

const unseenScript = () => {
  const source = readFileSync(resolve("../spark-dom/src/utils/whenUnseen.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return `var exports = {};\n${compiled}\nwindow.whenUnseen = exports.whenUnseen;`;
};

let browser: Browser;
let script: string;

beforeAll(async () => {
  script = unseenScript();
  browser = await chromium.launch();
}, 30_000);

afterAll(async () => {
  await browser?.close();
});

const open = async (css = ""): Promise<Page> => {
  const page = await browser.newPage();
  await page.setContent(
    `<!doctype html><html><head><style>${css}</style></head><body><div id="portrait"><span id="image"><span id="picture">a</span></span></div></body></html>`,
  );
  await page.addScriptTag({ content: script });
  return page;
};

const run = async (later: Keyframe[], css = ""): Promise<Run> => {
  const page = await open(css);
  try {
    return await page.evaluate(async (later) => {
      const w = window as any;
      const portrait = document.getElementById("portrait")!;
      const picture = document.getElementById("picture")!;
      const timing = { easing: "linear", fill: "both" } as const;
      const first = portrait.animate([{ opacity: "0" }], { ...timing, duration: 4000 });
      first.pause();
      first.currentTime = 3700;
      const second = portrait.animate(later, { ...timing, duration: 6000 });
      second.pause();
      second.currentTime = 100;
      let removed!: () => void;
      const ended = new Promise<void>((resolve) => {
        removed = resolve;
      });
      let early = false;
      const unseen = w.whenUnseen([picture], ended).then(() => {
        early = true;
      });
      const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await frames();
      const before = early;
      first.finish();
      await first.finished;
      await frames();
      const result = { early: !before && early, opacity: getComputedStyle(portrait).opacity, later: second.playState };
      second.finish();
      await frames();
      const settled = early;
      removed();
      await Promise.race([unseen, frames()]);
      return { ...result, settled };
    }, later);
  } finally {
    await page.close();
  }
};

test("a picture whose first fade leaves it transparent is unseen while a longer fade layered on it still plays (#2845)", async () => {
  const result = await run([{ opacity: "0" }]);
  expect(result).toEqual({ early: true, opacity: "0", later: "paused", settled: true });
});

test("a picture whose later fade starts from full opacity is seen until that fade ends at zero (#2845)", async () => {
  const result = await run([{ opacity: "1" }, { opacity: "0" }]);
  expect(result.early).toBe(false);
  expect(Number(result.opacity)).toBeGreaterThan(0);
  expect(result.settled).toBe(true);
});

test("a picture faded back in above its fade out is never unseen (#2845)", async () => {
  const result = await run([{ opacity: "1" }]);
  expect(result.early).toBe(false);
  expect(Number(result.opacity)).toBeGreaterThan(0);
  expect(result.settled).toBe(false);
});

test("a picture whose opacity an important style holds at full is seen whatever its fades say (#2845)", async () => {
  const result = await run([{ opacity: "0" }], "#portrait { opacity: 1 !important; }");
  expect(result).toEqual({ early: false, opacity: "1", later: "paused", settled: false });
});

const watchThen = async (change: string) => {
  const page = await open();
  try {
    return await page.evaluate(async (change) => {
      const w = window as any;
      const portrait = document.getElementById("portrait")!;
      const picture = document.getElementById("picture")!;
      const fade = portrait.animate([{ opacity: "1" }, { opacity: "0" }], { duration: 6000, fill: "both" });
      fade.pause();
      fade.currentTime = 100;
      let early = false;
      w.whenUnseen([picture], new Promise(() => {})).then(() => {
        early = true;
      });
      const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await frames();
      const before = early;
      new Function("portrait", "picture", change)(portrait, picture);
      await frames();
      await frames();
      return { before, early, fade: fade.playState };
    }, change);
  } finally {
    await page.close();
  }
};

test("a picture a later write holds at zero is unseen while the earlier fade still plays (#2845)", async () => {
  const result = await watchThen(
    `portrait.animate([{ opacity: "0" }, { opacity: "0" }], { duration: 6000, fill: "both" }).pause();`,
  );
  expect(result).toEqual({ before: false, early: true, fade: "paused" });
});

test("a picture a later write removes is unseen while the earlier fade still plays (#2845)", async () => {
  const result = await watchThen(`picture.remove();`);
  expect(result).toEqual({ before: false, early: true, fade: "paused" });
});
