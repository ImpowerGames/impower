import { describe, expect, it } from "vitest";
import { preludeContext } from "../../../tests/harness/compilePrelude";
import { randomizeProperties } from "../../core/utils/randomizeProperties";
import { randomizer } from "../../core/utils/randomizer";
import { audioRandomDefinitions } from "./audioRandomDefinitions";
import { SynthBuffer } from "./classes/helpers/SynthBuffer";
import { schema_synth } from "./constructors/schema_synth";
import type { Synth } from "./types/Synth";

const voices = preludeContext()["synth"] as Record<string, Synth>;
const defaults = voices["$default"]!;
const sine = () => {
  const synth = structuredClone(defaults);
  synth.shape = "sine";
  Object.assign(synth.envelope, {
    attack: 0,
    decay: 0,
    sustain: 0.12,
    release: 0,
    level: 1,
  });
  return synth;
};

function rms(samples: Float32Array, start: number, end: number) {
  let sum = 0;
  for (let i = start; i < end; i++) sum += samples[i]! ** 2;
  return Math.sqrt(sum / (end - start));
}

function gainDb(synth: Synth, frequency: number, sampleRate: number) {
  const signal = new SynthBuffer(synth, [{ pitch: frequency }], sampleRate)
    .soundBuffer;
  const flat = new SynthBuffer(sine(), [{ pitch: frequency }], sampleRate)
    .soundBuffer;
  const start = Math.round(sampleRate * 0.04);
  return (
    20 *
    Math.log10(
      rms(signal, start, signal.length) / rms(flat, start, flat.length),
    )
  );
}

describe.each([44100, 48000])("synth filters at %i Hz", (sampleRate) => {
  it("puts bass and treble on opposite sides of the high-pass cutoff", () => {
    const synth = sine();
    Object.assign(synth.highpass, { on: true, cutoff: 2000 });
    expect(gainDb(synth, 250, sampleRate)).toBeLessThan(-34);
    expect(gainDb(synth, 2000, sampleRate)).toBeCloseTo(-3.01, 1);
    expect(gainDb(synth, 6000, sampleRate)).toBeGreaterThan(-0.15);
    synth.highpass.cutoff = 0;
    expect(gainDb(synth, 250, sampleRate)).toBeCloseTo(0, 5);
    synth.highpass.cutoff = sampleRate / 2;
    expect(gainDb(synth, 6000, sampleRate)).toBe(-Infinity);
  });

  it("keeps the low-pass response used by existing sounds", () => {
    const synth = sine();
    Object.assign(synth.lowpass, { on: true, cutoff: 2000, resonance: 0 });
    expect(gainDb(synth, 250, sampleRate)).toBeGreaterThan(-0.05);
    expect(gainDb(synth, 6000, sampleRate)).toBeLessThan(-18);
  });

  it("passes the band center at unity and narrows both skirts as Q rises", () => {
    const synth = sine();
    synth.bandpass = { on: true, frequency: 1600, q: 1 };
    expect(gainDb(synth, 1600, sampleRate)).toBeCloseTo(0, 2);
    const wide = [400, 6400].map((hz) => gainDb(synth, hz, sampleRate));
    synth.bandpass.q = 4;
    for (const [i, hz] of [400, 6400].entries()) {
      expect(wide[i]).toBeLessThan(-10);
      expect(gainDb(synth, hz, sampleRate)).toBeLessThan(wide[i]! - 10);
    }
  });
});

it("interpolates gain in note-local time, holds endpoints and scales with tone speed", () => {
  const synth = sine();
  synth.envelope.points = [
    { time: 0.04, level: 0.8 },
    { time: 0.02, level: 0.2 },
  ];
  const rate = 48000;
  for (const speed of [1, 2]) {
    const offset = 0.03;
    const tone = new SynthBuffer(synth, [{ time: offset, speed }], rate);
    for (const [time, gain] of [
      [0.01, 0.2],
      [0.03, 0.5],
      [0.05, 0.8],
    ] as const) {
      expect(
        tone.volumeBuffer[Math.round((offset + time / speed) * rate)],
      ).toBeCloseTo(gain, 5);
    }
  }
  synth.envelope.points = [
    { time: 0, level: 1 },
    { time: 0, level: 0 },
  ];
  expect(
    new SynthBuffer(synth, [{}], rate).soundBuffer.every(
      (sample) => sample === 0,
    ),
  ).toBe(true);
  delete synth.envelope.points;
  const legacy = new SynthBuffer(synth, [{}], rate).soundBuffer;
  synth.envelope.points = [];
  expect(new SynthBuffer(synth, [{}], rate).soundBuffer).toEqual(legacy);
});

it("keeps microsecond settings when randomizing a fixed or ranged delay", () => {
  const synth = sine();
  const schema = schema_synth();
  for (const [range, expected] of [
    [[0.000435], 0.000435],
    [[0.0004, 0.00055], 0.000475],
  ] as const) {
    randomizeProperties(
      synth,
      schema,
      { $type: "synth", $name: "$random", delay: { length: [...range] } },
      undefined,
      () => 0.5,
    );
    expect(synth.delay.length).toBe(expected);
  }
});

it("preserves the factory typewriter and Clack tones across the high-pass correction", () => {
  const clack = structuredClone(defaults);
  const preset = audioRandomDefinitions().synth["$random:clack"]!;
  randomizeProperties(clack, schema_synth(), preset, undefined, () => 0.5);
  for (const [voice, cutoff] of [
    [voices["typewriter"]!, 6600],
    [clack, 2900],
  ] as const) {
    const reference = structuredClone(voice);
    reference.highpass.on = false;
    Object.assign(reference.lowpass, { on: true, cutoff, resonance: 0 });
    expect(new SynthBuffer(voice, [{}], 48000).soundBuffer).toEqual(
      new SynthBuffer(reference, [{}], 48000).soundBuffer,
    );
  }
});

it("rerolls distinct playable keys with a quiet gap, a return and constant syllable duration", () => {
  const preset = audioRandomDefinitions().synth["$random:typewriter"];
  expect(preset).toBeDefined();
  const rolls = new Set<number>();
  for (let seed = 0; seed < 32; seed++) {
    const synth = structuredClone(defaults);
    randomizeProperties(
      synth,
      schema_synth(),
      preset!,
      undefined,
      randomizer(seed),
    );
    const samples = new SynthBuffer(synth, [{}], 48000).soundBuffer;
    const energy = (from: number, to: number) =>
      rms(samples, from * 48, to * 48);
    expect(samples.length).toBe(3504);
    const gap = energy(36, 40);
    expect(energy(2, 10)).toBeGreaterThan(10 * gap);
    expect(energy(50, 55)).toBeGreaterThan(5 * gap);
    expect(energy(50, 55)).toBeLessThan(energy(2, 10));
    expect(
      samples.every(
        (v) => Number.isFinite(v) && Math.abs(v * synth.volume) < 1,
      ),
    ).toBe(true);
    rolls.add(synth.delay.length);
  }
  expect(rolls.size).toBeGreaterThan(12);
});

it("lets authors edit a rolled envelope without changing the preset or another roll", () => {
  const spec = audioRandomDefinitions().synth["$random:typewriter"];
  expect(spec).toBeDefined();
  const roll = () => {
    const synth = structuredClone(defaults);
    randomizeProperties(synth, schema_synth(), spec!, undefined, () => 0.5);
    return synth;
  };
  const first = roll();
  const second = roll();
  first.envelope.points![0]!.level = 0;
  expect(second.envelope.points![0]!.level).toBe(1);
  expect(roll().envelope.points![0]!.level).toBe(1);
});
