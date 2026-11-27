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
.portrait.faint { opacity: 0.6; }
.portrait.third { opacity: 0.3; }
.portrait.still { transition: none; }
.portrait.still::before { content: ""; display: block; width: 20px; height: 20px; background: blue; opacity: 1; transition: opacity 1000ms linear; }
.portrait.still[data-presence="initial"]::before { opacity: 0; }
.portrait[data-presence="initial"] { opacity: 0; }
.portrait[data-presence="hide"] { opacity: 0; }
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

interface Arrival {
  presence?: "show" | "hide";
  className?: string;
  reduced?: boolean;
  then?: "show" | "hide";
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
const SHOW_HALF: Held = { ...HALF, show: true };
const SHOW_DIM: Held = { ...DIM, show: true };
const SHOW_THIRD: Held = { keyframes: [{ opacity: "0.3" }], duration: 0, show: true };

const arrive = (page: Page, held: Held[], arrival: Arrival = {}) =>
  page.evaluate(
    async ({ held, arrival }) => {
      const { presence = "show", className, reduced = false, then } = arrival;
      const el = document.getElementById("portrait")!;
      if (className) {
        el.classList.add(...className.split(" "));
      }
      const hold = { add: () => new Promise(() => {}) };
      const player = new (window as any).PresencePlayer(hold, () => reduced);
      for (const { keyframes, duration, show, running } of held) {
        const animation = el.animate(keyframes, { duration, fill: "both" });
        if (!running) {
          animation.finish();
        }
        if (show) {
          player.shows?.([animation]);
        }
      }
      const fadesNow = () =>
        document
          .getAnimations()
          .filter((animation: any) => animation.transitionProperty === "opacity");
      const heldNow = () =>
        el.getAnimations().filter((animation) => !("transitionProperty" in animation)).length;
      el.setAttribute("data-presence", presence === "show" ? "initial" : "show");
      void getComputedStyle(el).opacity;
      void player.play(el, presence);
      if (then) {
        for (const fade of fadesNow()) {
          fade.currentTime = 500;
        }
        if (then === "show") {
          el.setAttribute("data-presence", "initial");
          void getComputedStyle(el).opacity;
        }
        void player.play(el, then);
      }
      const fades = fadesNow();
      const opacityAt = (time: number) => {
        for (const fade of fades) {
          fade.pause();
          fade.currentTime = time;
        }
        return Number(getComputedStyle(el).opacity);
      };
      const sampled = {
        fading: fades.length,
        opacity: [0, 500, 1000].map(opacityAt),
        transform: getComputedStyle(el).transform,
        width: el.getBoundingClientRect().width,
        held: heldNow(),
      };
      player.settle(el);
      for (const animation of document.getAnimations()) {
        if ("transitionProperty" in animation) {
          animation.finish();
        }
      }
      return {
        ...sampled,
        settled: { opacity: Number(getComputedStyle(el).opacity), held: heldNow() },
      };
    },
    { held, arrival },
  );

describe("an arriving picture takes its @initial look and fades to its settled look (#2746)", () => {
  test("a picture returning with the built-in show it holds fades in from @initial", async () => {
    const page = await open();
    const result = await arrive(page, [SHOW_PIN]);
    expect(result.fading).toBe(1);
    expect(result.opacity).toEqual([0, 0.5, 1]);
    expect(result.settled).toEqual({ opacity: 1, held: 1 });
    await page.close();
  });

  test("a picture whose layer finished a timed fade-in, with offsets and an easing, still fades in from @initial when it returns", async () => {
    const page = await open();
    const result = await arrive(page, [FADE_IN, SHOW_PIN]);
    expect(result.fading).toBe(1);
    expect(result.opacity).toEqual([0, 0.5, 1]);
    expect(result.settled).toEqual({ opacity: 1, held: 2 });
    await page.close();
  });

  test("an author's finished transform on the picture, a separate animation from its opacity, stays through the arrival", async () => {
    const page = await open();
    const result = await arrive(page, [HALF, SHOW_PIN]);
    expect(result.opacity).toEqual([0, 0.5, 1]);
    expect(result.transform).toBe("matrix(0.5, 0, 0, 0.5, 0, 0)");
    expect(result.width).toBe(100);
    expect(result.held).toBe(1);
    expect(result.settled).toEqual({ opacity: 1, held: 2 });
    await page.close();
  });

  test("an author's dim on a picture before its new show settles at the show's opacity, as the newer show already makes it", async () => {
    const page = await open();
    const result = await arrive(page, [DIM, SHOW_PIN]);
    expect(result.opacity).toEqual([0, 0.5, 1]);
    expect(result.held).toBe(0);
    expect(result.settled).toEqual({ opacity: 1, held: 2 });
    await page.close();
  });

  test("an author's dim on an element no picture show reached stays through its arrival", async () => {
    const page = await open();
    const result = await arrive(page, [DIM]);
    expect(result.opacity).toEqual([0.5, 0.5, 0.5]);
    expect(result.held).toBe(1);
    expect(result.settled).toEqual({ opacity: 0.5, held: 1 });
    await page.close();
  });

  test("an author's dim after the picture's show stays through the arrival", async () => {
    const page = await open();
    const result = await arrive(page, [SHOW_PIN, DIM]);
    expect(result.opacity).toEqual([0.5, 0.5, 0.5]);
    expect(result.held).toBe(2);
    expect(result.settled).toEqual({ opacity: 0.5, held: 2 });
    await page.close();
  });

  test("an author's dim under a show that sets only a transform stays through the arrival", async () => {
    const page = await open();
    const result = await arrive(page, [DIM, SHOW_HALF]);
    expect(result.opacity).toEqual([0.5, 0.5, 0.5]);
    expect(result.transform).toBe("matrix(0.5, 0, 0, 0.5, 0, 0)");
    expect(result.held).toBe(2);
    expect(result.settled).toEqual({ opacity: 0.5, held: 2 });
    await page.close();
  });

  test("a show that dims the picture keeps its dim through the arrival", async () => {
    const page = await open();
    const result = await arrive(page, [SHOW_DIM]);
    expect(result.opacity).toEqual([0.5, 0.5, 0.5]);
    expect(result.held).toBe(1);
    expect(result.settled).toEqual({ opacity: 0.5, held: 1 });
    await page.close();
  });

  test("a picture whose style settles at another opacity than its show keeps the show's opacity through the arrival", async () => {
    const page = await open();
    const result = await arrive(page, [SHOW_PIN], { className: "faint" });
    expect(result.opacity).toEqual([1, 1, 1]);
    expect(result.held).toBe(1);
    expect(result.settled).toEqual({ opacity: 1, held: 1 });
    await page.close();
  });

  test("a picture whose style and show agree on an opacity below 1 fades in to it", async () => {
    const page = await open();
    const result = await arrive(page, [SHOW_THIRD], { className: "third" });
    expect(result.opacity).toEqual([0, 0.15, 0.3]);
    expect(result.settled).toEqual({ opacity: 0.3, held: 1 });
    await page.close();
  });

  test("an opacity fade on the picture's ::before does not stand in for the picture's own settled opacity", async () => {
    const page = await open();
    const result = await arrive(page, [SHOW_PIN], { className: "faint still" });
    expect(result.opacity).toEqual([1, 1, 1]);
    expect(result.settled).toEqual({ opacity: 1, held: 1 });
    await page.close();
  });

  test("an opacity animation still running under the picture's show leaves every animation as it was", async () => {
    const page = await open();
    const result = await arrive(page, [PULSE, SHOW_PIN]);
    expect(result.opacity).toEqual([1, 1, 1]);
    expect(result.held).toBe(2);
    expect(result.settled).toEqual({ opacity: 1, held: 2 });
    await page.close();
  });

  test("a finished animation of opacity and another property under the picture's show leaves every animation as it was", async () => {
    const page = await open();
    const result = await arrive(page, [SHRINK_FADE, SHOW_PIN]);
    expect(result.opacity).toEqual([1, 1, 1]);
    expect(result.transform).toBe("matrix(0.5, 0, 0, 0.5, 0, 0)");
    expect(result.held).toBe(2);
    expect(result.settled).toEqual({ opacity: 1, held: 2 });
    await page.close();
  });

  test("a leave keeps the picture's held animations", async () => {
    const page = await open();
    const result = await arrive(page, [FADE_IN, SHOW_PIN], { presence: "hide" });
    expect(result.held).toBe(2);
    expect(result.settled).toEqual({ opacity: 1, held: 2 });
    await page.close();
  });

  test("a hide halfway through the arrival's fade finds the picture's show held again, as it is when the picture never faded", async () => {
    const page = await open();
    const result = await arrive(page, [SHOW_PIN], { then: "hide" });
    expect(result.opacity).toEqual([1, 1, 1]);
    expect(result.settled).toEqual({ opacity: 1, held: 1 });
    await page.close();
  });

  test("once the arrival's fade has ended by itself, a hide finds the picture's show held again", async () => {
    const page = await open();
    const result = await page.evaluate(async () => {
      const el = document.getElementById("portrait")!;
      const hold = { add: (animation: Animation) => animation.finished };
      const player = new (window as any).PresencePlayer(hold, () => false);
      const animation = el.animate([{ opacity: "1" }], { duration: 0, fill: "both" });
      animation.finish();
      player.shows?.([animation]);
      el.setAttribute("data-presence", "initial");
      void getComputedStyle(el).opacity;
      const arrived = player.play(el, "show");
      const fading = document.getAnimations().filter((a: any) => a.transitionProperty === "opacity").length;
      for (const fade of document.getAnimations()) {
        fade.finish();
      }
      await arrived;
      const held = el.getAnimations().length;
      el.setAttribute("data-presence", "hide");
      void getComputedStyle(el).opacity;
      for (const fade of document.getAnimations()) {
        if ("transitionProperty" in fade) {
          fade.finish();
        }
      }
      const hidden = Number(getComputedStyle(el).opacity);
      return { fading, held, hidden };
    });
    expect(result).toEqual({ fading: 1, held: 1, hidden: 1 });
    await page.close();
  });

  test("a show written during the arrival's fade stays above the picture's earlier show once the fade ends", async () => {
    const page = await open();
    const result = await page.evaluate(async () => {
      const el = document.getElementById("portrait")!;
      const hold = { add: () => new Promise(() => {}) };
      const player = new (window as any).PresencePlayer(hold, () => false);
      const earlier = el.animate([{ opacity: "1" }], { duration: 0, fill: "both" });
      earlier.finish();
      player.shows?.([earlier]);
      el.setAttribute("data-presence", "initial");
      void getComputedStyle(el).opacity;
      void player.play(el, "show");
      const later = el.animate([{ opacity: "0.5" }], { duration: 0, fill: "both" });
      later.finish();
      player.shows?.([later]);
      player.settle(el);
      for (const animation of document.getAnimations()) {
        if ("transitionProperty" in animation) {
          animation.finish();
        }
      }
      const held = el.getAnimations();
      return {
        opacity: Number(getComputedStyle(el).opacity),
        order: held.map((animation) => (animation === earlier ? "earlier" : animation === later ? "later" : "other")),
      };
    });
    expect(result).toEqual({ opacity: 0.5, order: ["earlier", "later"] });
    await page.close();
  });

  const waiting = (page: Page, shows: Held[], order: "show first" | "initial first" | "started while waiting", before: Held[] = []) =>
    page.evaluate(
      async ({ shows, order, before }) => {
        const el = document.getElementById("portrait")!;
        const hold = { add: () => new Promise(() => {}) };
        const player = new (window as any).PresencePlayer(hold, () => false);
        for (const held of before) {
          const animation = el.animate(held.keyframes, { duration: held.duration, fill: "both" });
          animation.finish();
          if (held.show) {
            player.shows?.([animation]);
          }
        }
        const write = () => {
          for (const show of shows) {
            const animation = el.animate(show.keyframes, { duration: show.duration, fill: "both" });
            animation.finish();
            player.shows?.([animation]);
          }
        };
        const writeIdle = () => {
          const animations = shows.map(
            (show) => new Animation(new KeyframeEffect(el, show.keyframes, { duration: show.duration, fill: "both" })),
          );
          player.shows?.(animations);
          return animations;
        };
        const enter = () => {
          player.change(el, "initial");
          el.setAttribute("data-presence", "initial");
        };
        if (order === "show first") {
          write();
          enter();
        } else if (order === "initial first") {
          enter();
          write();
        } else {
          enter();
          const idle = writeIdle();
          await Promise.resolve();
          for (const animation of idle) {
            animation.play();
            animation.finish();
          }
        }
        await Promise.resolve();
        const waitingOpacity = Number(getComputedStyle(el).opacity);
        void player.play(el, "show");
        const fades = document.getAnimations().filter((a: any) => a.transitionProperty === "opacity");
        for (const fade of fades) {
          fade.pause();
          fade.currentTime = 500;
        }
        const halfway = Number(getComputedStyle(el).opacity);
        player.settle(el);
        for (const fade of fades) {
          fade.finish();
        }
        return {
          waiting: waitingOpacity,
          halfway,
          settled: { opacity: Number(getComputedStyle(el).opacity), held: el.getAnimations().filter((a) => !("transitionProperty" in a)).length },
        };
      },
      { shows, order, before },
    );

  test("a show written while the picture waits in its initial look leaves it at that look until it arrives", async () => {
    const page = await open();
    const result = await waiting(page, [SHOW_PIN], "initial first");
    expect(result).toEqual({ waiting: 0, halfway: 0.5, settled: { opacity: 1, held: 1 } });
    await page.close();
  });

  test("a picture that takes its initial look while holding its show waits at that look until it arrives", async () => {
    const page = await open();
    const result = await waiting(page, [SHOW_PIN], "show first");
    expect(result).toEqual({ waiting: 0, halfway: 0.5, settled: { opacity: 1, held: 1 } });
    await page.close();
  });

  test("a show that starts playing while the picture waits in its initial look leaves it at that look until it arrives", async () => {
    const page = await open();
    const result = await waiting(page, [SHOW_PIN], "started while waiting");
    expect(result).toEqual({ waiting: 0, halfway: 0.5, settled: { opacity: 1, held: 1 } });
    await page.close();
  });

  test("a dimming show written while the picture waits keeps the dim through the wait and the arrival", async () => {
    const page = await open();
    const result = await waiting(page, [SHOW_DIM], "initial first");
    expect(result).toEqual({ waiting: 0.5, halfway: 0.5, settled: { opacity: 0.5, held: 1 } });
    await page.close();
  });

  test("a dimming show that starts playing while the picture waits keeps the dim through the wait and the arrival", async () => {
    const page = await open();
    const result = await waiting(page, [SHOW_DIM], "started while waiting");
    expect(result).toEqual({ waiting: 0.5, halfway: 0.5, settled: { opacity: 0.5, held: 1 } });
    await page.close();
  });

  test("a picture that waits holding a dimming show keeps the dim through the wait", async () => {
    const page = await open();
    const result = await waiting(page, [], "show first", [SHOW_DIM]);
    expect(result).toEqual({ waiting: 0.5, halfway: 0.5, settled: { opacity: 0.5, held: 1 } });
    await page.close();
  });

  test("a picture that waits holding a dimming show and then starts a new show fades in to the new show's opacity", async () => {
    const page = await open();
    const result = await waiting(page, [SHOW_PIN], "started while waiting", [SHOW_DIM]);
    expect(result).toEqual({ waiting: 0, halfway: 0.5, settled: { opacity: 1, held: 2 } });
    await page.close();
  });

  test("a second arrival halfway through the first's fade fades in again and settles with the show held", async () => {
    const page = await open();
    const result = await arrive(page, [SHOW_PIN], { then: "show" });
    expect(result.settled).toEqual({ opacity: 1, held: 1 });
    await page.close();
  });

  test("a second arrival halfway through a dimming show's arrival keeps the dim", async () => {
    const page = await open();
    const result = await arrive(page, [SHOW_DIM], { then: "show" });
    expect(result.opacity).toEqual([0.5, 0.5, 0.5]);
    expect(result.settled).toEqual({ opacity: 0.5, held: 1 });
    await page.close();
  });

  test("with reduced motion a picture still fades in, since a fade does not move it", async () => {
    const page = await open();
    const result = await arrive(page, [SHOW_PIN], { reduced: true });
    expect(result.opacity).toEqual([0, 0.5, 1]);
    expect(result.settled).toEqual({ opacity: 1, held: 1 });
    await page.close();
  });

  test("with reduced motion a dimming show keeps its dim", async () => {
    const page = await open();
    const result = await arrive(page, [SHOW_DIM], { reduced: true });
    expect(result.opacity).toEqual([0.5, 0.5, 0.5]);
    expect(result.settled).toEqual({ opacity: 0.5, held: 1 });
    await page.close();
  });
});
