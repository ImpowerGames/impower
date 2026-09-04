import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { describe, expect, it } from "vitest";
import { Game } from "../../core/classes/Game";
import { audioBuiltinDefinitions } from "./audioBuiltinDefinitions";
import { SynthBuffer } from "./classes/helpers/SynthBuffer";
import { LoadAudioPlayerParams } from "./types/LoadAudioPlayerParams";
import { parseTones } from "./utils/parseTones";

/**
 * The audio regression gate (#273).
 *
 * Audio was the one part of the engine that could only be checked by
 * listening to it, which is why #268 -- every character with an authored
 * voice silent -- survived long enough to be mistaken for a problem with
 * the missing preview AudioContext. Nothing threw and nothing logged; the
 * synth was quietly dropped and the tone events played nothing.
 *
 * `SynthBuffer` is a pure renderer -- `Synth` + `Tone[]` + sample rate into a
 * `Float32Array` -- so the actual samples can be measured headlessly, with no
 * Web Audio API, no AudioContext and no speakers. That makes "did this make a
 * sound" an ordinary assertion.
 *
 * These tests run a REAL `Game` over a script, capture the `audio/load`
 * notifications it emits, and render them exactly the way `AudioManager` does
 * in the player. So they cover the whole chain: compiler -> context ->
 * inherited defaults -> interpreter -> AudioModule -> renderable samples.
 *
 * KNOWN LIMIT, worth stating plainly so this gate is not over-trusted: it
 * measures the synthesised WAVEFORM, which is everything up to the point the
 * player hands samples to Web Audio. It cannot see anything downstream of
 * that. `synth.volume` in particular is not baked into these samples -- it
 * travels as `params.volume` and is applied by gain nodes -- so a regression
 * that zeroes a gain, mutes a mixer or wires the graph to the wrong
 * destination renders identically here and is inaudible in practice. That
 * territory belongs to the AnalyserNode tap in the other half of #273, which
 * reads the real graph after gain. What can be checked at this layer is that
 * the request itself asks for an audible level, which the last test does.
 */

const SAMPLE_RATE = 44100;

/**
 * Silence is exactly 0 here, and speech renders around 0.26 RMS, so this
 * threshold is three orders of magnitude clear of both. It exists to catch
 * "renders nothing", not to pin a mix level -- retuning the synths must not
 * churn this file.
 */
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

/** Renders one `audio/load` payload the way `AudioManager` does. */
const render = (params: LoadAudioPlayerParams) => {
  if (!params.synth || !params.tones) {
    // The player takes the same branch: with no synth it falls through to a
    // single empty sample, which is precisely how #268 sounded.
    throw new Error(
      `audio/load for "${params.key}" carries no ${
        params.synth ? "tones" : "synth"
      } -- the player would produce an empty buffer`,
    );
  }
  return new SynthBuffer(params.synth, params.tones, SAMPLE_RATE).soundBuffer;
};

const MAIN_URI = "file://proj/main.sd";

/** Runs a script through a real game and returns what it asked to play. */
const audioEmittedBy = async (script: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    // Builtins come from the compiled builtins prelude, and the Game sources
    // its defines from the live runtime `__def` tables — so every
    // Game-feeding compile must seed the prelude into the story VM, the way
    // the production player does.
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
  "RAFFLES:",
  "\tDo I make a sound now?",
  "",
].join("\n");

const NO_AUTHORED_VOICE = ["CRAWSHAY:", "\tI always did.", ""].join("\n");

describe("a character speaking produces audible output", () => {
  it("renders a non-silent buffer for an authored voice", async () => {
    // The #268 regression: a voice authored with only a pitch was dropped
    // before it ever reached the renderer, and the character was mute.
    const loads = await audioEmittedBy(AUTHORED_VOICE);
    expect(loads.length).toBeGreaterThan(0);

    const { rms, peak } = measure(render(loads[0]!));
    expect(rms).toBeGreaterThan(AUDIBLE_RMS);
    expect(peak).toBeGreaterThan(AUDIBLE_RMS);
  });

  it("renders a non-silent buffer for a character with no authored voice", async () => {
    // The builtin fallback path -- this one always worked, and it is what
    // made #268 look like it only affected some characters.
    const loads = await audioEmittedBy(NO_AUTHORED_VOICE);
    expect(loads.length).toBeGreaterThan(0);
    expect(measure(render(loads[0]!)).rms).toBeGreaterThan(AUDIBLE_RMS);
  });

  it("carries both a synth and tones, which is what the player requires", async () => {
    // `AudioManager` gates on `params.synth && params.tones`; failing either
    // silently yields a one-sample empty buffer rather than an error.
    const loads = await audioEmittedBy(AUTHORED_VOICE);
    for (const load of loads) {
      expect(load.synth, load.key).toBeDefined();
      expect(load.tones?.length, load.key).toBeGreaterThan(0);
    }
  });

  it("asks the player for an audible level", async () => {
    // The waveform above is measured BEFORE gain, so a synth silenced by
    // volume alone would still render at full amplitude here. This is the
    // part of that gap this layer can close: the load request itself must
    // not ask for silence.
    const loads = await audioEmittedBy(AUTHORED_VOICE);
    for (const load of loads) {
      expect(load.volume, load.key).toBeGreaterThan(0);
    }
  });

  it("sounds for as long as the tones say it should", async () => {
    // Guards the other way a note can be inaudible: it fires, but is cut to
    // nothing. A sparse synth used to report a zero-length envelope.
    const loads = await audioEmittedBy(AUTHORED_VOICE);
    const { durationInSeconds } = measure(render(loads[0]!));
    const lastToneAt = Math.max(...loads[0]!.tones!.map((t) => t.time ?? 0));
    expect(durationInSeconds).toBeGreaterThan(lastToneAt);
  });
});

describe("silence is distinguishable from breakage", () => {
  /**
   * Without this, "asserts non-silent" would be satisfied by a gate that
   * cannot detect silence at all. `synth.none` is the builtin that is
   * SUPPOSED to be inaudible.
   */
  it("renders the `none` synth as exactly silent", () => {
    const tones = parseTones("t0s1b0~t0.075s1b0", "~");
    const buffer = new SynthBuffer(
      audioBuiltinDefinitions().synth["none"],
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
      audioBuiltinDefinitions().synth["character"],
      tones,
      SAMPLE_RATE,
    );
    // Confirms the threshold has real headroom rather than sitting on the
    // edge of what the synths happen to output.
    expect(measure(buffer.soundBuffer).rms).toBeGreaterThan(AUDIBLE_RMS * 10);
  });
});

describe("an incomplete synth never reaches the renderer", () => {
  it("throws rather than rendering, if one ever does", () => {
    // Found while building this gate: `SynthBuffer` does not degrade to
    // silence on a sparse synth, it dereferences a missing envelope and
    // throws. #268 was silent only because AudioModule dropped the struct
    // earlier. Pinning it means a future regression is loud, not quiet.
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
