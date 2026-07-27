import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { describe, expect, it } from "vitest";
import type { Game } from "../core/classes/Game";
import { AudioModule } from "./audio/classes/AudioModule";
import { DEFAULT_BUILTIN_DEFINITIONS } from "./DEFAULT_BUILTIN_DEFINITIONS";
import { InterpreterModule } from "./interpreter/classes/InterpreterModule";

/**
 * A `define x as synth with ... end` reaches the runtime context carrying only
 * the properties the author wrote. Two modules consume that synth
 * independently, and they have to agree about it (#268):
 *
 *   - AudioModule decides what to actually synthesise.
 *   - InterpreterModule sizes syllables from the envelope, so the typewriter
 *     paces letters to match how long a note really lasts.
 *
 * Before the fix they disagreed for any partially-authored voice: AudioModule
 * dropped it entirely (silence), and InterpreterModule read a duration of 0.
 * These tests pin the agreement rather than any particular number, so
 * retuning the defaults doesn't churn them.
 */

/** A voice authored with nothing but a pitch -- the shape #268 reported. */
const PARTIAL_SYNTH = {
  $type: "synth",
  $name: "raffles",
  pitch: { frequency: 340 },
};

const contextWith = (synth: Record<string, any>) =>
  ({
    context: {
      system: {},
      config: { interpreter: { directives: {} } },
      character: {},
      synth,
    },
  }) as unknown as Game;

class ProbeAudioModule extends AudioModule {
  synthFor(name: string) {
    return (this as any).getData("sound", { $type: "synth", $name: name }, "")
      ?.synth;
  }
}

class ProbeInterpreterModule extends InterpreterModule {
  durationOf(synth: unknown) {
    return (this as any).getMinSynthDuration(synth);
  }
}

const envelopeDuration = (e: any) =>
  (e.attack ?? 0) + (e.decay ?? 0) + (e.sustain ?? 0) + (e.release ?? 0);

describe("partially-authored synth defaults (#268)", () => {
  const game = contextWith({ raffles: PARTIAL_SYNTH });

  it("the interpreter reports a non-zero note duration", () => {
    // Was 0: the authored synth has no envelope, and nothing filled one in.
    const interpreter = new ProbeInterpreterModule(game);
    expect(interpreter.durationOf(PARTIAL_SYNTH)).toBeGreaterThan(0);
  });

  it("the interpreter's duration matches the envelope the audio module plays", () => {
    const audio = new ProbeAudioModule(game);
    const interpreter = new ProbeInterpreterModule(game);

    const played = audio.synthFor("raffles");
    expect(played).toBeDefined();

    expect(interpreter.durationOf(PARTIAL_SYNTH)).toBeCloseTo(
      envelopeDuration(played!.envelope),
      10,
    );
  });

  it("still agrees for a fully-specified synth", () => {
    const complete = {
      $type: "synth",
      $name: "custom",
      shape: "sawtooth",
      envelope: {
        offset: 0,
        attack: 0.1,
        decay: 0.2,
        sustain: 0.3,
        release: 0.4,
        level: 0.5,
      },
    };
    const g = contextWith({ custom: complete });
    const audio = new ProbeAudioModule(g);
    const interpreter = new ProbeInterpreterModule(g);

    expect(interpreter.durationOf(complete)).toBeCloseTo(1.0, 10);
    expect(interpreter.durationOf(complete)).toBeCloseTo(
      envelopeDuration(audio.synthFor("custom")!.envelope),
      10,
    );
  });

  it("a missing synth still yields a usable duration", () => {
    const interpreter = new ProbeInterpreterModule(game);
    expect(interpreter.durationOf(undefined)).toBeGreaterThan(0);
  });
});

/**
 * The fixtures above hand-write the sparse synth #268 reported. This block
 * closes the loop by taking the shape from the REAL compiler instead, so the
 * chain that actually ships -- authored script -> compiled context -> played
 * synth -- is what gets asserted.
 *
 * Note that "compiles the voice without the type's defaults" below is a
 * CHARACTERIZATION test: it pins what the compiler does today in order to
 * document why the runtime has to fill defaults in at all. If it ever fails
 * because the compiler started merging type defaults itself, that is an
 * improvement, not a regression -- delete that test and check whether the
 * runtime fill-in is still needed.
 */
describe("end-to-end: authored voice through the real compiler (#268)", () => {
  const MAIN_URI = "file://proj/main.sd";

  const compileContext = (text: string) => {
    const compiler = new SparkdownCompiler();
    compiler.configure({
      definitions: { builtins: DEFAULT_BUILTIN_DEFINITIONS },
      files: [
        {
          uri: MAIN_URI,
          type: "script",
          name: "main",
          ext: "sd",
          text,
          version: 1,
          languageId: "sparkdown",
        },
      ],
    } as any);
    return (compiler.compile({ textDocument: { uri: MAIN_URI } }).program as any)
      .context;
  };

  const SCRIPT = [
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

  it("compiles the voice without the type's defaults (the upstream cause)", () => {
    const context = compileContext(SCRIPT);
    const authored = context.synth.raffles;
    expect(authored.pitch.frequency).toBe(340);
    // Documents WHY the runtime has to fill defaults in: nothing upstream does.
    expect(authored.shape).toBeUndefined();
    expect(authored.envelope).toBeUndefined();
  });

  it("plays that compiled voice with a complete synth", () => {
    const context = compileContext(SCRIPT);
    const audio = new ProbeAudioModule({ context } as unknown as Game);

    const synth = audio.synthFor("raffles");
    expect(synth).toBeDefined();
    expect(synth!.pitch.frequency).toBe(340);
    expect(synth!.shape).toBeDefined();
    expect(synth!.envelope).toBeDefined();
    expect(synth!.volume).toBeGreaterThan(0);
  });

  it("a character with no authored voice still falls back to a builtin", () => {
    // `crawshay` is never defined, so the lookup misses and the builtin
    // character voice is used -- this is the path that always worked.
    const context = compileContext(SCRIPT);
    const audio = new ProbeAudioModule({ context } as unknown as Game);
    const synth = audio.synthFor("character");
    expect(synth).toBeDefined();
    expect(synth!.envelope).toBeDefined();
  });
});
