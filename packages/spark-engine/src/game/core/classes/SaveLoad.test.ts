import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { beforeAll, describe, expect, it } from "vitest";
import { Game } from "./Game";
import { RuntimeState } from "./RuntimeState";

/**
 * Save corruption is the worst failure mode in the runtime: it surfaces as a
 * broken save long after the change that caused it, and by then the only
 * evidence is a save file nobody can load. So these tests drive a real
 * compiled program through a real `Game` rather than a fake -- the point is
 * to catch serialization drift between `save()` and `load()`, which a stub
 * can't model.
 *
 * The compiler import makes this the slowest file in the package (a few
 * seconds to collect). That's the price of testing the real thing here; keep
 * unit-level work in the cheaper suites.
 */

const SOURCE = [
  "First beat here.",
  "Second beat here.",
  "Third beat here.",
  "Fourth beat here.",
  "Fifth beat here.",
  "",
].join("\n");

const CHOICE_SOURCE = [
  "Pick a path.",
  "choose",
  "  * Left path",
  "    You went left.",
  "  * Right path",
  "    You went right.",
  "end",
  "Done here.",
  "",
].join("\n");

const compile = (source: string) => {
  const uri = "inmemory:///main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return compiler.compile({ textDocument: { uri } } as never).program;
};

let program: ReturnType<typeof compile>;
let choiceProgram: ReturnType<typeof compile>;

beforeAll(() => {
  program = compile(SOURCE);
  choiceProgram = compile(CHOICE_SOURCE);
});

/** A started game, ready to advance. */
const startGame = (p = program) => {
  const game = new Game({
    program: p,
    now: () => 0,
    setTimeout: (handler: Function) => {
      handler();
      return 0;
    },
  } as never);
  game.start();
  return game;
};

/** Advance `times` beats, as clicking to continue would. */
const advance = (game: Game, times: number) => {
  for (let i = 0; i < times; i += 1) {
    game.clickedToContinue();
  }
  return game;
};

describe("Game save/load", () => {
  it("compiles the fixture without diagnostics", () => {
    // If this fails, every other expectation here is meaningless.
    expect(program.diagnostics ?? {}).toEqual({});
    expect(program.compiled).toBeTruthy();
  });

  describe("round-tripping", () => {
    it("restores a freshly started game to an identical save", () => {
      const game = startGame();
      const saved = game.save();
      expect(game.load(saved)).toBe(true);
      expect(game.save()).toBe(saved);
    });

    it("restores a mid-story game to an identical save", () => {
      const game = advance(startGame(), 2);
      const saved = game.save();
      expect(game.load(saved)).toBe(true);
      expect(game.save()).toBe(saved);
    });

    // Guards the two tests above from being vacuous: if every game produced
    // the same save regardless of progress, they'd pass while proving nothing.
    it("produces different saves at different points in the story", () => {
      const atStart = startGame().save();
      const midStory = advance(startGame(), 2).save();
      expect(midStory).not.toBe(atStart);
    });

    it("carries progress into a separate Game instance", () => {
      const original = advance(startGame(), 2);
      const saved = original.save();

      const restored = startGame();
      expect(restored.save()).not.toBe(saved);
      expect(restored.load(saved)).toBe(true);
      expect(restored.save()).toBe(saved);
    });

    it("stays stable across repeated round-trips", () => {
      const game = advance(startGame(), 3);
      const first = game.save();
      game.load(first);
      const second = game.save();
      game.load(second);
      expect(game.save()).toBe(first);
    });
  });

  describe("restored state is usable, not just identical", () => {
    it("restores the current story text", () => {
      const original = advance(startGame(), 2);
      const expectedText = original.story.currentText;

      const restored = startGame();
      restored.load(original.save());
      expect(restored.story.currentText).toBe(expectedText);
    });

    it("restores the paths executed this frame", () => {
      const original = advance(startGame(), 2);
      const expectedPaths = Array.from(
        original.runtimeState.pathsExecutedThisFrame,
      );
      expect(expectedPaths.length).toBeGreaterThan(0);

      const restored = startGame();
      restored.load(original.save());
      expect(Array.from(restored.runtimeState.pathsExecutedThisFrame)).toEqual(
        expectedPaths,
      );
    });

    it("restores every module's state", () => {
      const original = advance(startGame(), 2);
      const saved = JSON.parse(original.save());
      // The save is only meaningful if the modules actually round-trip
      expect(Object.keys(saved.modules).length).toBeGreaterThan(0);

      const restored = startGame();
      restored.load(original.save());
      expect(JSON.parse(restored.save()).modules).toEqual(saved.modules);
    });

    // The strongest property: a restored save doesn't just look the same, it
    // continues the same. Byte-identical state that then diverges on the next
    // step would be a save that silently breaks the story.
    it("continues into the same next beat after restoring", () => {
      const original = advance(startGame(), 2);
      const saved = original.save();

      const restored = startGame();
      restored.load(saved);

      advance(original, 1);
      advance(restored, 1);

      expect(restored.story.currentText).toBe(original.story.currentText);
      expect(restored.save()).toBe(original.save());
    });
  });

  describe("choices", () => {
    it("round-trips after a choice has been made", () => {
      const game = startGame(choiceProgram);
      game.chosePathToContinue(0);
      const saved = game.save();

      const restored = startGame(choiceProgram);
      restored.load(saved);
      expect(restored.save()).toBe(saved);
      expect(restored.story.currentText).toBe(game.story.currentText);
    });

    it("preserves the recorded choice history", () => {
      const game = startGame(choiceProgram);
      game.chosePathToContinue(1);
      const expected = game.runtimeState.choicesEncountered;

      const restored = startGame(choiceProgram);
      restored.load(game.save());
      expect(restored.runtimeState.choicesEncountered).toEqual(expected);
    });
  });

  describe("malformed saves", () => {
    it("reports failure on invalid JSON instead of throwing", () => {
      const game = startGame();
      expect(() => game.load("{not json")).not.toThrow();
      expect(game.load("{not json")).toBe(false);
    });

    it("leaves the game usable after a failed load", () => {
      const game = advance(startGame(), 2);
      const before = game.save();
      game.load("{not json");
      expect(game.save()).toBe(before);
    });
  });
});

describe("RuntimeState", () => {
  it("round-trips executed paths through JSON, preserving order", () => {
    const state = new RuntimeState();
    state.recordExecution("0.1");
    state.recordExecution("0.2");
    state.recordExecution("0.3");

    const restored = RuntimeState.fromJSON(state.toJSON());
    expect(Array.from(restored.pathsExecutedThisFrame)).toEqual([
      "0.1",
      "0.2",
      "0.3",
    ]);
  });

  // The Set is ordered deliberately: re-executing a path moves it to the end
  // so the last entry is always the most recently executed.
  it("moves a re-executed path to the end", () => {
    const state = new RuntimeState();
    state.recordExecution("0.1");
    state.recordExecution("0.2");
    state.recordExecution("0.1");

    const restored = RuntimeState.fromJSON(state.toJSON());
    expect(Array.from(restored.pathsExecutedThisFrame)).toEqual(["0.2", "0.1"]);
  });

  it("ignores global paths", () => {
    const state = new RuntimeState();
    state.recordExecution("global setup");
    state.recordExecution("0.1");

    const restored = RuntimeState.fromJSON(state.toJSON());
    expect(Array.from(restored.pathsExecutedThisFrame)).toEqual(["0.1"]);
  });

  it("round-trips recorded conditions", () => {
    const state = new RuntimeState();
    state.recordCondition(true);
    state.recordCondition(false);

    const restored = RuntimeState.fromJSON(state.toJSON());
    expect(restored.conditionsEncountered).toEqual([
      { selected: true },
      { selected: false },
    ]);
  });

  // clone() must deep-copy: a shallow copy would let a checkpoint mutate the
  // state it was cloned from, which is exactly the kind of aliasing bug that
  // only shows up much later as a corrupted save.
  describe("clone", () => {
    it("does not alias the executed-path set", () => {
      const state = new RuntimeState();
      state.recordExecution("0.1");

      const cloned = RuntimeState.clone(state);
      cloned.recordExecution("0.2");

      expect(Array.from(state.pathsExecutedThisFrame)).toEqual(["0.1"]);
      expect(Array.from(cloned.pathsExecutedThisFrame)).toEqual(["0.1", "0.2"]);
    });

    it("does not alias the recorded choices", () => {
      const state = new RuntimeState();
      state.conditionsEncountered.push({ selected: true });

      const cloned = RuntimeState.clone(state);
      cloned.conditionsEncountered[0]!.selected = false;

      expect(state.conditionsEncountered[0]!.selected).toBe(true);
    });

    it("tolerates being handed no state", () => {
      const cloned = RuntimeState.clone(undefined as never);
      expect(Array.from(cloned.pathsExecutedThisFrame)).toEqual([]);
      expect(cloned.choicesEncountered).toEqual([]);
    });
  });
});
