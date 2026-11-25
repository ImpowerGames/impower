import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import ts from "typescript";
import { afterAll, beforeAll, expect, test } from "vitest";

interface Sample {
  x: number;
  y: number;
  width: number;
  height: number;
  translate: string;
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

const run = async (css: string, html: string, change: string, times = [0, 500, 1000]): Promise<Run> => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    await page.setContent(`<!doctype html><html><head><style>body { margin: 0; } ${css}</style></head><body><div id="root">${html}</div></body></html>`);
    await page.addScriptTag({ content: script });
    return await page.evaluate(
      ({ change, times }) => {
        const w = window as any;
        const frames: FrameRequestCallback[] = [];
        window.requestAnimationFrame = (callback) => frames.push(callback);
        window.cancelAnimationFrame = () => {};
        const target = document.getElementById("target")!;
        const sample = () => {
          const r = target.getBoundingClientRect();
          return { x: r.left, y: r.top, width: r.width, height: r.height, translate: getComputedStyle(target).translate };
        };
        const before = sample();
        const motion = new w.LayoutMotion();
        const boxes = motion.measure(document.getElementById("root"), () => true);
        new Function(change)();
        const after = sample();
        motion.play(boxes);
        const animations = document.getAnimations();
        const samples = times.map((time) => {
          for (const animation of animations) {
            animation.pause();
            animation.currentTime = time;
          }
          for (const callback of frames.splice(0)) {
            callback(performance.now());
          }
          return sample();
        });
        return { before, after, frames: samples, animations: target.getAnimations().length };
      },
      { change, times },
    );
  } finally {
    await page.close();
  }
};

const near = (actual: number, expected: number, label: string) =>
  expect(Math.abs(actual - expected), `${label}: ${actual} against ${expected}`).toBeLessThan(0.6);

const expectPath = (result: Run, axes: readonly (keyof Omit<Sample, "translate">)[]) => {
  const [start, middle, end] = result.frames;
  for (const axis of axes) {
    near(start![axis], result.before[axis], `${axis} at the start`);
    near(middle![axis], (result.before[axis] + result.after[axis]) / 2, `${axis} halfway`);
    near(end![axis], result.after[axis], `${axis} at the end`);
  }
};

test.each([
  ["a uniform scale", "scale: 0.75"],
  ["an unequal scale", "scale: 2 1"],
  ["a rotation", "rotate: 30deg"],
  ["a reflection", "scale: -1 1"],
  ["a mirroring matrix", "transform: scale(-1, 1)"],
  ["a 3D transform", "transform: rotateY(30deg)"],
])("in Chromium, a child of a parent with %s moves from its old place to its new one", async (_, transform) => {
  const result = await run(
    `#frame { position: absolute; left: 250px; top: 140px; width: 200px; height: 200px; transform-origin: top left; ${transform}; }
     #target { position: absolute; left: 10px; top: 0; width: 80px; height: 30px; transition: layout 1s linear; }`,
    `<div id="frame"><div id="target"></div></div>`,
    `document.getElementById("target").style.left = "110px"; document.getElementById("target").style.top = "50px";`,
  );
  expect(result.animations).toBeGreaterThan(0);
  expectPath(result, ["x", "y"]);
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

test("in Chromium, a child of a rotated offset parent moves with that parent", async () => {
  const result = await run(
    `#outer { position: absolute; left: 250px; top: 100px; width: 300px; height: 300px; }
     #frame { position: absolute; left: 0; top: 0; width: 200px; height: 200px; rotate: 30deg; transform-origin: top left; }
     #target { position: absolute; left: 20px; top: 20px; width: 80px; height: 30px; transition: layout 1s linear; }`,
    `<div id="outer"><div id="frame"><div id="target"></div></div></div>`,
    `document.getElementById("frame").style.left = "100px";`,
  );
  for (const frame of result.frames) {
    expect(frame.translate).toBe("none");
    near(frame.x, result.after.x, "x");
    near(frame.y, result.after.y, "y");
  }
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

test.each(["border-box", "content-box"])(
  "in Chromium, a %s box whose padding and border grow starts at its old real size and grows through them",
  async (sizing) => {
    const result = await run(
      `#target { box-sizing: ${sizing}; width: 200px; padding: 0; border: 0 solid black; transition: layout 1s linear; }
       #content { height: 20px; }`,
      `<div id="target"><div id="content"></div></div>`,
      `Object.assign(document.getElementById("target").style, { padding: "30px", borderWidth: "10px" });`,
    );
    expect(result.after.height).toBeGreaterThan(result.before.height);
    expectPath(result, ["width", "height"]);
  },
);

test.each(["border-box", "content-box"])(
  "in Chromium, a %s box whose border style is removed changes its real size smoothly",
  async (sizing) => {
    const result = await run(
      `#target { box-sizing: ${sizing}; width: 200px; height: 80px; padding: 10px; border: 10px solid black; transition: layout 1s linear; }`,
      `<div id="target"></div>`,
      `document.getElementById("target").style.borderStyle = "none";`,
    );
    expectPath(result, ["width", "height"]);
  },
);

test.each([
  ["content-box", "border-box"],
  ["border-box", "content-box"],
])("in Chromium, a box whose box-sizing changes from %s to %s animates its real size", async (from, to) => {
  const result = await run(
    `#target { box-sizing: ${from}; width: 200px; height: 80px; padding: 20px; border: 10px solid black; transition: layout 1s linear; }`,
    `<div id="target"></div>`,
    `document.getElementById("target").style.boxSizing = "${to}";`,
  );
  expect(Math.abs(result.after.width - result.before.width)).toBeGreaterThan(10);
  expectPath(result, ["width", "height"]);
});
