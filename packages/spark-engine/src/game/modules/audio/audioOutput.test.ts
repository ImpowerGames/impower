import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { describe, expect, it } from "vitest";
import { Game } from "../../core/classes/Game";
import { audioBuiltinDefinitions } from "./audioBuiltinDefinitions";
import { SynthBuffer } from "./classes/helpers/SynthBuffer";
import { LoadAudioPlayerParams } from "./types/LoadAudioPlayerParams";
import { parseTones } from "./utils/parseTones";

const SAMPLE_RATE = 44100;

const AUDIBLE_RMS = 0.01;

const measure = (buffer: Float32Array) => {
  let peak = 0;
  let sumOfSquares = 0;
  for (const sample of buffer) {
    const magnitude = Math.abs(sample);
    if (magnitude > peak) {
      peak = magnitude;
    }
    sumOfSquares += sample * sample;
  }
  return {
    peak,
    rms: Math.sqrt(sumOfSquares / (buffer.length || 1)),
    durationInSeconds: buffer.length / SAMPLE_RATE,
  };
};

const render = (params: LoadAudioPlayerParams) => {
  if (!params.synth || !params.tones) {
    throw new Error(
      `audio/load for "${params.key}" carries no ${
        params.synth ? "tones" : "synth"
      } -- the player would produce an empty buffer`,
    );
  }
  return new SynthBuffer(params.synth, params.tones, SAMPLE_RATE).soundBuffer;
};

const MAIN_URI = "file://proj/main.sd";

const audioEmittedBy = async (script: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: MAIN_URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: script,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as any);
  const program = compiler.compile({
    textDocument: { uri: MAIN_URI },
  } as any).program;

  const game = new Game({
    program,
    now: () => 0,
    setTimeout: (handler: Function) => {
      handler();
      return 0;
    },
  } as never);

  const loads: LoadAudioPlayerParams[] = [];
  game.connection.outgoing.addListener("*", (message: any) => {
    if (message?.method === "audio/load") {
      loads.push(message.params);
    }
  });

  await game.start();
  game.step();
  game.continue();

  return loads;
};

const AUTHORED_VOICE = [
  "define raffles as character with",
  '  name = "RAFFLES"',
  "end",
  "",
  "define raffles as synth with",
  "  pitch = {",
  "    frequency = 340",
  "  }",
  "end",
  "",
  "scene start",
  "  RAFFLES:",
  "  \tDo I make a sound now?",
  "end",
  "",
].join("\n");

const NO_AUTHORED_VOICE = [
  "scene start",
  "  CRAWSHAY:",
  "  \tI always did.",
  "end",
  "",
].join("\n");

describe("a character speaking produces audible output", () => {
  it("renders a non-silent buffer for an authored voice", async () => {
    const loads = await audioEmittedBy(AUTHORED_VOICE);
    expect(loads.length).toBeGreaterThan(0);

    const { rms, peak } = measure(render(loads[0]!));
    expect(rms).toBeGreaterThan(AUDIBLE_RMS);
    expect(peak).toBeGreaterThan(AUDIBLE_RMS);
  });

  it("renders a non-silent buffer for a character with no authored voice", async () => {
    const loads = await audioEmittedBy(NO_AUTHORED_VOICE);
    expect(loads.length).toBeGreaterThan(0);
    expect(measure(render(loads[0]!)).rms).toBeGreaterThan(AUDIBLE_RMS);
  });

  it("carries both a synth and tones, which is what the player requires", async () => {
    const loads = await audioEmittedBy(AUTHORED_VOICE);
    for (const load of loads) {
      expect(load.synth, load.key).toBeDefined();
      expect(load.tones?.length, load.key).toBeGreaterThan(0);
    }
  });

  it("asks the player for an audible level", async () => {
    const loads = await audioEmittedBy(AUTHORED_VOICE);
    for (const load of loads) {
      expect(load.volume, load.key).toBeGreaterThan(0);
    }
  });

  it("sounds for as long as the tones say it should", async () => {
    const loads = await audioEmittedBy(AUTHORED_VOICE);
    const { durationInSeconds } = measure(render(loads[0]!));
    const lastToneAt = Math.max(...loads[0]!.tones!.map((t) => t.time ?? 0));
    expect(durationInSeconds).toBeGreaterThan(lastToneAt);
  });
});

describe("silence is distinguishable from breakage", () => {
  it("renders the `none` synth as exactly silent", () => {
    const tones = parseTones("t0s1b0~t0.075s1b0", "~");
    const buffer = new SynthBuffer(
      audioBuiltinDefinitions().synth["none"]!,
      tones,
      SAMPLE_RATE,
    );
    const { rms, peak } = measure(buffer.soundBuffer);
    expect(rms).toBe(0);
    expect(peak).toBe(0);
  });

  it("renders an ordinary synth well above the threshold", () => {
    const tones = parseTones("t0s1b0~t0.075s1b0", "~");
    const buffer = new SynthBuffer(
      audioBuiltinDefinitions().synth["character"]!,
      tones,
      SAMPLE_RATE,
    );
    expect(measure(buffer.soundBuffer).rms).toBeGreaterThan(AUDIBLE_RMS * 10);
  });
});

describe("an incomplete synth never reaches the renderer", () => {
  it("throws rather than rendering, if one ever does", () => {
    const sparse: any = {
      $type: "synth",
      $name: "raffles",
      pitch: { frequency: 340 },
    };
    expect(() =>
      new SynthBuffer(sparse, parseTones("t0s1b0", "~"), SAMPLE_RATE),
    ).toThrow();
  });
});
