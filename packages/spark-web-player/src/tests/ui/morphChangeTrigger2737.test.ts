import { describe, expect, test, vi } from "vitest";
import { createMorphHost, inlineMorphSource, type MorphHost } from "@impower/sparkdown/src/morph/hosts";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import { MorphPlayback } from "../../app/morph/MorphPlayback";
import { createDOMHarness, flushMicrotasks, installJSDOM } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const SMILE = "M10,50 C30,80 70,80 90,50 C70,60 30,60 10,50Z";
const FROWN = "M10,60 C30,30 70,30 90,60 C70,50 30,50 10,60Z";
const FLAT = "M10,55 C30,55 70,55 90,55 C70,58 30,58 10,55Z";

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

async function played(beatCount: number, instant: (index: number) => boolean = () => false, gate?: Promise<void>, source = SOURCE, files = FILES) {
  const writes: any[] = [];
  const h = createDOMHarness(source, 0, {
    files,
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
  const next = async () => {
    await h.display(h.nextBeat()!, false);
    await flushMicrotasks(10);
  };
  const nextTwo = async () => {
    await Promise.all([h.display(h.nextBeat()!, false), h.display(h.nextBeat()!, false)]);
    await flushMicrotasks(10);
  };
  return { playback, span, shadow, lips, written, next, nextTwo };
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

  test.each([
    ["linear", 0.25],
    ["ease-in", 0.3],
    ["ease-out", 0.1],
    ["linear(0, 0.25 20%, 0.25 60%, 1 60%, 1)", 0.2],
    ["linear(0.2, 1)", 0.4375],
  ])("a change back to the drawing a change still playing started from turns back from the frame on screen (%s)", async (easing, after) => {
    const source = SOURCE.replace("easing = linear", `easing = ${easing}`).replace(
      "  [[show portrait mia:mouth.frown]]\n  She keeps frowning.",
      "  [[show portrait mia:mouth.smile]]\n  She smiles again.",
    );
    const { playback, shadow, lips, written, next } = await played(2, undefined, undefined, source);
    await until(() => !!shadow()?.querySelector("[data-morph]"), "the first change's view");
    playback.advance(after);
    const between = numbers(lips()[0]!);
    expect(between).not.toEqual(numbers(SMILE));
    expect(between).not.toEqual(numbers(FROWN));
    const interrupted = shadow();
    await next();
    expect(written().morph.plays.map((play: any) => play.morph)).toEqual(["bend"]);
    await until(() => shadow() !== interrupted && !!shadow()?.querySelector("[data-morph]") && lips().length > 0, "the interrupting change's view");
    const first = numbers(lips()[0]!);
    expect(first).toHaveLength(between.length);
    first.forEach((value, i) => expect(value).toBeCloseTo(between[i]!, 1));
    playback.advance(0.01);
    expect(Math.abs(numbers(lips()[0]!)[1]! - numbers(SMILE)[1]!)).toBeLessThan(Math.abs(between[1]! - numbers(SMILE)[1]!));
    playback.advance(0.5);
    expect(numbers(lips()[0]!)).toEqual(numbers(SMILE));
  });

  test("a change turning back shows the drawing the new options choose once animation is turned off", async () => {
    const source = SOURCE.replace(
      "  [[show portrait mia:mouth.frown]]\n  She keeps frowning.",
      "  [[show portrait mia:mouth.smile]]\n  She smiles again.",
    );
    const { playback, shadow, lips, next } = await played(2, undefined, undefined, source);
    await until(() => !!shadow()?.querySelector("[data-morph]"), "the first change's view");
    playback.advance(0.25);
    const interrupted = shadow();
    await next();
    await until(() => shadow() !== interrupted && !!shadow()?.querySelector("[data-morph]") && lips().length > 0, "the interrupting change's view");
    playback.advance(0.1);
    playback.setEnabled(false);
    expect(numbers(lips()[0]!)).toEqual(numbers(SMILE));
    playback.setEnabled(true);
    playback.advance(1);
    playback.setEnabled(false);
    expect(numbers(lips()[0]!)).toEqual(numbers(SMILE));
  });

  test.each([
    ["linear", 0.45, 55, 53],
    ["linear(0, 0.25 20%, 0.25 60%, 1 60%, 1)", 0.4, 52.5, 50],
  ])("a change turning back holds the frame on screen while its delay runs (%s)", async (easing, after, shown, then) => {
    const source = SOURCE.replace("duration = 0.5", "duration = 0.5\n    delay = 0.2").replace("easing = linear", `easing = ${easing}`).replace(
      "  [[show portrait mia:mouth.frown]]\n  She keeps frowning.",
      "  [[show portrait mia:mouth.smile]]\n  She smiles again.",
    );
    const { playback, shadow, lips, next } = await played(2, undefined, undefined, source);
    await until(() => !!shadow()?.querySelector("[data-morph]"), "the first change's view");
    playback.advance(after);
    const between = numbers(lips()[0]!);
    expect(between[1]).toBeCloseTo(shown, 1);
    const interrupted = shadow();
    await next();
    await until(() => shadow() !== interrupted && !!shadow()?.querySelector("[data-morph]") && lips().length > 0, "the interrupting change's view");
    numbers(lips()[0]!).forEach((value, i) => expect(value).toBeCloseTo(between[i]!, 1));
    playback.advance(0.15);
    numbers(lips()[0]!).forEach((value, i) => expect(value).toBeCloseTo(between[i]!, 1));
    playback.advance(0.15);
    expect(numbers(lips()[0]!)[1]).toBeCloseTo(then, 1);
    playback.advance(0.2);
    expect(numbers(lips()[0]!)).toEqual(numbers(SMILE));
  });

  test("a third change while the portrait is turning back carries on from the frame on screen", async () => {
    const source = SOURCE.replace(
      "  [[show portrait mia:mouth.frown]]\n  She keeps frowning.\n  [[show portrait tom:mouth.frown]]",
      "  [[show portrait mia:mouth.smile]]\n  She smiles again.\n  [[show portrait mia:mouth.frown]]",
    );
    const { playback, shadow, lips, next } = await played(2, undefined, undefined, source);
    await until(() => !!shadow()?.querySelector("[data-morph]"), "the first change's view");
    playback.advance(0.25);
    let interrupted = shadow();
    await next();
    await until(() => shadow() !== interrupted && !!shadow()?.querySelector("[data-morph]") && lips().length > 0, "the second change's view");
    playback.advance(0.1);
    const between = numbers(lips()[0]!);
    expect(between[1]).toBeCloseTo(53, 1);
    interrupted = shadow();
    await next();
    await until(() => shadow() !== interrupted && !!shadow()?.querySelector("[data-morph]") && lips().length > 0, "the third change's view");
    numbers(lips()[0]!).forEach((value, i) => expect(value).toBeCloseTo(between[i]!, 1));
    playback.advance(0.35);
    expect(numbers(lips()[0]!)).toEqual(numbers(FROWN));
  });

  test.each([
    ["steps(4, start)", 0.375],
    ["linear(0.2, 1.8, 1)", 0.2],
  ])("a change turning back starts on the frame on screen when that frame is a whole drawing (%s)", async (easing, after) => {
    const source = SOURCE.replace("easing = linear", `easing = ${easing}`).replace(
      "  [[show portrait mia:mouth.frown]]\n  She keeps frowning.",
      "  [[show portrait mia:mouth.smile]]\n  She smiles again.",
    );
    const { playback, shadow, lips, next } = await played(2, undefined, undefined, source);
    await until(() => !!shadow()?.querySelector("[data-morph]"), "the first change's view");
    playback.advance(after);
    const between = numbers(lips()[0]!);
    const interrupted = shadow();
    await next();
    await until(() => shadow() !== interrupted && !!shadow()?.querySelector("[data-morph]") && lips().length > 0, "the interrupting change's view");
    numbers(lips()[0]!).forEach((value, i) => expect(value).toBeCloseTo(between[i]!, 1));
    playback.advance(1);
    expect(numbers(lips()[0]!)).toEqual(numbers(SMILE));
  });

  test.each([
    ["linear", 0.25],
    ["ease-in", 0.3],
    ["linear(1.2, 0, 1)", 0.125],
    ["linear(0.2, 1)", 0.4375],
  ])("a change turning back keeps moving on from the frame on screen after its first frame (%s)", async (easing, after) => {
    const source = SOURCE.replace("easing = linear", `easing = ${easing}`).replace(
      "  [[show portrait mia:mouth.frown]]\n  She keeps frowning.",
      "  [[show portrait mia:mouth.smile]]\n  She smiles again.",
    );
    const { playback, shadow, lips, next } = await played(2, undefined, undefined, source);
    await until(() => !!shadow()?.querySelector("[data-morph]"), "the first change's view");
    playback.advance(after);
    const between = numbers(lips()[0]!);
    const interrupted = shadow();
    await next();
    await until(() => shadow() !== interrupted && !!shadow()?.querySelector("[data-morph]") && lips().length > 0, "the interrupting change's view");
    let last = numbers(lips()[0]!);
    last.forEach((value, i) => expect(value).toBeCloseTo(between[i]!, 1));
    for (let tick = 0; tick < 5; tick++) {
      playback.advance(0.002);
      const now = numbers(lips()[0]!);
      now.forEach((value, i) => expect(Math.abs(value - last[i]!)).toBeLessThan(1));
      last = now;
    }
    playback.advance(1);
    expect(numbers(lips()[0]!)).toEqual(numbers(SMILE));
  });

  test("flips after a curve that dips below its start carry on from the frame on screen", async () => {
    const source = SOURCE.replace("easing = linear", "easing = linear(0.6, 0, 1)").replace(
      "  [[show portrait mia:mouth.frown]]\n  She keeps frowning.\n  [[show portrait tom:mouth.frown]]\n  Tom frowns.",
      "  [[show portrait mia:mouth.smile]]\n  She smiles again.\n  [[show portrait mia:mouth.frown]]\n  She frowns again.\n  [[show portrait mia:mouth.smile]]\n  She smiles at last.",
    );
    const { playback, shadow, lips, next } = await played(2, undefined, undefined, source);
    await until(() => !!shadow()?.querySelector("[data-morph]"), "the first change's view");
    playback.advance(0.01);
    let interrupted = shadow();
    await next();
    await until(() => shadow() !== interrupted && !!shadow()?.querySelector("[data-morph]") && lips().length > 0, "the second change's view");
    playback.advance(0.05);
    const before = numbers(lips()[0]!);
    expect(before).not.toEqual(numbers(SMILE));
    for (const which of ["third", "fourth"]) {
      interrupted = shadow();
      await next();
      await until(() => shadow() !== interrupted && !!shadow()?.querySelector("[data-morph]") && lips().length > 0, `the ${which} change's view`);
      numbers(lips()[0]!).forEach((value, i) => expect(value).toBeCloseTo(before[i]!, 1));
    }
    playback.advance(1);
    expect(numbers(lips()[0]!)).toEqual(numbers(SMILE));
  });

  test("two changes in one frame while a change is still playing carry on from the frame on screen", async () => {
    const source = SOURCE.replace(
      "  [[show portrait mia:mouth.frown]]\n  She keeps frowning.\n  [[show portrait tom:mouth.frown]]",
      "  [[show portrait mia:mouth.smile]]\n  She smiles again.\n  [[show portrait mia:mouth.frown]]",
    );
    const { playback, shadow, lips, nextTwo } = await played(2, undefined, undefined, source);
    await until(() => !!shadow()?.querySelector("[data-morph]"), "the first change's view");
    playback.advance(0.25);
    const between = numbers(lips()[0]!);
    const interrupted = shadow();
    await nextTwo();
    await until(() => shadow() !== interrupted && !!shadow()?.querySelector("[data-morph]") && lips().length > 0, "the last change's view");
    numbers(lips()[0]!).forEach((value, i) => expect(value).toBeCloseTo(between[i]!, 1));
    playback.advance(0.25);
    expect(numbers(lips()[0]!)).toEqual(numbers(FROWN));
  });

  test("a change that interrupts a change still playing toward another drawing starts from the drawing that change ends on", async () => {
    const source = SOURCE.replace(
      "  [[show portrait mia:mouth.frown]]\n  She keeps frowning.",
      "  [[show portrait mia:mouth.flat]]\n  She settles.",
    ).replaceAll("mia", "ann");
    const { playback, shadow, lips, written, next } = await played(2, undefined, undefined, source, [
      {
        uri: "inmemory:///ann.svg",
        type: "image",
        name: "ann",
        ext: "svg",
        data: face.replace("</svg>", `<g data-name="mouth.flat"><path data-name="lip" d="${FLAT}" fill="#a33"/></g>\n</svg>`),
      },
      FILES[1]!,
    ]);
    await until(() => !!shadow()?.querySelector("[data-morph]"), "the first change's view");
    playback.advance(0.25);
    const interrupted = shadow();
    await next();
    expect(written().morph.plays.map((play: any) => play.morph)).toEqual(["bend"]);
    await until(() => shadow() !== interrupted && !!shadow()?.querySelector("[data-morph]") && lips().length > 0, "the interrupting change's view");
    expect(numbers(lips()[0]!)).toEqual(numbers(FROWN));
    playback.advance(0.5);
    expect(numbers(lips()[0]!)).toEqual(numbers(FLAT));
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
