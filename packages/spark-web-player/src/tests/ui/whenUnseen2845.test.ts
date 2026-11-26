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

const PORTRAIT = `<div id="stage"><div id="portrait"><span id="image"><span id="picture">a</span></span></div></div>`;

const open = async (css = "", body = PORTRAIT): Promise<Page> => {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${body}</body></html>`);
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

const plateau = async (keyframes: Keyframe[], easing = "linear") => {
  const page = await open();
  try {
    return await page.evaluate(
      async ({ keyframes, easing }) => {
        const w = window as any;
        const portrait = document.getElementById("portrait")!;
        const picture = document.getElementById("picture")!;
        const fade = portrait.animate(keyframes, { duration: 6000, fill: "both", easing });
        fade.pause();
        fade.currentTime = 2000;
        let early = false;
        w.whenUnseen([picture], new Promise(() => {})).then(() => {
          early = true;
        });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return { early, opacity: getComputedStyle(portrait).opacity, fade: fade.playState };
      },
      { keyframes, easing },
    );
  } finally {
    await page.close();
  }
};

test("a picture whose fade has reached a zero it holds to the end is unseen before the fade ends (#2845)", async () => {
  const result = await plateau([
    { opacity: "1", offset: 0 },
    { opacity: "0", offset: 0.25 },
    { opacity: "0", offset: 1 },
  ]);
  expect(result).toEqual({ early: true, opacity: "0", fade: "paused" });
});

test("a picture whose fade comes back from zero later is seen (#2845)", async () => {
  const result = await plateau([
    { opacity: "1", offset: 0 },
    { opacity: "0", offset: 0.25 },
    { opacity: "1", offset: 1 },
  ]);
  expect(result.early).toBe(false);
});

test("a picture whose fade eases back across its zero is seen (#2845)", async () => {
  const result = await plateau(
    [
      { opacity: "1", offset: 0 },
      { opacity: "0", offset: 0.25 },
      { opacity: "0", offset: 1 },
    ],
    "cubic-bezier(0.5, 1.5, 0.5, -1.5)",
  );
  expect(result.early).toBe(false);
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

interface Scenario {
  early: boolean;
  seen: boolean;
  settled: boolean;
  seenAtEnd: boolean;
}

const scenario = async (setup: string, css = ""): Promise<Scenario> => {
  const page = await open(css);
  try {
    return await page.evaluate(async (setup) => {
      const w = window as any;
      const stage = document.getElementById("stage")!;
      const portrait = document.getElementById("portrait")!;
      const picture = document.getElementById("picture")!;
      const animations: Animation[] = new Function("stage", "portrait", "picture", setup)(stage, portrait, picture);
      const seen = () => {
        let opacity = 1;
        for (let at: Element | null = picture; at; at = at.parentElement) {
          const style = getComputedStyle(at);
          if (style.display !== "contents") {
            opacity *= Number(style.opacity);
          }
        }
        return opacity > 0 && getComputedStyle(picture).visibility === "visible" && picture.getClientRects().length > 0;
      };
      let answered = false;
      w.whenUnseen([picture], new Promise(() => {})).then(() => {
        answered = true;
      });
      const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await frames();
      const early = answered;
      const seenThen = seen();
      for (const animation of animations) {
        animation.finish();
      }
      await frames();
      return { early, seen: seenThen, settled: answered, seenAtEnd: seen() };
    }, setup);
  } finally {
    await page.close();
  }
};

const PLATEAU = `[{ opacity: "1", offset: 0 }, { opacity: "0", offset: 0.25 }, { opacity: "0", offset: 1 }]`;

const held = (target: string, keyframes: string, timing: string, at: number) =>
  `const a = ${target}.animate(${keyframes}, ${timing}); a.pause(); a.currentTime = ${at}; return [a];`;

test("a picture whose reversed fade sits at zero answers only when the fade ends (#2845)", async () => {
  const result = await scenario(
    held(
      "portrait",
      `[{ opacity: "0", offset: 0 }, { opacity: "0", offset: 0.75 }, { opacity: "1", offset: 1 }]`,
      `{ duration: 6000, fill: "both", direction: "reverse" }`,
      2000,
    ),
  );
  expect(result).toEqual({ early: false, seen: false, settled: true, seenAtEnd: false });
});

test("a picture whose reversed fade will rise again from its zero is never unseen (#2845)", async () => {
  const result = await scenario(held("portrait", PLATEAU, `{ duration: 6000, fill: "both", direction: "reverse" }`, 1200));
  expect(result).toEqual({ early: false, seen: false, settled: false, seenAtEnd: true });
});

test("a picture whose alternating fade will come back is never unseen (#2845)", async () => {
  const result = await scenario(
    held("portrait", PLATEAU, `{ duration: 3000, iterations: 2, direction: "alternate", fill: "both" }`, 2000),
  );
  expect(result).toEqual({ early: false, seen: false, settled: false, seenAtEnd: true });
});

test("a picture whose repeating fade will start again from full answers only when the last iteration ends (#2845)", async () => {
  const result = await scenario(held("portrait", PLATEAU, `{ duration: 3000, iterations: 2, fill: "both" }`, 2000));
  expect(result).toEqual({ early: false, seen: false, settled: true, seenAtEnd: false });
});

test("a picture whose fade is done but does not fill through its end delay is seen in that delay (#2845)", async () => {
  const result = await scenario(
    held("portrait", `[{ opacity: "1" }, { opacity: "0" }]`, `{ duration: 1000, endDelay: 5000, fill: "none" }`, 2000),
  );
  expect(result).toEqual({ early: false, seen: true, settled: false, seenAtEnd: true });
});

test("a picture whose fade fills through its end delay at zero is unseen in that delay (#2845)", async () => {
  const result = await scenario(
    held("portrait", `[{ opacity: "1" }, { opacity: "0" }]`, `{ duration: 1000, endDelay: 5000, fill: "forwards" }`, 2000),
  );
  expect(result).toEqual({ early: true, seen: false, settled: true, seenAtEnd: false });
});

test("a picture whose fade started early through a negative delay and will rise again is never unseen early (#2845)", async () => {
  const result = await scenario(
    held(
      "portrait",
      `[{ opacity: "0", offset: 0 }, { opacity: "0", offset: 0.5 }, { opacity: "1", offset: 1 }]`,
      `{ duration: 6000, delay: -2000, fill: "both" }`,
      0,
    ),
  );
  expect(result).toEqual({ early: false, seen: false, settled: false, seenAtEnd: true });
});

test("a picture whose fade started early through a negative delay and holds zero to its end is unseen (#2845)", async () => {
  const result = await scenario(held("portrait", PLATEAU, `{ duration: 6000, delay: -2000, fill: "both" }`, 0));
  expect(result).toEqual({ early: true, seen: false, settled: true, seenAtEnd: false });
});

test("a picture whose finished fade has a later animation waiting to lift it is unseen only once that animation is done (#2845)", async () => {
  const result = await scenario(`
    const out = portrait.animate([{ opacity: "0" }], { duration: 500, fill: "forwards" });
    out.finish();
    const back = portrait.animate([{ opacity: "1" }], { duration: 1000, delay: 3000, fill: "none" });
    back.pause();
    back.currentTime = 0;
    return [back];
  `);
  expect(result).toEqual({ early: false, seen: false, settled: true, seenAtEnd: false });
});

test("a picture whose ancestor has faded to zero is unseen even while the picture itself fades in (#2845)", async () => {
  const result = await scenario(`
    stage.animate([{ opacity: "0" }], { duration: 500, fill: "forwards" }).finish();
    const rise = picture.animate([{ opacity: "0" }, { opacity: "1" }], { duration: 6000, fill: "both" });
    rise.pause();
    rise.currentTime = 2000;
    return [rise];
  `);
  expect(result).toEqual({ early: true, seen: false, settled: true, seenAtEnd: false });
});

test("a picture whose ancestor is still fading is seen (#2845)", async () => {
  const result = await scenario(held("stage", `[{ opacity: "0" }]`, `{ duration: 1000, fill: "forwards" }`, 500));
  expect(result).toEqual({ early: false, seen: true, settled: true, seenAtEnd: false });
});

test("a picture hidden by something other than opacity waits for its effects to end (#2845)", async () => {
  const result = await scenario(
    held("portrait", `[{ translate: "0px" }, { translate: "200px" }]`, `{ duration: 3000, fill: "both" }`, 1000),
    "#picture { visibility: hidden; }",
  );
  expect(result).toEqual({ early: false, seen: false, settled: false, seenAtEnd: false });
});

test("a picture whose ancestor held at zero generates no box is seen (#2845)", async () => {
  const result = await scenario(
    held("portrait", `[{ opacity: "0" }, { opacity: "0" }]`, `{ duration: 6000, fill: "forwards" }`, 1000),
    "#portrait { display: contents; }",
  );
  expect(result).toEqual({ early: false, seen: true, settled: false, seenAtEnd: true });
});

test("a picture whose ancestor held at zero will stop generating a box is never unseen (#2845)", async () => {
  const result = await scenario(
    held(
      "portrait",
      `[{ opacity: "0", display: "block" }, { opacity: "0", display: "contents" }]`,
      `{ duration: 6000, fill: "forwards" }`,
      1000,
    ),
  );
  expect(result).toEqual({ early: false, seen: false, settled: false, seenAtEnd: true });
});

test("a picture displayed as none waits for its effects to end (#2845)", async () => {
  const result = await scenario(
    held("portrait", `[{ translate: "0px" }, { translate: "200px" }]`, `{ duration: 3000, fill: "both" }`, 1000),
    "#image { display: none; }",
  );
  expect(result).toEqual({ early: false, seen: false, settled: false, seenAtEnd: false });
});

interface Shown {
  early: boolean;
  seen: boolean;
}

const shown = async (body: string, setup: string, css = "", gesture = false): Promise<Shown> => {
  const page = await open(css, body);
  try {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (gesture) {
      await page.click("#go");
    }
    return await page.evaluate(async (setup) => {
      const w = window as any;
      const watched = (await new Function("document", setup)(document)) as { watch: Element[]; after?: () => void };
      const inTopLayer = (el: Element) =>
        [":popover-open", ":modal", ":fullscreen"].some((selector) => {
          try {
            return el.matches(selector);
          } catch {
            return false;
          }
        });
      const seen = (el: Element) => {
        let opacity = 1;
        let at: Element | null = el;
        while (at) {
          const style = at.ownerDocument.defaultView!.getComputedStyle(at);
          if (style.display !== "contents") {
            opacity *= Number(style.opacity);
          }
          if (inTopLayer(at)) {
            break;
          }
          at = at.parentElement ?? (at.ownerDocument.defaultView!.frameElement as Element | null);
        }
        const style = el.ownerDocument.defaultView!.getComputedStyle(el);
        return opacity > 0 && style.visibility === "visible" && el.getClientRects().length > 0;
      };
      let answered = false;
      w.whenUnseen(watched.watch, new Promise(() => {})).then(() => {
        answered = true;
      });
      watched.after?.();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { early: answered, seen: watched.watch.some(seen) };
    }, setup);
  } finally {
    await page.close();
  }
};

const FADED = `document.getElementById("portrait").animate([{ opacity: "0" }], { duration: 500, fill: "forwards" }).finish();`;

const TOP_LAYER = (picture: string) =>
  `<div id="portrait"><span id="image">${picture}</span></div><button id="go" onclick="document.getElementById('picture').requestFullscreen()">go</button>`;

test("a picture shown in the top layer as a popover is seen through its faded ancestor (#2845)", async () => {
  const result = await shown(
    TOP_LAYER(`<span id="picture" popover="manual">a</span>`),
    `document.getElementById("picture").showPopover(); ${FADED} return { watch: [document.getElementById("picture")] };`,
  );
  expect(result).toEqual({ early: false, seen: true });
});

test("a picture shown in the top layer as a modal dialog is seen through its faded ancestor (#2845)", async () => {
  const result = await shown(
    TOP_LAYER(`<dialog id="picture">a</dialog>`),
    `document.getElementById("picture").showModal(); ${FADED} return { watch: [document.getElementById("picture")] };`,
  );
  expect(result).toEqual({ early: false, seen: true });
});

test("a picture shown in the top layer as the fullscreen element is seen through its faded ancestor (#2845)", async () => {
  const result = await shown(
    TOP_LAYER(`<span id="picture">a</span>`),
    `return new Promise((resolve) => {
      const wait = () => {
        if (document.fullscreenElement) {
          ${FADED}
          resolve({ watch: [document.getElementById("picture")] });
        } else {
          requestAnimationFrame(wait);
        }
      };
      wait();
    });`,
    "",
    true,
  );
  expect(result).toEqual({ early: false, seen: true });
});

test("a picture whose faded ancestor is overridden in the same frame is seen (#2845)", async () => {
  const result = await shown(
    PORTRAIT,
    `const fade = document.getElementById("portrait").animate([{ opacity: "0" }], { duration: 500, fill: "forwards" });
    fade.pause();
    return {
      watch: [document.getElementById("picture")],
      after: () => {
        fade.finish();
        document.getElementById("portrait").style.setProperty("opacity", "1", "important");
      },
    };`,
  );
  expect(result).toEqual({ early: false, seen: true });
});

test("a picture whose faded ancestor a later stylesheet rule overrides is seen (#2845)", async () => {
  const result = await shown(
    PORTRAIT,
    `const fade = document.getElementById("portrait").animate([{ opacity: "0" }], { duration: 500, fill: "forwards" });
    fade.pause();
    return {
      watch: [document.getElementById("picture")],
      after: () => {
        fade.finish();
        const rule = document.createElement("style");
        rule.textContent = "#portrait { opacity: 1 !important; }";
        document.head.append(rule);
      },
    };`,
  );
  expect(result).toEqual({ early: false, seen: true });
});

test("a picture whose ancestor fades back in through a transition under a held fade stays unseen (#2845)", async () => {
  const result = await shown(
    PORTRAIT,
    `const portrait = document.getElementById("portrait");
    portrait.style.opacity = "0";
    portrait.getBoundingClientRect();
    portrait.style.opacity = "1";
    ${FADED}
    return { watch: [document.getElementById("picture")] };`,
    "#portrait { transition: opacity 5s linear; }",
  );
  expect(result.seen).toBe(false);
  expect(result.early && result.seen).toBe(false);
});

test("a picture whose frame outside the game's document fades is never answered for that fade (#2845)", async () => {
  const result = await shown(
    `<iframe id="frame" srcdoc="${PORTRAIT.replace(/"/g, "&quot;")}"></iframe>`,
    `const frame = document.getElementById("frame");
    return new Promise((resolve) => {
      const ready = () => {
        const picture = frame.contentDocument && frame.contentDocument.getElementById("picture");
        if (!picture) {
          requestAnimationFrame(ready);
          return;
        }
        frame.animate([{ opacity: "0" }], { duration: 500, fill: "forwards" }).finish();
        resolve({ watch: [picture] });
      };
      ready();
    });`,
  );
  expect(result).toEqual({ early: false, seen: false });
});

const SVG = (group: string) =>
  `<div id="portrait"><svg width="100" height="100"><g id="group" ${group}><rect id="picture" width="50" height="50" fill="red"/></g></svg></div>`;

test("an SVG picture whose group is hidden only by the opacity attribute waits for its effects (#2845)", async () => {
  const result = await shown(SVG(`opacity="0"`), `return { watch: [document.getElementById("picture")] };`);
  expect(result).toEqual({ early: false, seen: false });
});

test("an SVG picture whose group is held at zero over its opacity attribute is unseen (#2845)", async () => {
  const result = await shown(
    SVG(`opacity="1"`),
    `document.getElementById("group").animate([{ opacity: "0" }], { duration: 500, fill: "forwards" }).finish();
    return { watch: [document.getElementById("picture")] };`,
  );
  expect(result).toEqual({ early: true, seen: false });
});

test("an SVG picture whose held group an important style shows is seen (#2845)", async () => {
  const result = await shown(
    SVG(`opacity="1"`),
    `document.getElementById("group").animate([{ opacity: "0" }], { duration: 500, fill: "forwards" }).finish();
    return { watch: [document.getElementById("picture")] };`,
    "#group { opacity: 1 !important; }",
  );
  expect(result).toEqual({ early: false, seen: true });
});

const CANVASES = `<div id="portrait"><span id="image"><span id="picture"></span><span id="other"></span></span></div>`;

const DRAWN = `const draw = (host) => {
    const root = host.attachShadow({ mode: "open" });
    const canvas = document.createElement("canvas");
    canvas.width = 50;
    canvas.height = 50;
    canvas.getContext("2d").fillRect(0, 0, 50, 50);
    root.append(canvas);
  };
  draw(document.getElementById("picture"));
  draw(document.getElementById("other"));`;

test("a picture drawn on a canvas inside an element held at zero is unseen (#2845)", async () => {
  const result = await shown(CANVASES, `${DRAWN} ${FADED} return { watch: [document.getElementById("picture")] };`);
  expect(result).toEqual({ early: true, seen: false });
});

test("a picture drawn on a held canvas while another element of the picture still shows it is seen (#2845)", async () => {
  const result = await shown(
    CANVASES,
    `${DRAWN}
    document.getElementById("picture").animate([{ opacity: "0" }], { duration: 500, fill: "forwards" }).finish();
    return { watch: [document.getElementById("picture"), document.getElementById("other")] };`,
  );
  expect(result).toEqual({ early: false, seen: true });
});
