import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import ts from "typescript";
import { afterAll, beforeAll, expect, test } from "vitest";

interface Sample {
  x: number;
  y: number;
  width: number;
  height: number;
  translate: string;
  transform: string;
}

interface Run {
  before: Sample;
  after: Sample;
  frames: Sample[];
  animations: number;
}

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

const open = async (css: string, html: string): Promise<Page> => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  await page.setContent(`<!doctype html><html><head><style>body { margin: 0; } ${css}</style></head><body><div id="root">${html}</div></body></html>`);
  await page.addScriptTag({ content: script });
  await page.evaluate(() => {
    const w = window as any;
    w.frames = [];
    window.requestAnimationFrame = (callback) => w.frames.push(callback);
    window.cancelAnimationFrame = () => {};
    w.sample = (el: Element) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { x: r.left, y: r.top, width: r.width, height: r.height, translate: style.translate, transform: style.transform };
    };
    w.seek = (time: number) => {
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = time;
      }
      for (const callback of w.frames.splice(0)) {
        callback(performance.now());
      }
    };
  });
  return page;
};

const run = async (css: string, html: string, change: string, times = [0, 500, 1000]): Promise<Run> => {
  const page = await open(css, html);
  try {
    return await page.evaluate(
      ({ change, times }) => {
        const w = window as any;
        const target = document.getElementById("target")!;
        const before = w.sample(target);
        const motion = new w.LayoutMotion();
        const boxes = motion.measure(document.getElementById("root"), () => true);
        new Function(change)();
        const after = w.sample(target);
        motion.play(boxes);
        const animations = target.getAnimations().length;
        const frames = times.map((time: number) => {
          w.seek(time);
          return w.sample(target);
        });
        return { before, after, frames, animations };
      },
      { change, times },
    );
  } finally {
    await page.close();
  }
};

const near = (actual: number, expected: number, label: string) =>
  expect(Math.abs(actual - expected), `${label}: ${actual} against ${expected}`).toBeLessThan(0.6);

const expectPath = (result: Run, axes: readonly ("x" | "y" | "width" | "height")[]) => {
  const [start, middle, end] = result.frames;
  for (const axis of axes) {
    near(start![axis], result.before[axis], `${axis} at the start`);
    near(middle![axis], (result.before[axis] + result.after[axis]) / 2, `${axis} halfway`);
    near(end![axis], result.after[axis], `${axis} at the end`);
  }
};

const expectSettled = (result: Run) => {
  expect(result.animations).toBe(0);
  const first = result.frames[0]!;
  expect(first.translate).toBe("none");
  for (const axis of ["x", "y", "width", "height"] as const) {
    near(first[axis], result.after[axis], `${axis} on the first frame`);
  }
};

const MOVE = `Object.assign(document.getElementById("target").style, { left: "110px", top: "50px", width: "120px" });`;

const frameAround = (transform: string) => ({
  css: `#root { perspective: 500px; }
        #frame { position: absolute; left: 250px; top: 140px; width: 200px; height: 200px; transform-origin: top left; ${transform}; }
        #target { position: absolute; left: 10px; top: 0; width: 80px; height: 30px; transition: layout 1s linear; }`,
  html: `<div id="frame"><div id="target"></div></div>`,
});

test.each([
  ["a uniform scale", "scale: 0.75"],
  ["an unequal scale", "scale: 2 1"],
  ["a scaling matrix", "transform: scale(1.5, 0.5)"],
])("in Chromium, a child of a parent with %s moves and resizes from its old box to its new one", async (_, transform) => {
  const { css, html } = frameAround(transform);
  const result = await run(css, html, MOVE);
  expect(result.animations).toBeGreaterThan(0);
  expectPath(result, ["x", "y", "width", "height"]);
});

test.each([
  ["a rotation", "rotate: 30deg"],
  ["a skew", "transform: skewX(15deg)"],
  ["a reflection", "scale: -1 1"],
  ["a mirroring matrix", "transform: scale(-1, 1)"],
  ["a 3D transform", "transform: rotateY(30deg)"],
  ["a 3D scale", "scale: 1 1 2"],
  ["a 3D translate", "translate: 0px 0px 40px"],
])("in Chromium, a child of a parent with %s takes its new box at once with nothing left on it", async (_, transform) => {
  const { css, html } = frameAround(transform);
  const result = await run(css, html, MOVE);
  expectSettled(result);
});

test("in Chromium, a child under a rotated ancestor two levels up takes its new box at once", async () => {
  const result = await run(
    `#outer { position: absolute; left: 250px; top: 100px; width: 300px; height: 300px; rotate: 20deg; }
     #frame { position: absolute; left: 20px; top: 20px; width: 200px; height: 200px; }
     #target { position: absolute; left: 20px; top: 20px; width: 80px; height: 30px; transition: layout 1s linear; }`,
    `<div id="outer"><div id="frame"><div id="target"></div></div></div>`,
    `document.getElementById("frame").style.left = "100px";`,
  );
  expectSettled(result);
});

test("in Chromium, a moving element whose ancestor becomes mirrored ends its motion with nothing left on it", async () => {
  const page = await open(
    `#frame { position: absolute; left: 250px; top: 140px; width: 200px; height: 200px; }
     #target { position: absolute; left: 10px; top: 0; width: 80px; height: 30px; transition: layout 1s linear; }`,
    `<div id="frame"><div id="target"></div></div>`,
  );
  try {
    const result = await page.evaluate(() => {
      const w = window as any;
      const root = document.getElementById("root")!;
      const target = document.getElementById("target")!;
      const motion = new w.LayoutMotion();
      const first = motion.measure(root, () => true);
      target.style.top = "100px";
      motion.play(first);
      w.seek(300);
      const moving = { animations: target.getAnimations().length, translate: getComputedStyle(target).translate };
      const second = motion.measure(root, () => true);
      document.getElementById("frame")!.style.scale = "-1 1";
      target.style.top = "120px";
      motion.play(second);
      w.seek(400);
      return { moving, now: w.sample(target), animations: target.getAnimations().length };
    });
    expect(result.moving.animations).toBeGreaterThan(0);
    expect(result.moving.translate).not.toBe("none");
    expect(result.animations).toBe(0);
    expect(result.now.translate).toBe("none");
    near(result.now.y, 140 + 120, "y");
  } finally {
    await page.close();
  }
});

test("in Chromium, a moving element whose ancestor becomes rotated mid-motion is let go on the next frame", async () => {
  const page = await open(
    `#frame { position: absolute; left: 250px; top: 140px; width: 200px; height: 200px; }
     #target { position: absolute; left: 10px; top: 0; width: 80px; height: 30px; transition: layout 1s linear; }`,
    `<div id="frame"><div id="target"></div></div>`,
  );
  try {
    const result = await page.evaluate(() => {
      const w = window as any;
      const target = document.getElementById("target")!;
      const motion = new w.LayoutMotion();
      const boxes = motion.measure(document.getElementById("root"), () => true);
      target.style.top = "100px";
      motion.play(boxes);
      w.seek(300);
      const moving = target.getAnimations().length;
      document.getElementById("frame")!.style.rotate = "20deg";
      w.seek(400);
      return { moving, animations: target.getAnimations().length, translate: getComputedStyle(target).translate };
    });
    expect(result.moving).toBeGreaterThan(0);
    expect(result.animations).toBe(0);
    expect(result.translate).toBe("none");
  } finally {
    await page.close();
  }
});

test("in Chromium, a box whose width animates keeps its unchanged auto height while its new text would reflow it", async () => {
  const result = await run(
    `#target { font: 16px/20px monospace; width: 100px; transition: layout 1s linear; }`,
    `<div id="target">Hi</div>`,
    `const target = document.getElementById("target"); target.style.width = "200px"; target.textContent = "one two three four";`,
    [0, 250, 500, 750, 1000],
  );
  expect(result.after.height).toBe(result.before.height);
  for (const frame of result.frames) {
    near(frame.height, result.before.height, "height");
  }
  const [start, , middle, , end] = result.frames;
  near(start!.width, result.before.width, "width at the start");
  near(middle!.width, (result.before.width + result.after.width) / 2, "width halfway");
  near(end!.width, result.after.width, "width at the end");
});

test.each([
  ["a uniform scale", "scale: 0.5"],
  ["a reflection", "scale: -1 1"],
  ["a mirroring matrix", "transform: scale(-1, 1)"],
  ["an unequal scale", "scale: 1.5 0.75"],
])("in Chromium, an element whose own style gives it %s still moves and resizes on its path", async (_, transform) => {
  const result = await run(
    `#frame { position: absolute; left: 250px; top: 140px; width: 300px; height: 300px; }
     #target { position: absolute; left: 10px; top: 0; width: 80px; height: 30px; ${transform}; transition: layout 1s linear; }`,
    `<div id="frame"><div id="target"></div></div>`,
    MOVE,
  );
  expect(result.animations).toBeGreaterThan(0);
  expectPath(result, ["x", "y", "width", "height"]);
});

test("in Chromium, a child keeps its path when an offset parent scaled differently from the level above it moves", async () => {
  const result = await run(
    `#outer { position: absolute; left: 250px; top: 100px; width: 300px; height: 300px; scale: 2 1; transform-origin: top left; }
     #frame { position: absolute; left: 0; top: 0; width: 200px; height: 200px; scale: 0.5 1; transform-origin: top left; }
     #target { position: absolute; left: 20px; top: 20px; width: 80px; height: 30px; transition: layout 1s linear; }`,
    `<div id="outer"><div id="frame"><div id="target"></div></div></div>`,
    `document.getElementById("frame").style.left = "100px"; document.getElementById("frame").style.top = "40px";`,
  );
  expect(result.animations).toBeGreaterThan(0);
  expectPath(result, ["x", "y"]);
});

test("in Chromium, a child under nested different scales moves on its path", async () => {
  const result = await run(
    `#outer { position: absolute; left: 100px; top: 50px; width: 400px; height: 300px; scale: 2 1; transform-origin: top left; }
     #middle { position: absolute; left: 10px; top: 10px; width: 200px; height: 200px; scale: 0.5 2; transform-origin: top left; }
     #frame { position: absolute; left: 10px; top: 10px; width: 150px; height: 100px; scale: 1.5; transform-origin: top left; }
     #target { position: absolute; left: 10px; top: 0; width: 80px; height: 30px; transition: layout 1s linear; }`,
    `<div id="outer"><div id="middle"><div id="frame"><div id="target"></div></div></div></div>`,
    MOVE,
  );
  expect(result.animations).toBeGreaterThan(0);
  expectPath(result, ["x", "y", "width", "height"]);
});

test("in Chromium, a child whose scaled DOM parent is not its offset parent moves on its path", async () => {
  const result = await run(
    `#frame { position: absolute; left: 200px; top: 100px; width: 300px; height: 300px; scale: 2 1.5; transform-origin: top left; }
     #inner { margin-left: 15px; padding-top: 5px; }
     #spacer { height: 10px; }
     #target { width: 80px; height: 30px; margin-left: 10px; transition: layout 1s linear; }`,
    `<div id="frame"><div id="inner"><div id="spacer"></div><div id="target"></div></div></div>`,
    `document.getElementById("spacer").style.height = "60px"; document.getElementById("target").style.marginLeft = "40px";`,
  );
  expect(result.animations).toBeGreaterThan(0);
  expectPath(result, ["x", "y"]);
});

test("in Chromium, a child of a moving element that is not its offset parent moves on its own path", async () => {
  const result = await run(
    `#column { position: relative; width: 300px; }
     #spacer { height: 0; }
     #mover { padding-top: 10px; transition: layout 1s linear; }
     #target { width: 80px; height: 30px; transition: layout 0.5s linear; }`,
    `<div id="column"><div id="spacer"></div><div id="mover"><div id="target"></div></div></div>`,
    `document.getElementById("spacer").style.height = "100px";`,
    [0, 250, 500, 1000],
  );
  const [start, quarter, half, end] = result.frames;
  near(start!.y, result.before.y, "y at the start");
  near(quarter!.y, (result.before.y + result.after.y) / 2, "y halfway through its own 0.5 s");
  near(half!.y, result.after.y, "y at the end of its own 0.5 s");
  near(end!.y, result.after.y, "y at the end");
});

test("in Chromium, a leaf nested under fractional offsets follows a resizing ancestor without a translate", async () => {
  const depth = 8;
  const result = await run(
    `#outer { position: relative; width: 205px; height: 40px; }
     .wrap { position: relative; left: 10%; width: 100%; height: 40px; }
     #target { width: 100px; height: 20px; }
     .motion { transition: layout 1s linear; }`,
    `<div id="outer" class="motion">${"<div class='wrap'>".repeat(depth)}<div id="target" class="motion"></div>${"</div>".repeat(depth)}</div>`,
    `document.getElementById("outer").style.width = "305px";`,
    Array.from({ length: 20 }, (_, i) => i * 50),
  );
  near(result.frames[0]!.x, 164, "x at the start");
  expect(result.frames.filter((frame) => frame.translate !== "none")).toEqual([]);
});

const SIZINGS = ["content-box", "border-box"];
const PADDINGS = [0, 30];
const BORDER_WIDTHS = [0, 10];
const BORDER_STYLES = ["solid", "none"];
const WIDTHS = [200, 240];

interface Drawing {
  sizing: string;
  padding: number;
  borderWidth: number;
  borderStyle: string;
  width: number;
}

const drawings: Drawing[] = SIZINGS.flatMap((sizing) =>
  PADDINGS.flatMap((padding) =>
    BORDER_WIDTHS.flatMap((borderWidth) =>
      BORDER_STYLES.flatMap((borderStyle) => WIDTHS.map((width) => ({ sizing, padding, borderWidth, borderStyle, width }))),
    ),
  ),
);

const pairs = drawings.flatMap((from) => drawings.map((to) => ({ from, to })));

test(`in Chromium, every change of how a size is drawn starts at the old real size and ends at the new one (${pairs.length} pairs over box-sizing, padding, border width, border style and width)`, async () => {
  const page = await open(
    `.cell { position: absolute; width: 400px; height: 200px; }
     .box { transition: layout 1s linear; }
     .content { height: 20px; }`,
    pairs
      .map((_, i) => `<div class="cell" style="left: ${(i % 32) * 400}px; top: ${Math.floor(i / 32) * 200}px"><div class="box" id="box-${i}"><div class="content"></div></div></div>`)
      .join(""),
  );
  try {
    const failures = await page.evaluate((pairs) => {
      const w = window as any;
      const apply = (el: HTMLElement, d: Drawing) =>
        Object.assign(el.style, {
          boxSizing: d.sizing,
          padding: `${d.padding}px`,
          borderWidth: `${d.borderWidth}px`,
          borderStyle: d.borderStyle,
          width: `${d.width}px`,
        });
      const boxes = pairs.map((_, i) => document.getElementById(`box-${i}`)!);
      const size = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height };
      };
      pairs.forEach(({ from }, i) => apply(boxes[i]!, from));
      const before = boxes.map(size);
      const motion = new w.LayoutMotion();
      const measured = motion.measure(document.getElementById("root"), () => true);
      pairs.forEach(({ to }, i) => apply(boxes[i]!, to));
      const after = boxes.map(size);
      motion.play(measured);
      const at = (time: number) => {
        w.seek(time);
        return boxes.map(size);
      };
      const start = at(0);
      const middle = at(500);
      const end = at(1000);
      const off = (a: number, b: number) => Math.abs(a - b) >= 0.6;
      const found: string[] = [];
      pairs.forEach((pair, i) => {
        for (const axis of ["width", "height"] as const) {
          const b = before[i]![axis];
          const a = after[i]![axis];
          const checks = [
            ["start", start[i]![axis], b],
            ["halfway", middle[i]![axis], (a + b) / 2],
            ["end", end[i]![axis], a],
          ] as const;
          for (const [when, actual, expected] of checks) {
            if (off(actual, expected)) {
              found.push(`${JSON.stringify(pair)} ${axis} ${when}: ${actual} against ${expected}`);
            }
          }
        }
      });
      return found;
    }, pairs);
    expect(failures).toEqual([]);
  } finally {
    await page.close();
  }
}, 60_000);
