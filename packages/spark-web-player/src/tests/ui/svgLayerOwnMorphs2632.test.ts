import { describe, expect, test, vi } from "vitest";
import { createMorphHost, inlineMorphSource, type MorphHost } from "@impower/sparkdown/src/morph/hosts";
import { renderMorphAt } from "@impower/sparkdown/src/morph/render";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphArtifact } from "@impower/sparkdown/src/morph/types";
import { talkingPortrait } from "@impower/sparkdown/src/tests/morph/fixtures";
import { MorphPlayback, type PictureCanvasContext } from "../../app/morph/MorphPlayback";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const LIDS = `morph lids_blink {
  blend = fade
  keyframes {
    0% {
      lids {
        state = off
      }
    }
    25% {
      lids {
        state = off
      }
    }
    50% {
      lids {
        state = on
      }
    }
    75% {
      lids {
        state = on
      }
    }
    100% {
      lids {
        state = off
      }
    }
  }
  timing {
    duration = 4
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

const SOURCE = `${LIDS}
${CHOMP}
define kit as layered_image with
  assets = {
    ["base"] = base_file,
    ["lids.on"] = bunny,
  }
end

scene start
  HERO:
    [[show portrait kit]]
    First line.
end
`;

const FILES = [
  { uri: "inmemory:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: talkingPortrait() },
  { uri: "inmemory:///base_file.png", type: "image", name: "base_file", ext: "png", src: "/src/base_file.png" },
];

function leafStates(root: ParentNode): Record<string, boolean[]> {
  const out: Record<string, boolean[]> = {};
  for (const el of Array.from(root.querySelectorAll("[data-morph]"))) {
    (out[el.getAttribute("data-morph")!] ??= []).push(!/display:\s*none/.test(el.getAttribute("style") ?? ""));
  }
  return out;
}

const referenceStates = (artifact: MorphArtifact, offset: Record<string, number>) =>
  leafStates(new DOMParser().parseFromString(renderMorphAt(artifact, offset), "image/svg+xml"));

function inProcessHost(program: () => any): MorphHost {
  return createMorphHost({
    service: new MorphBakeService(),
    channel: () => program().morphs,
    readSource: inlineMorphSource(() => program().context),
  });
}

function recordingCanvases() {
  const canvases = new Map<HTMLCanvasElement, { frames: string[][] }>();
  const factory = (element: HTMLCanvasElement) => {
    const record = { frames: [] as string[][] };
    canvases.set(element, record);
    const context: PictureCanvasContext = {
      globalAlpha: 1,
      imageSmoothingEnabled: true,
      setTransform: () => {},
      clearRect: () => {
        record.frames.push([]);
      },
      drawImage(image) {
        record.frames.at(-1)!.push((image as unknown as { src: string }).src);
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

describe("an SVG layer keeps its own morphs inside a picture its own morph drives (#2632)", () => {
  async function shown(source = SOURCE, widthOf: (src: string) => number = () => 260, withCanvas = true) {
    const writes: any[] = [];
    const h = createDOMHarness(source, 0, {
      files: FILES,
      afterEachMessage: (message) => {
        const ops = message?.method === "ui/batch" ? message.params.messages : [message];
        for (const op of ops) if (op?.method === "ui/write-image") writes.push(op);
      },
    });
    const host = inProcessHost(() => h.game.program);
    const canvas = recordingCanvases();
    const playback = MorphPlayback.for(h.overlay);
    playback.configure({
      host,
      seed: "test",
      requestFrame: () => 0,
      cancelFrame: () => {},
      pictureCanvas: canvas.factory,
      loadPicture: async (src) => ({ image: { src } as never, width: widthOf(src), height: 140 }),
    });
    await h.ready;
    await h.preview(source.split("\n").findIndex((line) => line.includes("First line.")));
    await flushMicrotasks(10);
    const span = h.overlay.querySelector(".portrait .image > .instance") as HTMLElement;
    const shadow = () => span.querySelector(":scope > span.morph")?.shadowRoot ?? null;
    await until(
      () => (!withCanvas || !!shadow()?.querySelector("canvas")) && !!shadow()?.querySelector("[data-morph]"),
      "the SVG layer's view",
    );
    const write = writes.find((w) => w.params.target === "portrait" && w.params.instructions[0]?.content?.morph);
    const play = write.params.instructions[0].content.morph.plays[0];
    const own = play.picture.files.find((file: any) => file.plays)!.plays[0];
    const handle = await host.resolve(own.ref);
    const box = () => shadow()!.querySelector("svg")!.parentElement!;
    const painted = () =>
      Array.from(shadow()!.querySelectorAll("canvas")).flatMap((element) => canvas.canvases.get(element as HTMLCanvasElement)?.frames.at(-1) ?? []);
    return { playback, shadow, box, artifact: handle.artifact, painted, play };
  }

  const opacityOf = (box: HTMLElement) => {
    const style = box.getAttribute("style") ?? "";
    if (/display:\s*none/.test(style)) return 0;
    const match = /opacity:\s*([\d.]+)/.exec(style);
    return match ? Number(match[1]) : 1;
  };

  const chompAt = (seconds: number) => ({ chomp: (seconds % 0.7) / 0.7 });

  test("the SVG layer's leaves keep taking poses while the picture's morph hides, fades and shows it, and a hidden layer draws nothing", async () => {
    const { playback, shadow, box, artifact, painted, play } = await shown();
    expect(play.morph).toBe("lids_blink");
    expect(shadow()!.querySelectorAll("canvas")).toHaveLength(1);
    let time = 0;
    const at = (seconds: number) => {
      playback.advance(seconds - time);
      time = seconds;
    };
    at(0.6);
    expect(opacityOf(box())).toBe(0);
    expect(leafStates(shadow()!)).toEqual(referenceStates(artifact, chompAt(0.6)));
    expect(painted()).toEqual(["/src/base_file.png"]);
    at(1.6);
    expect(opacityOf(box())).toBeCloseTo(0.6, 5);
    expect(leafStates(shadow()!)).toEqual(referenceStates(artifact, chompAt(1.6)));
    at(2.5);
    expect(opacityOf(box())).toBe(1);
    expect(leafStates(shadow()!)).toEqual(referenceStates(artifact, chompAt(2.5)));
    expect(referenceStates(artifact, chompAt(0.6))).not.toEqual(referenceStates(artifact, chompAt(1.6)));
    expect(painted()).toEqual(["/src/base_file.png"]);
  });

  test("the SVG layer's morph keeps its phase across a hide and a show", async () => {
    const { playback, shadow, box, artifact } = await shown();
    let time = 0;
    const at = (seconds: number) => {
      playback.advance(seconds - time);
      time = seconds;
    };
    at(2.5);
    expect(opacityOf(box())).toBe(1);
    at(4.6);
    expect(opacityOf(box())).toBe(0);
    at(5.3);
    expect(opacityOf(box())).toBeCloseTo(0.3, 5);
    expect(leafStates(shadow()!)).toEqual(referenceStates(artifact, chompAt(5.3)));
    expect(referenceStates(artifact, chompAt(5.3))).not.toEqual(referenceStates(artifact, chompAt(5.3 - 5)));
  });

  test("when the picture cannot be drawn on a canvas, its SVG layer still plays its own morph at its own CSS layer", async () => {
    const source = SOURCE.replace('["base"] = base_file,\n    ["lids.on"] = bunny,', '["base"] = bunny,\n    ["lids.on"] = base_file,');
    const { playback, shadow, artifact, play } = await shown(source, (src) => (src.endsWith(".png") ? 130 : 260), false);
    expect(play.picture.files.map((file: any) => [file.plays?.map((own: any) => own.morph), file.layer])).toEqual([
      [["chomp"], 0],
      [undefined, undefined],
    ]);
    expect(shadow()!.querySelectorAll("canvas")).toHaveLength(0);
    let time = 0;
    for (const seconds of [0.2, 0.5, 1.6]) {
      playback.advance(seconds - time);
      time = seconds;
      expect(leafStates(shadow()!)).toEqual(referenceStates(artifact, chompAt(seconds)));
    }
    expect(referenceStates(artifact, chompAt(0.2))).not.toEqual(referenceStates(artifact, chompAt(0.5)));
  });
});
