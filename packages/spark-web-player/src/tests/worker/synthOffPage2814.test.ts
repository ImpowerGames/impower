import { afterEach, describe, expect, it } from "vitest";
import { SynthBuffer } from "@impower/spark-engine/src/game/modules/audio/classes/helpers/SynthBuffer";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";
import { createStandInAudio, type StandInAudio } from "./standInAudio";

const SOURCE = `define mia as character with
  name = "MIA"
end

scene start
  MIA: Hello there, how are you today?
  MIA: The next line.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const TALKING = lineOf("Hello there, how are you today?");

type Harness = Awaited<ReturnType<typeof createPlayerHarness>>;

let harness: Harness | undefined;

afterEach(() => {
  harness?.dispose();
  harness = undefined;
});

async function playTalkingLine(audio: StandInAudio, frames = 60) {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: TALKING },
    manualClock: true,
    audio,
  });
  harness = h;
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  await h.compile();
  await h.select(TALKING);
  await settle(40);
  expect(await h.controller.startGameAndApp()).toBe(true);
  await settle(40);
  await h.tick(1000 / 60, frames);
  await settle(20);
  return h;
}

const synthLoads = (h: Harness) =>
  h.toPage.filter((m) => m.method === "audio/load" && m.params?.synth && m.params?.tones);

const mismatches = (actual: Float32Array | undefined, expected: Float32Array) => {
  if (!actual || actual.length !== expected.length) {
    return Number.POSITIVE_INFINITY;
  }
  let count = 0;
  for (let i = 0; i < expected.length; i++) {
    if (!Object.is(actual[i], expected[i])) count++;
  }
  return count;
};

describe("voice beeps are synthesised off the page thread (#2814)", () => {
  it("hands the page the samples the game's worker synthesised in PLAY, identical to page-thread synthesis", async () => {
    const audio = createStandInAudio({ synthesises: true });
    const h = await playTalkingLine(audio);

    const loads = synthLoads(h);
    expect(loads.length).toBeGreaterThan(0);
    for (const load of loads) {
      const samples = load.params.samples as Float32Array | undefined;
      expect(Object.prototype.toString.call(samples)).toBe("[object Float32Array]");
      expect(load.params.sampleRate).toBe(48000);

      const expected = new SynthBuffer(load.params.synth, load.params.tones, 48000).soundBuffer;
      expect(mismatches(samples, expected)).toBe(0);
      const wrapped = audio.buffers.find((b) => b.key === load.params.key);
      expect(mismatches(wrapped?.samples, expected)).toBe(0);
    }
    expect(audio.sources.some((s) => s.key.startsWith("synth."))).toBe(true);
  }, 120_000);

  it("hands the page the samples of a looping synth that PLAY restores when it starts at a later line", async () => {
    const source = `define blip as synth with
end

scene start
  ((play music blip~d1 loop))
  First line.
  Second line.
end
`;
    const line = source.split("\n").findIndex((text) => text.includes("Second line."));
    const audio = createStandInAudio({ synthesises: true });
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: source }],
      startFrom: { file: MAIN_URI, line },
      manualClock: true,
      audio,
    });
    harness = h;
    const win = h.overlay.ownerDocument.defaultView as any;
    win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
    await h.compile();
    await h.select(line);
    await settle(40);
    const before = h.toPage.length;
    expect(await h.controller.startGameAndApp()).toBe(true);
    await settle(40);

    const restored = h.toPage
      .slice(before)
      .filter((m) => m.method === "audio/load" && m.params?.channel === "music" && m.params?.synth);
    expect(restored.length).toBeGreaterThan(0);
    for (const load of restored) {
      expect(load.params.tones.length).toBeGreaterThan(0);
      expect(load.params.sampleRate).toBe(48000);
      const expected = new SynthBuffer(load.params.synth, load.params.tones, 48000).soundBuffer;
      expect(mismatches(load.params.samples, expected)).toBe(0);
      const wrapped = audio.buffers.find((b) => b.key === load.params.key);
      expect(mismatches(wrapped?.samples, expected)).toBe(0);
    }
  }, 120_000);

  it("transfers the samples to the stopped preview's page with no copy", async () => {
    const audio = createStandInAudio({ synthesises: true });
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: TALKING },
      manualClock: true,
      audio,
    });
    harness = h;
    const win = h.overlay.ownerDocument.defaultView as any;
    win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
    await h.compile();
    await h.select(TALKING);
    await settle(40);
    await h.controller.handleSetPlayAudio({
      jsonrpc: "2.0",
      id: 1,
      method: "preview/setPlayAudio",
      params: { enabled: true },
    });
    await settle(40);
    await h.controller.playBeat();
    await settle(40);
    for (let elapsed = 0; elapsed < 3000; elapsed += 100) {
      await h.tick(100);
      await settle(5);
    }

    const handovers = h.transferred.filter(
      (t) => t.message.method === "audio/load" && t.message.params?.synth,
    );
    expect(handovers.length).toBeGreaterThan(0);
    for (const { message, transfer } of handovers) {
      expect(transfer).toHaveLength(1);
      expect((transfer[0] as ArrayBuffer).byteLength).toBe(0);
      const expected = new SynthBuffer(message.params.synth, message.params.tones, 48000).soundBuffer;
      expect(mismatches(message.params.samples, expected)).toBe(0);
      const wrapped = audio.buffers.find((b) => b.key === message.params.key);
      expect(mismatches(wrapped?.samples, expected)).toBe(0);
    }
  }, 120_000);

  it("wraps the samples it is handed without synthesising them again", async () => {
    const audio = createStandInAudio({ synthesises: true });
    const manager = audio.attach({}, () => {});
    const given = new Float32Array([0.25, -0.5, 0.75, 0]);
    await manager.loadAudioPlayer({
      channel: "typewriter",
      key: "synth.character~given",
      synth: { $type: "synth", $name: "character" } as any,
      tones: [{ time: 0, duration: 1 }] as any,
      samples: given,
      sampleRate: 48000,
    } as any);
    const wrapped = audio.buffers.find((b) => b.key === "synth.character~given");
    expect(wrapped?.length).toBe(4);
    expect(Array.from(wrapped?.samples ?? [])).toEqual([0.25, -0.5, 0.75, 0]);
  });

  it("applies the talking line only after its synthesised beeps are ready on the page", async () => {
    const audio = createStandInAudio({ synthesises: true });
    let release!: () => void;
    audio.holdSynth = new Promise<void>((resolve) => (release = resolve));
    const h = await playTalkingLine(audio);

    expect(synthLoads(h).length).toBeGreaterThan(0);
    expect(h.overlay.textContent ?? "").not.toContain("Hello there");
    expect(audio.sources.some((s) => s.key.startsWith("synth."))).toBe(false);

    release();
    await settle(20);
    await h.tick(1000 / 60, 120);
    await settle(20);
    expect(h.overlay.textContent ?? "").toContain("Hello there");
    expect(audio.sources.some((s) => s.key.startsWith("synth."))).toBe(true);
  }, 120_000);
});
