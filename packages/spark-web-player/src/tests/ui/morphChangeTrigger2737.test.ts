import { describe, expect, test, vi } from "vitest";
import { createMorphHost, inlineMorphSource, type MorphHost } from "@impower/sparkdown/src/morph/hosts";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import { MorphPlayback } from "../../app/morph/MorphPlayback";
import { createDOMHarness, flushMicrotasks, installJSDOM } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const SMILE = "M10,50 C30,80 70,80 90,50 C70,60 30,60 10,50Z";
const FROWN = "M10,60 C30,30 70,30 90,60 C70,50 30,50 10,60Z";

const face = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
<g data-name="mouth.smile default"><path data-name="lip" d="${SMILE}" fill="#a33"/></g>
<g data-name="mouth.frown"><path data-name="lip" d="${FROWN}" fill="#a33"/></g>
</svg>`;

const FILES = [
  { uri: "inmemory:///mia.svg", type: "image", name: "mia", ext: "svg", data: face },
  { uri: "inmemory:///tom.svg", type: "image", name: "tom", ext: "svg", data: face },
];

const SOURCE = `morph bend {
  method = match
  timing {
    trigger = change
    duration = 0.5
    easing = linear
  }
}

scene start
  [[show portrait mia:mouth.smile]]
  Mia smiles.
  [[show portrait mia:mouth.frown]]
  Then she does not.
  [[show portrait mia:mouth.frown]]
  She keeps frowning.
  [[show portrait tom:mouth.frown]]
  Tom frowns.
end
`;

function inProcessHost(program: () => any): MorphHost {
  return createMorphHost({
    service: new MorphBakeService(),
    channel: () => program().morphs,
    readSource: inlineMorphSource(() => program().context),
  });
}

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const numbers = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

async function played(beatCount: number, instant: (index: number) => boolean = () => false, gate?: Promise<void>) {
  const writes: any[] = [];
  const h = createDOMHarness(SOURCE, 0, {
    files: FILES,
    afterEachMessage: (message) => {
      for (const op of message?.method === "ui/batch" ? message.params.messages : [message]) {
        if (op?.method === "ui/write-image" && op.params.target === "portrait" && op.params.instructions.length) writes.push(op);
      }
    },
  });
  const playback = MorphPlayback.for(h.overlay);
  const inner = inProcessHost(() => h.game.program);
  const host: MorphHost = gate
    ? {
        resolve: async (ref, options) => {
          await gate;
          return inner.resolve(ref, options);
        },
      }
    : inner;
  playback.configure({ host, seed: "test", requestFrame: () => 0, cancelFrame: () => {} });
  await h.ready;
  h.jumpTo("start");
  for (let index = 0; index < beatCount; index++) {
    await h.display(h.nextBeat()!, instant(index));
    await flushMicrotasks(10);
  }
  const span = () => h.overlay.querySelector(".portrait .image > .instance") as HTMLElement | null;
  const shadow = () => span()?.querySelector(":scope > span.morph")?.shadowRoot ?? null;
  const lips = () =>
    Array.from(shadow()?.querySelectorAll("path[data-morph], [data-morph] path") ?? [])
      .filter((el) => !/display:\s*none/.test(el.closest("[style*='display']")?.getAttribute("style") ?? el.getAttribute("style") ?? ""))
      .map((el) => el.getAttribute("d") ?? "");
  const written = () => writes.at(-1)?.params.instructions[0].content;
  return { playback, span, shadow, lips, written };
}

describe("a `trigger = change` morph in the player (#2737)", () => {
  test("bends the drawing on screen into the drawing the new options choose over its duration", async () => {
    const { playback, shadow, lips } = await played(2);
    await until(() => !!shadow()?.querySelector("[data-morph]"), "the change morph's view");
    const start = numbers(lips()[0]!);
    expect(start).toEqual(numbers(SMILE));
    playback.advance(0.25);
    const middle = numbers(lips()[0]!);
    const smile = numbers(SMILE);
    const frown = numbers(FROWN);
    expect(middle).not.toEqual(smile);
    expect(middle).not.toEqual(frown);
    expect(middle[0]).toBeCloseTo(10, 1);
    expect(middle[1]).toBeCloseTo((smile[1]! + frown[1]!) / 2, 1);
    playback.advance(0.25);
    expect(numbers(lips()[0]!)).toEqual(frown);
    playback.advance(1);
    expect(numbers(lips()[0]!)).toEqual(frown);
  });

  test("starts from the drawing on screen once its pair is baked, however long the bake took", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { playback, span, shadow, lips, written } = await played(2, undefined, gate);
    await flushMicrotasks(20);
    expect(span()).not.toBeNull();
    expect(written().morph.plays.map((play: any) => play.morph)).toEqual(["bend"]);
    playback.advance(1);
    expect(shadow()).toBeNull();
    release();
    await until(() => !!shadow()?.querySelector("[data-morph]"), "the change morph's view");
    expect(numbers(lips()[0]!)).toEqual(numbers(SMILE));
    playback.advance(0.5);
    expect(numbers(lips()[0]!)).toEqual(numbers(FROWN));
  });

  test("a still with another number of layers stands for the whole background until the pair is baked", async () => {
    const env = installJSDOM();
    try {
      const playback = new MorphPlayback(env.overlay, {
        host: { resolve: () => new Promise(() => {}) },
        seed: "s",
        requestFrame: () => 0,
        cancelFrame: () => {},
      });
      const span = env.overlay.ownerDocument.createElement("span");
      const background = 'url("hat.png"), url("base.png")';
      span.style.backgroundImage = background;
      env.overlay.appendChild(span);
      const timing = { trigger: "change" as const, duration: 0.5, delay: 0, easing: "linear", iterations: 1, direction: "normal" as const };
      const ref = { morphs: ["bend"], key: "k-kit", image: "kit", selection: "{}", groups: ["hat"] };
      playback.mount(span, { plays: [{ layer: 0, ref, morph: "bend", timing, definition: "d" }], epoch: 0, still: 'url("base.png")' }, background, "background", "portrait:0");
      await flushMicrotasks(10);
      expect(span.style.backgroundImage).toBe('url("base.png")');
      playback.setEnabled(false);
      expect(span.style.backgroundImage).toBe(background);
    } finally {
      env.restore();
    }
  });

  test("does not run when the same options are shown again or a different picture is shown", async () => {
    for (const count of [3, 4]) {
      const { span, shadow, written } = await played(count);
      await flushMicrotasks(20);
      expect(span()).not.toBeNull();
      expect(shadow()).toBeNull();
      expect(written().morph).toBeUndefined();
      expect(decodeURIComponent(written().background)).toContain("mouth.frown");
    }
  });

  test("a beat displayed at once shows the new drawing with no motion", async () => {
    const { span, shadow, written } = await played(2, (index) => index === 1);
    await flushMicrotasks(20);
    expect(span()).not.toBeNull();
    expect(shadow()).toBeNull();
    expect(written().morph).toBeUndefined();
    expect(decodeURIComponent(written().background)).toContain("mouth.frown");
  });
});
