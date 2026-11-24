import { describe, expect, test, vi } from "vitest";
import { createMorphHost, inlineMorphSource, type MorphHost } from "@impower/sparkdown/src/morph/hosts";
import { renderMorphAt } from "@impower/sparkdown/src/morph/render";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphArtifact } from "@impower/sparkdown/src/morph/types";
import { talkingPortrait } from "@impower/sparkdown/src/tests/morph/fixtures";
import { MorphPlayback, type PictureCanvasContext } from "../../app/morph/MorphPlayback";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const LIFT = `morph lift {
  blend = cut
  keyframes {
    from {
      lids {
        state = on
      }
    }
    50% {
      lids {
        state = on
      }
      face {
        translate = 10px 0
      }
      brows {
        translate = 0 8px
      }
    }
    to {
      lids {
        state = on
      }
    }
  }
  timing {
    duration = 2
    iterations = infinite
    easing = linear
  }
}
`;

const CHOMP = `morph chomp {
  blend = cut
  keyframes {
    from {
      mouth {
        state = open
      }
    }
    50% {
      mouth {
        state = closed
      }
    }
    to {
      mouth {
        state = open
      }
    }
  }
  timing {
    duration = 0.7
    iterations = infinite
    easing = linear
  }
}
`;

const source = (assets: string) => `${LIFT}
${CHOMP}
define kit as layered_image with
  assets = {
${assets}
  }
end

scene start
  HERO:
    [[show portrait kit]]
    First line.
end
`;

const COMPOSITED = source('    ["base"] = base_file,\n    ["brows"] = brows_file,\n    ["face"] = bunny,\n    ["lids.on"] = lids_file,');
const FALLBACK = source('    ["base"] = bunny,\n    ["brows"] = brows_file,\n    ["face"] = base_file,\n    ["lids.on"] = lids_file,');

const FILES = [
  { uri: "inmemory:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: talkingPortrait() },
  { uri: "inmemory:///base_file.png", type: "image", name: "base_file", ext: "png", src: "/src/base_file.png" },
  { uri: "inmemory:///brows_file.png", type: "image", name: "brows_file", ext: "png", src: "/src/brows_file.png" },
  { uri: "inmemory:///lids_file.png", type: "image", name: "lids_file", ext: "png", src: "/src/lids_file.png" },
];

const POSE = { matrix: [1, 0, 0, 1, 0, 8] as [number, number, number, number, number, number], opacity: 0.5 };

function leafStates(root: ParentNode): Record<string, boolean[]> {
  const out: Record<string, boolean[]> = {};
  for (const el of Array.from(root.querySelectorAll("[data-morph]"))) {
    (out[el.getAttribute("data-morph")!] ??= []).push(!/display:\s*none/.test(el.getAttribute("style") ?? ""));
  }
  return out;
}

const referenceStates = (artifact: MorphArtifact, offset: Record<string, number>) =>
  leafStates(new DOMParser().parseFromString(renderMorphAt(artifact, offset), "image/svg+xml"));

const chompAt = (seconds: number) => ({ chomp: (seconds % 0.7) / 0.7 });

function inProcessHost(program: () => any): MorphHost {
  return createMorphHost({
    service: new MorphBakeService(),
    channel: () => program().morphs,
    readSource: inlineMorphSource(() => program().context),
  });
}

interface Painted {
  src: string;
  alpha: number;
  transform: number[];
}

function recordingCanvases() {
  const canvases = new Map<HTMLCanvasElement, { frames: Painted[][] }>();
  const factory = (element: HTMLCanvasElement) => {
    const record = { frames: [] as Painted[][] };
    canvases.set(element, record);
    let transform = [1, 0, 0, 1, 0, 0];
    const context: PictureCanvasContext = {
      globalAlpha: 1,
      imageSmoothingEnabled: true,
      setTransform: (...values) => {
        transform = values;
      },
      clearRect: () => {
        record.frames.push([]);
      },
      drawImage(image) {
        record.frames.at(-1)!.push({ src: (image as unknown as { src: string }).src, alpha: context.globalAlpha, transform });
      },
    };
    return context;
  };
  return { canvases, factory };
}

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

async function shown(text: string, widthOf: (src: string) => number, withCanvas: boolean) {
  const writes: any[] = [];
  const h = createDOMHarness(text, 0, {
    files: FILES,
    afterEachMessage: (message) => {
      const ops = message?.method === "ui/batch" ? message.params.messages : [message];
      for (const op of ops) if (op?.method === "ui/write-image") writes.push(op);
    },
  });
  const host = inProcessHost(() => h.game.program);
  const canvas = recordingCanvases();
  const effects: { keyframes: Keyframe[]; samples: number[] }[] = [];
  const playback = MorphPlayback.for(h.overlay);
  playback.configure({
    host,
    seed: "test",
    requestFrame: () => 0,
    cancelFrame: () => {},
    pictureCanvas: canvas.factory,
    loadPicture: async (src) => ({ image: { src } as never, width: widthOf(src), height: 140 }),
    animate: (_element, keyframes) => {
      const effect = { keyframes, samples: [] as number[] };
      effects.push(effect);
      return { sample: (offset) => effect.samples.push(offset), cancel: () => {} };
    },
    readPose: () => POSE,
  });
  await h.ready;
  await h.preview(text.split("\n").findIndex((line) => line.includes("First line.")));
  await flushMicrotasks(10);
  const span = h.overlay.querySelector(".portrait .image > .instance") as HTMLElement;
  const shadow = () => span.querySelector(":scope > span.morph")?.shadowRoot ?? null;
  await until(() => (!withCanvas || !!shadow()?.querySelector("canvas")) && !!shadow()?.querySelector("[data-morph]"), "the SVG layer's view");
  span.style.setProperty("width", "520px");
  span.style.setProperty("height", "280px");
  span.style.setProperty("background-size", "100% 100%");
  span.style.setProperty("background-repeat", "no-repeat");
  playback.requestRelayout();
  await flushMicrotasks(5);
  const write = writes.find((w) => w.params.target === "portrait" && w.params.instructions[0]?.content?.morph);
  const play = write.params.instructions[0].content.morph.plays[0];
  const own = play.picture.files.find((file: any) => file.plays)!.plays[0];
  const handle = await host.resolve(own.ref);
  const painted = () =>
    Array.from(shadow()!.querySelectorAll("canvas")).flatMap((element) => canvas.canvases.get(element as HTMLCanvasElement)?.frames.at(-1) ?? []);
  const box = () => shadow()!.querySelector("svg")!.parentElement!;
  return { playback, shadow, box, artifact: handle.artifact, painted, play, effects };
}

describe("a picture's morph moves its image-file layers while an SVG layer plays its own morph (#2631, #2632)", () => {
  test("composited: the moved file is drawn with its pose on the canvas, and the SVG layer's view takes the pose and keeps playing its own morph", async () => {
    const { playback, shadow, box, artifact, painted, play, effects } = await shown(COMPOSITED, () => 260, true);
    expect(play.morph).toBe("lift");
    expect(shadow()!.querySelectorAll("canvas").length).toBeGreaterThanOrEqual(1);
    playback.advance(1);
    expect(effects.map(({ keyframes }) => Object.keys(keyframes[1] ?? {}).filter((key) => key !== "offset"))).toEqual(
      expect.arrayContaining([["translate"], ["translate"]]),
    );
    const brows = painted().find(({ src }) => src === "/src/brows_file.png")!;
    expect(brows.transform[5]).not.toBe(0);
    expect(brows.alpha).toBeCloseTo(0.5, 6);
    expect(painted().find(({ src }) => src === "/src/base_file.png")!.transform).toEqual([1, 0, 0, 1, 0, 0]);
    const style = box().getAttribute("style") ?? "";
    expect(style).toMatch(/transform:matrix\(1, 0, 0, 1, 0, [\d.]+\)/);
    expect(style).toContain("transform-origin:0 0");
    expect(style).toMatch(/opacity:0\.5/);
    expect(leafStates(shadow()!)).toEqual(referenceStates(artifact, chompAt(1)));
    playback.advance(0.3);
    expect(leafStates(shadow()!)).toEqual(referenceStates(artifact, chompAt(1.3)));
    expect(referenceStates(artifact, chompAt(1))).not.toEqual(referenceStates(artifact, chompAt(1.3)));
  });

  test("fallback: the picture keeps its CSS drawing and moves nothing, and its SVG layer still plays its own morph at its CSS layer", async () => {
    const { playback, shadow, artifact, effects } = await shown(FALLBACK, (src) => (src.endsWith(".png") ? 130 : 260), false);
    expect(shadow()!.querySelectorAll("canvas")).toHaveLength(0);
    let time = 0;
    for (const seconds of [0.2, 0.5, 1.0]) {
      playback.advance(seconds - time);
      time = seconds;
      expect(leafStates(shadow()!)).toEqual(referenceStates(artifact, chompAt(seconds)));
    }
    expect(effects).toEqual([]);
    expect(Array.from(shadow()!.querySelectorAll("[style*='matrix']"))).toEqual([]);
  });
});
