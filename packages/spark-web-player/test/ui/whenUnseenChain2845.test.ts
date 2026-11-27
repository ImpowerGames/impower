// @vitest-environment node
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { compile } from "./domTestHarness";

let browser: Browser;
let script: string;

beforeAll(async () => {
  const bundle = await build({
    stdin: {
      contents:
        'import AnimationPlayer from "./packages/spark-dom/src/classes/AnimationPlayer.ts"; import { whenUnseen } from "./packages/spark-dom/src/utils/whenUnseen.ts"; window.AnimationPlayer = AnimationPlayer; window.whenUnseen = whenUnseen;',
      resolveDir: resolve("../.."),
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
  });
  script = bundle.outputFiles[0]!.text;
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

const PAGE = `<div id="stage"><div id="portrait"><span id="image"><span id="picture"><span id="ink" style="display:inline-block;width:100px;height:100px;background:red"></span></span></span></div></div>`;

const open = async (css = ""): Promise<Page> => {
  const page = await browser.newPage({ viewport: { width: 400, height: 200 } });
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${PAGE}</body></html>`);
  await page.addScriptTag({ content: script });
  return page;
};

interface Moment {
  answered: boolean;
  seen: boolean;
}

const SEEN = `(() => {
  const ink = document.getElementById("ink");
  let opacity = 1;
  for (let at = ink; at; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (style.display !== "contents") {
      opacity *= Number(style.opacity);
    }
  }
  return opacity > 0 && ink.getClientRects().length > 0;
})()`;

const authored = (display: string) => {
  const program = compile(`animation unbox {
  keyframes {
    from { opacity = "0"; display = "block" }
    to { opacity = "0"; display = "${display}" }
  }
  timing { duration = "6s"; fill = "both"; easing = "linear" }
}
scene start
  [[hide portrait with unbox]] Gone.
end
`);
  return (program.context as any).animation.unbox;
};

const playAuthored = async (animation: unknown, css = ""): Promise<Moment[]> => {
  const page = await open(css);
  try {
    return await page.evaluate(
      async ({ animation, seenSource }) => {
        const w = window as any;
        const portrait = document.getElementById("portrait")!;
        const picture = document.getElementById("picture")!;
        const player = new w.AnimationPlayer(new Set());
        const [played] = player.add({ element: portrait, animations: [animation] });
        void player.play();
        played.pause();
        let answered = false;
        w.whenUnseen([{ element: picture, target: portrait }], new Promise(() => {})).then(() => {
          answered = true;
        });
        const tick = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const moments = [];
        for (const time of [1000, 4500, 6000]) {
          played.currentTime = time;
          await tick();
          moments.push({ answered, seen: new Function(`return ${seenSource}`)() });
        }
        return moments;
      },
      { animation, seenSource: SEEN },
    );
  } finally {
    await page.close();
  }
};

describe("an authored hide whose display the classifier cannot resolve (#2845)", () => {
  test("a hide animating display to an unresolved variable is never answered while the picture shows", async () => {
    const animation = authored("var(--missing, contents)");
    expect(animation.keyframes[1].display).toBe("var(--missing, contents)");
    const moments = await playAuthored(animation);
    expect(moments.map((moment) => moment.answered)).toEqual([false, false, false]);
    expect(moments.some((moment) => moment.seen)).toBe(true);
  });

  test("a hide animating a custom property that feeds display is never answered while the picture shows", async () => {
    const program = compile(`style portrait { display = "var(--box, block)" }
animation unbox {
  keyframes {
    from { opacity = "0"; __box = "block" }
    to { opacity = "0"; __box = "contents" }
  }
  timing { duration = "6s"; fill = "both"; easing = "linear" }
}
scene start
  [[hide portrait with unbox]] Gone.
end
`);
    const animation = (program.context as any).animation.unbox;
    expect(Object.keys(animation.keyframes[1])).toContain("__box");
    const moments = await playAuthored(animation, "#portrait { display: var(--box, block); }");
    expect(moments.map((moment) => moment.answered)).toEqual([false, false, false]);
    expect(moments.some((moment) => moment.seen)).toBe(true);
  });

  test("a hide animating display to inherit under a parent without a box is never answered while the picture shows", async () => {
    const animation = authored("inherit");
    expect(animation.keyframes[1].display).toBe("inherit");
    const moments = await playAuthored(animation, "#stage { display: contents; }");
    expect(moments.map((moment) => moment.answered)).toEqual([false, false, false]);
    expect(moments.some((moment) => moment.seen)).toBe(true);
  });
});

const PLACES = { picture: "picture", target: "portrait", above: "stage" } as const;

const DISPLAYS = {
  untouched: { from: undefined, to: undefined },
  constant: { from: "block", to: "block" },
  variable: { from: "block", to: "var(--missing, contents)" },
  inherit: { from: "block", to: "inherit" },
  contents: { from: "block", to: "contents" },
  transition: { from: undefined, to: undefined },
  custom: { from: undefined, to: undefined },
} as const;

const cross = async (place: string, display: keyof typeof DISPLAYS): Promise<Moment[]> => {
  const page = await open(display === "inherit" ? "#stage, #portrait, #image { display: contents; }" : "");
  try {
    return await page.evaluate(
      async ({ place, display, frames, seenSource }) => {
        const w = window as any;
        const faded = document.getElementById(place)!;
        const picture = document.getElementById("picture")!;
        const portrait = document.getElementById("portrait")!;
        const keyframes: Keyframe[] =
          display === "custom"
            ? [
                { opacity: "0", "--box": "block" },
                { opacity: "0", "--box": "contents" },
              ]
            : [
                frames.from ? { opacity: "0", display: frames.from } : { opacity: "0" },
                frames.to ? { opacity: "0", display: frames.to } : { opacity: "0" },
              ];
        if (display === "custom") {
          faded.style.display = "var(--box, block)";
        }
        const fade = faded.animate(keyframes, { duration: 6000, fill: "both" });
        fade.pause();
        fade.currentTime = 1000;
        if (display === "transition") {
          faded.style.transition = "display 6s allow-discrete";
          faded.getBoundingClientRect();
          faded.style.display = "contents";
        }
        let answered = false;
        w.whenUnseen([{ element: picture, target: portrait }], new Promise(() => {})).then(() => {
          answered = true;
        });
        const tick = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const moments = [];
        for (const time of [1000, 3500, 5000, 6000]) {
          for (const animation of document.getAnimations()) {
            animation.pause();
            animation.currentTime = time;
          }
          await tick();
          moments.push({ answered, seen: new Function(`return ${seenSource}`)() });
        }
        return moments;
      },
      { place, display, frames: DISPLAYS[display], seenSource: SEEN },
    );
  } finally {
    await page.close();
  }
};

describe("where the fade sits against what the exit does to display (#2845)", () => {
  for (const [placeName, place] of Object.entries(PLACES)) {
    for (const display of Object.keys(DISPLAYS) as (keyof typeof DISPLAYS)[]) {
      const early = placeName !== "above" && display === "untouched";
      test(`a fade on the ${placeName} with display ${display} ${early ? "answers at once" : "waits for its effects"}`, async () => {
        const moments = await cross(place, display);
        expect(moments[0]!.answered).toBe(early);
        for (const moment of moments) {
          expect(moment.answered && moment.seen).toBe(false);
        }
      });
    }
  }
});

test("the watch reads no element above the write's target (#2845)", async () => {
  const page = await open();
  try {
    const above = await page.evaluate(async () => {
      const w = window as any;
      const stage = document.getElementById("stage")!;
      const portrait = document.getElementById("portrait")!;
      const picture = document.getElementById("picture")!;
      stage.animate([{ opacity: "0" }], { duration: 500, fill: "forwards" }).finish();
      const read: Element[] = [];
      const record = (el: unknown) => {
        if (el instanceof Element) {
          read.push(el);
        }
      };
      const getAnimations = Element.prototype.getAnimations;
      const matches = Element.prototype.matches;
      const querySelectorAll = Element.prototype.querySelectorAll;
      const getComputedStyle = window.getComputedStyle;
      Element.prototype.getAnimations = function (this: Element, options?: GetAnimationsOptions) {
        record(this);
        return getAnimations.call(this, options);
      };
      Element.prototype.matches = function (this: Element, selector: string) {
        record(this);
        return matches.call(this, selector);
      };
      Element.prototype.querySelectorAll = function (this: Element, selector: string) {
        record(this);
        return querySelectorAll.call(this, selector);
      } as typeof querySelectorAll;
      window.getComputedStyle = (el: Element, pseudo?: string | null) => {
        record(el);
        return getComputedStyle(el, pseudo);
      };
      const tick = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      let answered = false;
      w.whenUnseen([{ element: picture, target: portrait }], new Promise(() => {})).then(() => {
        answered = true;
      });
      await tick();
      portrait.animate([{ opacity: "0" }], { duration: 500, fill: "forwards" }).finish();
      await tick();
      Element.prototype.getAnimations = getAnimations;
      Element.prototype.matches = matches;
      Element.prototype.querySelectorAll = querySelectorAll;
      window.getComputedStyle = getComputedStyle;
      return {
        answered,
        readCount: read.length,
        above: [...new Set(read.filter((el) => el !== portrait && el.contains(portrait)).map((el) => el.tagName + "#" + el.id))],
      };
    });
    expect(above.answered).toBe(true);
    expect(above.readCount).toBeGreaterThan(0);
    expect(above.above).toEqual([]);
  } finally {
    await page.close();
  }
});

test("the watch reads nothing for a target that does not hold the picture and never answers for it (#2845)", async () => {
  const page = await open();
  try {
    const result = await page.evaluate(async () => {
      const w = window as any;
      const stage = document.getElementById("stage")!;
      const picture = document.getElementById("picture")!;
      const elsewhere = document.createElement("div");
      document.body.append(elsewhere);
      elsewhere.animate([{ opacity: "0" }], { duration: 500, fill: "forwards" }).finish();
      stage.animate([{ opacity: "0" }], { duration: 500, fill: "forwards" }).finish();
      const read: Element[] = [];
      const getAnimations = Element.prototype.getAnimations;
      const matches = Element.prototype.matches;
      Element.prototype.getAnimations = function (this: Element, options?: GetAnimationsOptions) {
        read.push(this);
        return getAnimations.call(this, options);
      };
      Element.prototype.matches = function (this: Element, selector: string) {
        read.push(this);
        return matches.call(this, selector);
      };
      let answered = false;
      w.whenUnseen([{ element: picture, target: elsewhere }], new Promise(() => {})).then(() => {
        answered = true;
      });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      Element.prototype.getAnimations = getAnimations;
      Element.prototype.matches = matches;
      return { answered, read: [...new Set(read.map((el) => el.tagName + "#" + el.id))] };
    });
    expect(result).toEqual({ answered: false, read: [] });
  } finally {
    await page.close();
  }
});

describe("limits the game cannot produce today, since the player creates no closed shadow roots and no top-layer elements (#2845)", () => {
  const topLayerAfterFade = async (open: "closed-root" | "after-answer") => {
    const page = await browser.newPage({ viewport: { width: 400, height: 200 } });
    try {
      await page.setContent(`<!doctype html><html><body>${PAGE}</body></html>`);
      await page.addScriptTag({ content: script });
      return await page.evaluate(async (open) => {
        const w = window as any;
        const portrait = document.getElementById("portrait")!;
        const picture = document.getElementById("picture")!;
        const layer = document.createElement("span");
        layer.textContent = "shown";
        layer.setAttribute("popover", "manual");
        if (open === "closed-root") {
          picture.attachShadow({ mode: "closed" }).append(layer);
          layer.showPopover();
        } else {
          picture.append(layer);
        }
        portrait.animate([{ opacity: "0" }], { duration: 500, fill: "forwards" }).finish();
        let answered = false;
        w.whenUnseen([{ element: picture, target: portrait }], new Promise(() => {})).then(() => {
          answered = true;
        });
        const tick = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        await tick();
        if (open === "after-answer") {
          layer.showPopover();
          await tick();
        }
        return {
          answered,
          layerShown:
            layer.matches(":popover-open") && Number(getComputedStyle(layer).opacity) === 1 && layer.getClientRects().length > 0,
          targetOpacity: getComputedStyle(portrait).opacity,
        };
      }, open);
    } finally {
      await page.close();
    }
  };

  test("a popover inside a closed shadow root of the picture is answered while it shows", async () => {
    expect(await topLayerAfterFade("closed-root")).toEqual({ answered: true, layerShown: true, targetOpacity: "0" });
  });

  test("an element that enters the top layer after the answer shows after the picture was answered", async () => {
    expect(await topLayerAfterFade("after-answer")).toEqual({ answered: true, layerShown: true, targetOpacity: "0" });
  });
});
