import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { describe, expect, it } from "vitest";
import { Game } from "../core/classes/Game";
import { applyBuiltinDefaults } from "../core/utils/applyBuiltinDefaults";
import { AudioModule } from "./audio/classes/AudioModule";
import { audioBuiltinDefinitions } from "./audio/audioBuiltinDefinitions";
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
 * Both now read a context that `Game` has already completed, so these tests
 * pin the agreement rather than any particular number -- retuning the defaults
 * doesn't churn them.
 */

/** A voice authored with nothing but a pitch -- the shape #268 reported. */
const PARTIAL_SYNTH = {
  $type: "synth",
  $name: "raffles",
  pitch: { frequency: 340 },
};

/** Builds a context the way `Game` does, defaults included. */
const contextWith = (synth: Record<string, any>) => {
  const context: any = {
    system: {},
    config: { interpreter: { directives: {} } },
    character: {},
    synth: { ...audioBuiltinDefinitions().synth, ...synth },
  };
  applyBuiltinDefaults(context);
  return context;
};

const gameWith = (synth: Record<string, any>) =>
  ({ context: contextWith(synth) }) as unknown as Game;

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
  const game = gameWith({ raffles: PARTIAL_SYNTH });
  /** What the modules actually see -- the completed struct, not the fixture. */
  const resolved = (game as any).context.synth.raffles;

  it("the interpreter reports a non-zero note duration", () => {
    // Was 0: the authored synth has no envelope, and nothing filled one in.
    const interpreter = new ProbeInterpreterModule(game);
    expect(interpreter.durationOf(resolved)).toBeGreaterThan(0);
  });

  it("the interpreter's duration matches the envelope the audio module plays", () => {
    const audio = new ProbeAudioModule(game);
    const interpreter = new ProbeInterpreterModule(game);

    const played = audio.synthFor("raffles");
    expect(played).toBeDefined();

    expect(interpreter.durationOf(resolved)).toBeCloseTo(
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
    const g = gameWith({ custom: complete });
    const audio = new ProbeAudioModule(g);
    const interpreter = new ProbeInterpreterModule(g);
    const authored = (g as any).context.synth.custom;

    expect(interpreter.durationOf(authored)).toBeCloseTo(1.0, 10);
    expect(interpreter.durationOf(authored)).toBeCloseTo(
      envelopeDuration(audio.synthFor("custom")!.envelope),
      10,
    );
  });
});

/**
 * The fixtures above hand-write the sparse synth #268 reported. This block
 * closes the loop by taking the shape from the REAL compiler instead, so the
 * chain that actually ships -- authored script -> compiled context ->
 * completed context -> played synth -- is what gets asserted.
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
    applyBuiltinDefaults(context); // what `Game` does on the way in
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
    applyBuiltinDefaults(context);
    const audio = new ProbeAudioModule({ context } as unknown as Game);
    const synth = audio.synthFor("character");
    expect(synth).toBeDefined();
    expect(synth!.envelope).toBeDefined();
  });

  /**
   * Everything above calls `applyBuiltinDefaults` itself, so it would keep
   * passing even if `Game` stopped calling it -- which is exactly the mutant
   * that survived a first pass of this suite. These build a REAL `Game` and
   * assert its context, so the wiring is what is under test.
   */
  describe("Game wires it in", () => {
    const buildGame = () => {
      const compiler = new SparkdownCompiler();
      compiler.configure({
        definitions: { builtins: DEFAULT_BUILTIN_DEFINITIONS },
        files: [
          {
            uri: MAIN_URI,
            type: "script",
            name: "main",
            ext: "sd",
            text: SCRIPT,
            version: 1,
            languageId: "sparkdown",
          },
        ],
      } as any);
      const program = compiler.compile({
        textDocument: { uri: MAIN_URI },
      } as any).program;
      return new Game({
        program,
        now: () => 0,
        setTimeout: (handler: Function) => {
          handler();
          return 0;
        },
      } as never);
    };

    it("completes authored defines in the context it builds", () => {
      const game = buildGame();
      const raffles = (game.context as any).synth.raffles;
      expect(raffles.pitch.frequency).toBe(340);
      expect(raffles.shape).toBeDefined();
      expect(raffles.envelope).toBeDefined();
      expect(raffles.volume).toBeGreaterThan(0);
    });

    it("keeps each define's own identity", () => {
      const game = buildGame();
      expect((game.context as any).synth.raffles.$name).toBe("raffles");
    });
  });
});
