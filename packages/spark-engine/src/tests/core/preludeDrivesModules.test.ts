import { describe, expect, test } from "vitest";
import { newGame } from "../harness/startingValuesGame";
import { compilePrelude } from "../harness/compilePrelude";
import { requireChunks } from "../harness/compileProgram";
import { SynthBuffer } from "../../game/modules/audio/classes/helpers/SynthBuffer";
import { parseTones } from "../../game/modules/audio/utils/parseTones";

const gameWithPrelude = (edit: (prelude: string) => string) => {
  const { program } = compilePrelude(edit);
  return newGame(requireChunks(program, "edited prelude")) as any;
};

const replaceOnce = (text: string, from: string | RegExp, to: string) => {
  const edited = text.replace(from, to);
  expect(edited, String(from)).not.toBe(text);
  return edited;
};

describe("the compiled prelude is the only source of the builtin values the modules read", () => {
  test("a changed assets value reaches the asset module, and a removed one is not restored by the engine", () => {
    const game = gameWithPrelude((prelude) =>
      replaceOnce(
        replaceOnce(prelude, "predict_distance = 32", "predict_distance = 7"),
        /^\s*loading_transition = "fade"\s*$/m,
        "",
      ),
    );
    expect(game.module.assets.config.predict_distance).toBe(7);
    expect(game.module.assets.config.loading_transition).toBeUndefined();
  });

  test("a removed or invalid assets number reads as 0, the value builtins.sd documents as off", () => {
    const game = gameWithPrelude((prelude) =>
      replaceOnce(
        replaceOnce(prelude, /^\s*beat_timeout = 8\s*$/m, ""),
        "load_timeout = 30",
        "load_timeout = -1",
      ),
    );
    expect(game.module.assets.config.beat_timeout).toBe(0);
    expect(game.module.assets.config.load_timeout).toBe(0);
    expect(game.module.assets.config.restore_timeout).toBe(2);
  });

  test("a removed interpreter fallback is not restored by the engine", () => {
    const game = gameWithPrelude((prelude) =>
      replaceOnce(
        prelude,
        'fallbacks = { layer = "portrait", channel = "sound" }',
        'fallbacks = { layer = "backdrop" }',
      ),
    );
    const interpreter = game.module.interpreter;
    expect(interpreter.createImageChunk("cat").target).toBe("backdrop");
    expect(interpreter.createAudioChunk("meow").target).toBeUndefined();
  });

  test("changed typewriter, audio, metadata and world values reach the game context", () => {
    const game = gameWithPrelude((prelude) => {
      let edited = replaceOnce(
        prelude,
        /(define dialogue as typewriter with[^]*?letter_pause = )0\.025/,
        "$10.5",
      );
      edited = replaceOnce(
        edited,
        /(define music as channel with\s+mixer = )"music"/,
        '$1"sound"',
      );
      edited = replaceOnce(
        edited,
        /(define metadata with\s+title = )""/,
        '$1"Edited"',
      );
      return replaceOnce(
        edited,
        /(define world with\s+src = )""/,
        '$1"edited.glb"',
      );
    });
    expect(game.context.typewriter.dialogue.letter_pause).toBe(0.5);
    expect(game.context.channel.music.mixer).toBe("sound");
    expect(game.context.metadata.$default.title).toBe("Edited");
    expect(game.context.world.$default.src).toBe("edited.glb");
  });

  test("a synth with no frequency in the prelude renders silence, not an engine-chosen pitch", () => {
    const game = gameWithPrelude((prelude) =>
      replaceOnce(
        prelude,
        /(define synth with[^]*?pitch = \{ )frequency = 440, /,
        "$1",
      ),
    );
    const unpitched = game.context.synth.$default;
    expect(unpitched.pitch.frequency).toBeUndefined();
    const tones = parseTones("t0s1b0~t0.075s1b0", "~");
    const sounding = (synth: any) =>
      new SynthBuffer(synth, tones, 44100).soundBuffer.some((v) => v !== 0);
    expect(sounding(unpitched)).toBe(false);
    expect(sounding(game.context.synth.character)).toBe(true);
  });
});
