import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import ts from "typescript";
import { afterAll, beforeAll, expect, test } from "vitest";

const motionScript = () => {
  const source = readFileSync(resolve("../spark-dom/src/classes/LayoutMotion.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return `var exports = {};\n${compiled}\nwindow.LayoutMotion = exports.default;`;
};

let browser: Browser;
let script: string;

beforeAll(async () => {
  script = motionScript();
  browser = await chromium.launch();
}, 30_000);

afterAll(async () => {
  await browser?.close();
});

const open = async (html: string): Promise<Page> => {
  const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
  await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`);
  await page.addScriptTag({ content: script });
  await page.evaluate(() => {
    const w = window as any;
    w.frames = [];
    window.requestAnimationFrame = (callback) => w.frames.push(callback);
    window.cancelAnimationFrame = () => {};
    w.tick = (time: number) => {
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = time;
      }
      for (const callback of w.frames.splice(0)) callback(performance.now());
    };
  });
  return page;
};

test.each([
  ["a uniform scale", "scale: 0.75"],
  ["an unequal scale", "scale: 2 1"],
  ["a rotation", "rotate: 30deg"],
])("in Chromium, a child of a parent with %s starts at its old place and ends at its new one", async (_, transform) => {
  const page = await open(`<style>
    #frame { position: absolute; left: 250px; top: 140px; width: 200px; height: 200px; transform-origin: top left; ${transform}; }
    #child { position: absolute; left: 10px; top: 0; width: 80px; height: 30px; transition: layout 1s linear; }
  </style><div id="root"><div id="frame"><div id="child"></div></div></div>`);
  try {
    const result = await page.evaluate(() => {
      const w = window as any;
      const child = document.getElementById("child")!;
      const place = () => {
        const r = child.getBoundingClientRect();
        return { x: r.left, y: r.top };
      };
      const before = place();
      const motion = new w.LayoutMotion();
      const boxes = motion.measure(document.getElementById("root"), () => true);
      child.style.top = "100px";
      const after = place();
      motion.play(boxes);
      w.tick(0);
      const start = place();
      w.tick(1000);
      return { before, after, start, end: place(), animations: child.getAnimations().length };
    });
    expect(result.animations).toBeGreaterThan(0);
    expect(Math.abs(result.start.x - result.before.x)).toBeLessThan(0.6);
    expect(Math.abs(result.start.y - result.before.y)).toBeLessThan(0.6);
    expect(Math.abs(result.end.x - result.after.x)).toBeLessThan(0.6);
    expect(Math.abs(result.end.y - result.after.y)).toBeLessThan(0.6);
  } finally {
    await page.close();
  }
});

test("in Chromium, a leaf nested under fractional offsets follows a resizing ancestor without a translate", async () => {
  const depth = 8;
  const page = await open(`<style>
    #outer { position: relative; width: 205px; height: 40px; }
    .wrap { position: relative; left: 10%; width: 100%; height: 40px; }
    #leaf { width: 100px; height: 20px; }
    .motion { transition: layout 1s linear; }
  </style><div id="root"><div id="outer" class="motion">${"<div class='wrap'>".repeat(depth)}<div id="leaf" class="motion"></div>${"</div>".repeat(depth)}</div></div>`);
  try {
    const result = await page.evaluate(() => {
      const w = window as any;
      const outer = document.getElementById("outer")!;
      const leaf = document.getElementById("leaf")!;
      const motion = new w.LayoutMotion();
      const boxes = motion.measure(document.getElementById("root"), () => true);
      outer.style.width = "305px";
      motion.play(boxes);
      const samples: { x: number; translate: string }[] = [];
      for (let time = 0; time < 1000; time += 50) {
        w.tick(time);
        samples.push({ x: leaf.getBoundingClientRect().left, translate: getComputedStyle(leaf).translate });
      }
      return { samples, animations: outer.getAnimations().length };
    });
    expect(result.animations).toBeGreaterThan(0);
    expect(result.samples[0]!.x).toBeCloseTo(164, 1);
    expect(result.samples.filter((sample) => sample.translate !== "none")).toEqual([]);
  } finally {
    await page.close();
  }
});

test.each(["border-box", "content-box"])(
  "in Chromium, a %s box whose padding grows starts at its old real size and grows through it",
  async (sizing) => {
    const page = await open(`<style>
      #child { box-sizing: ${sizing}; width: 200px; padding: 0; transition: layout 1s linear; }
      #content { height: 20px; }
    </style><div id="root"><div id="child"><div id="content"></div></div></div>`);
    try {
      const result = await page.evaluate(() => {
        const w = window as any;
        const child = document.getElementById("child")!;
        const size = () => {
          const r = child.getBoundingClientRect();
          return { width: r.width, height: r.height };
        };
        const before = size();
        const motion = new w.LayoutMotion();
        const boxes = motion.measure(document.getElementById("root"), () => true);
        child.style.padding = "40px";
        const after = size();
        motion.play(boxes);
        w.tick(0);
        const start = size();
        w.tick(500);
        const middle = size();
        w.tick(1000);
        return { before, after, start, middle, end: size() };
      });
      expect(result.after.height).toBeGreaterThan(result.before.height);
      for (const axis of ["width", "height"] as const) {
        expect(Math.abs(result.start[axis] - result.before[axis])).toBeLessThan(0.6);
        expect(Math.abs(result.middle[axis] - (result.before[axis] + result.after[axis]) / 2)).toBeLessThan(0.6);
        expect(Math.abs(result.end[axis] - result.after[axis])).toBeLessThan(0.6);
      }
    } finally {
      await page.close();
    }
  },
);
