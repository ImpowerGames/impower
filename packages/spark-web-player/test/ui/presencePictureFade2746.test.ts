import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const presenceScript = () => {
  const source = readFileSync(resolve("../spark-dom/src/classes/PresencePlayer.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return `var exports = {};\nvar require = () => ({ PRESENCE_ATTRIBUTE: "data-presence" });\n${compiled}\nwindow.PresencePlayer = exports.default;`;
};

let browser: Browser;
let script: string;

beforeAll(async () => {
  script = presenceScript();
  browser = await chromium.launch();
}, 30_000);

afterAll(async () => {
  await browser?.close();
});

const CSS = `
.portrait { width: 200px; height: 200px; background: red; opacity: 1; transition: opacity 1000ms linear; }
.portrait[data-presence="initial"] { opacity: 0; }
`;

const open = async (): Promise<Page> => {
  const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
  await page.setContent(`<!doctype html><html><head><style>${CSS}</style></head><body><div class="portrait" id="portrait"></div></body></html>`);
  await page.addScriptTag({ content: script });
  return page;
};

interface Held {
  keyframes: Keyframe[];
  duration: number;
  show?: boolean;
  running?: boolean;
}

const SHOW_PIN: Held = { keyframes: [{ opacity: "1" }], duration: 0, show: true };
const FADE_IN: Held = {
  keyframes: [
    { opacity: "0", offset: 0, easing: "ease-in" },
    { opacity: "1", offset: 1 },
  ],
  duration: 30,
  show: true,
};
const DIM: Held = { keyframes: [{ opacity: "0.5" }], duration: 0 };
const HALF: Held = { keyframes: [{ transform: "scale(0.5)" }], duration: 0 };
const PULSE: Held = { keyframes: [{ opacity: "0.2" }, { opacity: "0.2" }], duration: 60_000, running: true };
const SHRINK_FADE: Held = { keyframes: [{ opacity: "0.5", transform: "scale(0.5)" }], duration: 0 };

const arrive = (page: Page, held: Held[], presence: "show" | "hide" = "show") =>
  page.evaluate(
    async ({ held, presence }) => {
      const el = document.getElementById("portrait")!;
      const hold = { add: () => new Promise(() => {}) };
      const player = new (window as any).PresencePlayer(hold, () => false);
      for (const { keyframes, duration, show, running } of held) {
        const animation = el.animate(keyframes, { duration, fill: "both" });
        if (!running) {
          animation.finish();
        }
        if (show) {
          player.shows?.([animation]);
        }
      }
      el.setAttribute("data-presence", presence === "show" ? "initial" : "show");
      void getComputedStyle(el).opacity;
      void player.play(el, presence);
      const fades = document
        .getAnimations()
        .filter((animation: any) => animation.transitionProperty === "opacity");
      const opacityAt = (time: number) => {
        for (const fade of fades) {
          fade.pause();
          fade.currentTime = time;
        }
        return Number(getComputedStyle(el).opacity);
      };
      return {
        fading: fades.length,
        opacity: [0, 500, 1000].map(opacityAt),
        transform: getComputedStyle(el).transform,
        width: el.getBoundingClientRect().width,
        held: el.getAnimations().filter((animation) => !("transitionProperty" in animation)).length,
      };
    },
    { held, presence },
  );

describe("an arriving picture takes its @initial look and fades to its settled look (#2746)", () => {
  test("a picture returning with the built-in show it holds fades in from @initial", async () => {
    const page = await open();
    const result = await arrive(page, [SHOW_PIN]);
    expect(result.fading).toBe(1);
    expect(result.opacity).toEqual([0, 0.5, 1]);
    await page.close();
  });

  test("a picture whose layer finished a timed fade-in, with offsets and an easing, still fades in from @initial when it returns", async () => {
    const page = await open();
    const result = await arrive(page, [FADE_IN, SHOW_PIN]);
    expect(result.fading).toBe(1);
    expect(result.opacity).toEqual([0, 0.5, 1]);
    await page.close();
  });

  test("an author's finished transform on the picture, a separate animation from its opacity, stays through the arrival", async () => {
    const page = await open();
    const result = await arrive(page, [HALF, SHOW_PIN]);
    expect(result.opacity).toEqual([0, 0.5, 1]);
    expect(result.transform).toBe("matrix(0.5, 0, 0, 0.5, 0, 0)");
    expect(result.width).toBe(100);
    expect(result.held).toBe(1);
    await page.close();
  });

  test("an author's dim on a picture before its new show settles at the show's opacity, as the newer show already makes it", async () => {
    const page = await open();
    const result = await arrive(page, [DIM, SHOW_PIN]);
    expect(result.opacity).toEqual([0, 0.5, 1]);
    expect(result.held).toBe(0);
    await page.close();
  });

  test("an author's dim on an element no picture show reached stays through its arrival", async () => {
    const page = await open();
    const result = await arrive(page, [DIM]);
    expect(result.opacity).toEqual([0.5, 0.5, 0.5]);
    expect(result.held).toBe(1);
    await page.close();
  });

  test("an author's dim after the picture's show stays through the arrival", async () => {
    const page = await open();
    const result = await arrive(page, [SHOW_PIN, DIM]);
    expect(result.opacity).toEqual([0.5, 0.5, 0.5]);
    expect(result.held).toBe(1);
    await page.close();
  });

  test("an opacity animation still running under the picture's show leaves every animation as it was", async () => {
    const page = await open();
    const result = await arrive(page, [PULSE, SHOW_PIN]);
    expect(result.opacity).toEqual([1, 1, 1]);
    expect(result.held).toBe(2);
    await page.close();
  });

  test("a finished animation of opacity and another property under the picture's show leaves every animation as it was", async () => {
    const page = await open();
    const result = await arrive(page, [SHRINK_FADE, SHOW_PIN]);
    expect(result.opacity).toEqual([1, 1, 1]);
    expect(result.transform).toBe("matrix(0.5, 0, 0, 0.5, 0, 0)");
    expect(result.held).toBe(2);
    await page.close();
  });

  test("a leave keeps the picture's held animations", async () => {
    const page = await open();
    const result = await arrive(page, [FADE_IN, SHOW_PIN], "hide");
    expect(result.held).toBe(2);
    await page.close();
  });
});
