import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { describe, expect, it } from "vitest";
import { Game } from "../core/classes/Game";
import { applyBuiltinDefaults } from "../core/utils/applyBuiltinDefaults";
import { AudioModule } from "./audio/classes/AudioModule";
import { audioBuiltinDefinitions } from "./audio/audioBuiltinDefinitions";
import { InterpreterModule } from "./interpreter/classes/InterpreterModule";

const PARTIAL_SYNTH = {
  $type: "synth",
  $name: "raffles",
  pitch: { frequency: 340 },
};

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
  const resolved = (game as any).context.synth.raffles;

  it("the interpreter reports a non-zero note duration", () => {
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

describe("end-to-end: authored voice through the real compiler (#268)", () => {
  const MAIN_URI = "file://proj/main.sd";

  const compileContext = (text: string) => {
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
    const context = compileContext(SCRIPT);
    const audio = new ProbeAudioModule({ context } as unknown as Game);
    const synth = audio.synthFor("character");
    expect(synth).toBeDefined();
    expect(synth!.envelope).toBeDefined();
  });

  describe("Game wires it in", () => {
    const buildGame = () => {
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
