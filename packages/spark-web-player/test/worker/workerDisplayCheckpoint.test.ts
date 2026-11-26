import type { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `define Hero with
  store hp = 10
  title = "wanderer"
end

store trust = 0
store seen = 0
store names = {}
store hero = nil



scene start
  & trust = trust + 1
  & hero = new Hero()
  HERO:
    The first beat.

  & seen = seen + 1
  & names.first = "hero"
  & hero.hp = hero.hp + 2
  HERO:
    The second beat.

  if trust > 0 then
    & trust = trust + 10
    HERO:
      Trust is {trust}.
  else
    HERO:
      Nobody trusts anyone.
  end

  & seen = seen + 1
  HERO:
    The fourth beat, seen {seen}.

  HERO:
    The last beat, with {names.first}.
end
`;

const SOURCE_UNSAVED = SOURCE.replace(
  "  & hero.hp = hero.hp + 2\n",
  "  & hero.hp = hero.hp + 2\n  & hero.title = \"captain\"\n",
);

const SOURCE_NAMED = SOURCE.replace(
  "store trust = 0\n",
  "define guide with\n  store mood = 1\n  title = \"calm\"\nend\n\nstore trust = 0\n",
).replace(
  "  & hero.hp = hero.hp + 2\n",
  "  & hero.hp = hero.hp + 2\n  & guide.title = \"stern\"\n",
);

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((l) => l.includes(text));
const unsavedLineOf = (text: string) =>
  SOURCE_UNSAVED.split("\n").findIndex((l) => l.includes(text));

type CheckpointGame = Game & {
  loadCheckpoint(checkpoint: unknown): boolean;
  checkpointJson(checkpoint: unknown): string | null;
  newestCheckpoint(): unknown;
};

const held = (game: Game) => {
  const story = game.programStory;
  const hero = story.variablesState.GetVariableWithName("hero") as {
    value?: Map<string, { value?: unknown }>;
    metatable?: { value?: Map<string, { value?: Map<string, { value?: unknown }> }> };
  } | null;
  const own = hero?.value instanceof Map ? hero.value : null;
  const ownTitle = own?.get("title")?.value;
  const guide = story.variablesState.GetVariableWithName("guide") as {
    value?: Map<string, { value?: unknown }>;
  } | null;
  const guideMap = guide?.value instanceof Map ? guide.value : null;
  const classTitle = hero?.metatable?.value?.get("__index")?.value?.get("title")?.value;
  const save = JSON.parse(game.save());
  const saved = JSON.parse(save.story);
  for (const beat of saved.beats) {
    beat.storySeed = "the game's own";
  }
  save.story = saved;
  return {
    save,
    executed: game.runtimeState.pathsExecutedThisFrame.toArray(),
    choices: game.runtimeState.choicesEncountered,
    conditions: game.runtimeState.conditionsEncountered,
    beats: story.beats.length,
    heroOwn: own ? [...own.keys()].filter((k) => !k.startsWith("__")).sort() : null,
    heroTitle: ownTitle ?? classTitle ?? null,
    heroHp: own?.get("hp")?.value ?? null,
    guideTitle: guideMap?.get("title")?.value ?? null,
  };
};

const decided = (state: ReturnType<typeof held>) => ({
  save: state.save,
  executed: state.executed,
  choices: state.choices,
  conditions: state.conditions,
  beats: state.beats,
});

const seedOf = (json: string): number => {
  const beats = JSON.parse(JSON.parse(json).story).beats;
  return beats[beats.length - 1].storySeed;
};

async function walk(
  text: string,
  first: number,
  lines: number[],
  throughSave: boolean,
) {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text }],
    startFrom: { file: MAIN_URI, line: first },
  });
  const loads: ReturnType<typeof held>[] = [];
  const read = vi.spyOn(ProgramStory.prototype, "loadSave");
  try {
    await h.compile();
    const game = h.workerState.gameState.game! as CheckpointGame;
    const loadCheckpoint = game.loadCheckpoint.bind(game);
    game.loadCheckpoint = (checkpoint: unknown) => {
      const json = game.checkpointJson(checkpoint)!;
      const loaded = throughSave ? game.load(json) : loadCheckpoint(checkpoint);
      expect(loaded).toBe(true);
      expect(game.programStory.state.storySeed).toBe(seedOf(json));
      loads.push(held(game));
      return loaded;
    };
    read.mockClear();
    for (const line of lines) {
      await h.select(line);
      await settle(20);
    }
    return { loads, savesRead: read.mock.calls.length };
  } finally {
    read.mockRestore();
    h.dispose();
  }
}

async function loadedBack(text: string, throughSave: boolean) {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text }],
    startFrom: {
      file: MAIN_URI,
      line: text.split("\n").findIndex((l) => l.includes("The last beat")),
    },
  });
  try {
    await h.compile();
    const game = h.workerState.gameState.game! as CheckpointGame;
    const checkpoint = game.newestCheckpoint();
    expect(game.restoreCheckpoint(0)).toBe(true);
    expect(held(game).heroHp).toBe(10);
    const json = game.checkpointJson(checkpoint)!;
    const read = vi.spyOn(ProgramStory.prototype, "loadSave");
    expect(
      throughSave ? game.load(json) : game.loadCheckpoint(checkpoint),
    ).toBe(true);
    const savesRead = read.mock.calls.length;
    read.mockRestore();
    expect(game.programStory.state.storySeed).toBe(seedOf(json));
    return { state: held(game), savesRead };
  } finally {
    h.dispose();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the route's checkpoint, handed to the display", () => {
  it("is neither written as a save nor read back from one", async () => {
    const written = vi.spyOn(ProgramStory.prototype, "saveOfImage");
    const read = vi.spyOn(ProgramStory.prototype, "loadSave");
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf("The last beat") },
    });
    try {
      await h.compile();
      await settle(40);
      expect(h.overlay.textContent).toContain("The last beat, with hero.");
      await h.select(lineOf("The fourth beat"));
      expect(h.overlay.textContent).toContain("The fourth beat, seen 2.");
      await h.select(lineOf("Trust is"));
      expect(h.overlay.textContent).toContain("Trust is 11.");

      expect({
        savesWritten: written.mock.calls.length,
        savesRead: read.mock.calls.length,
      }).toEqual({ savesWritten: 0, savesRead: 0 });
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("holds the beat, story, store values, runtime record and modules a load of its full save holds", async () => {
    const lines = ["The fourth beat", "Trust is", "The first beat", "The last beat"].map(lineOf);
    const inPlace = await walk(SOURCE, lineOf("The last beat"), lines, false);
    const throughSave = await walk(SOURCE, lineOf("The last beat"), lines, true);
    expect(inPlace.loads.length).toBe(4);
    expect(inPlace.savesRead).toBe(0);
    expect(throughSave.savesRead).toBe(4);
    expect(inPlace.loads[0]!.heroOwn).toEqual(["hp"]);
    expect(inPlace.loads[0]!.heroHp).toBe(12);
    expect(inPlace.loads[0]!.heroTitle).toBe("wanderer");
    inPlace.loads.forEach((state, i) => {
      expect({ load: i, state }).toEqual({ load: i, state: throughSave.loads[i] });
    });
  }, 120_000);

  it("keeps an instance property the route wrote, which a load of the save takes from its class", async () => {
    const lines = ["The fourth beat", "The first beat", "The last beat"].map(unsavedLineOf);
    const inPlace = await walk(SOURCE_UNSAVED, unsavedLineOf("The last beat"), lines, false);
    const throughSave = await walk(SOURCE_UNSAVED, unsavedLineOf("The last beat"), lines, true);
    expect(inPlace.loads.length).toBe(3);
    expect(inPlace.savesRead).toBe(0);
    expect(inPlace.loads.map((s) => s.heroTitle)).toEqual(["captain", "wanderer", "captain"]);
    expect(throughSave.loads.map((s) => s.heroTitle)).toEqual(["wanderer", "wanderer", "wanderer"]);
    inPlace.loads.forEach((state, i) => {
      expect({ load: i, state: decided(state) }).toEqual({
        load: i,
        state: decided(throughSave.loads[i]!),
      });
    });
  }, 120_000);

  it("loaded while the story stands at another beat of an earlier run, holds what the display must hold as its full save does", async () => {
    const elsewhere = async (throughSave: boolean) => {
      const h = await createPlayerHarness({
        files: [{ uri: MAIN_URI, text: SOURCE }],
        startFrom: { file: MAIN_URI, line: lineOf("The last beat") },
      });
      try {
        await h.compile();
        const game = h.workerState.gameState.game! as CheckpointGame;
        await h.select(lineOf("The first beat"));
        const checkpoint = game.newestCheckpoint();
        await h.select(lineOf("The last beat"));
        expect(held(game).heroHp).toBe(12);
        const json = game.checkpointJson(checkpoint)!;
        const read = vi.spyOn(ProgramStory.prototype, "loadSave");
        expect(
          throughSave ? game.load(json) : game.loadCheckpoint(checkpoint),
        ).toBe(true);
        const savesRead = read.mock.calls.length;
        read.mockRestore();
        expect(game.programStory.state.storySeed).toBe(seedOf(json));
        return { state: held(game), savesRead };
      } finally {
        h.dispose();
      }
    };
    const inPlace = await elsewhere(false);
    const throughSave = await elsewhere(true);
    expect(inPlace.state.heroHp).toBe(10);
    const unanchored = (state: ReturnType<typeof held>) =>
      JSON.parse(
        JSON.stringify(decided(state), (key, value) =>
          key === "anchor" ? undefined : value,
        ),
      );
    expect(unanchored(inPlace.state)).toEqual(unanchored(throughSave.state));
    expect(inPlace.savesRead).toBe(0);
  }, 120_000);

  it("loaded in place while the story stands at another beat of the same run, holds what its full save holds", async () => {
    const inPlace = await loadedBack(SOURCE, false);
    const throughSave = await loadedBack(SOURCE, true);
    expect(inPlace.savesRead).toBe(0);
    expect(inPlace.state.heroHp).toBe(12);
    expect(inPlace.state).toEqual(throughSave.state);
  }, 120_000);

  it("keeps a named define's property the route wrote, which a load of the save leaves as the table holds it", async () => {
    const inPlace = await loadedBack(SOURCE_NAMED, false);
    const throughSave = await loadedBack(SOURCE_NAMED, true);
    expect(inPlace.savesRead).toBe(0);
    expect(inPlace.state.guideTitle).toBe("stern");
    expect(throughSave.state.guideTitle).toBe("calm");
    expect(decided(inPlace.state)).toEqual(decided(throughSave.state));
  }, 120_000);

  it("after an edit, keeps a table the story shares as one table", async () => {
    const text = `store bag = { n = 0 }
define link with
  contents = bag
end



scene start
  & bag.n = 7
  HERO:
    The first beat.

  HERO:
    The middle beat.

  HERO:
    The last beat, {bag.n}.
end
`;
    const last = text.split("\n").findIndex((l) => l.includes("The last beat"));
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text }],
      startFrom: { file: MAIN_URI, line: last },
    });
    try {
      await h.compile();
      await settle(40);
      expect(h.overlay.textContent).toContain("The last beat, 7.");
      const game = h.workerState.gameState.game!;
      const engine = game.programStory;
      const read = vi.spyOn(ProgramStory.prototype, "loadSave");
      const line = "    The last beat, {bag.n}.";
      await h.edit([
        {
          range: { start: { line: last, character: 0 }, end: { line: last, character: line.length } },
          text: "    The last beat, edited, {bag.n}.",
        },
      ]);
      await h.compile();
      await settle(40);
      expect(h.overlay.textContent).toContain("The last beat, edited, 7.");
      expect(game.programStory === engine).toBe(false);
      const variables = game.programStory.variablesState;
      const bag = variables.GetVariableWithName("bag") as unknown as {
        value: Map<string, { value?: unknown }>;
      };
      const link = variables.GetVariableWithName("link") as unknown as {
        value: Map<string, unknown>;
      };
      const contents = link.value.get("contents") as typeof bag;
      expect(bag.value.get("n")?.value).toBe(7);
      expect(contents.value.get("n")?.value).toBe(7);
      expect(contents === bag).toBe(true);
      expect(read.mock.calls.length).toBe(0);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("taken in a program the game no longer holds, loads as its full save does", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf("The fourth beat") },
    });
    try {
      await h.compile();
      const game = h.workerState.gameState.game! as CheckpointGame;
      const checkpoint = game.newestCheckpoint();
      expect(checkpoint == null).toBe(false);
      expect(game.checkpointJson(checkpoint) === game.checkpoints.at(-1)).toBe(true);
      const line = lineOf("The first beat.");
      const text = "    The first beat.";
      await h.edit([
        {
          range: {
            start: { line, character: 0 },
            end: { line, character: text.length },
          },
          text: "    The first beat, edited.",
        },
      ]);
      await h.compile();
      const json = game.checkpointJson(checkpoint);
      expect(json).toBeTruthy();
      expect(game.load(json!)).toBe(true);
      const save = game.save();
      const read = vi.spyOn(ProgramStory.prototype, "loadSave");
      expect(game.loadCheckpoint(checkpoint)).toBe(true);
      expect(read.mock.calls.length).toBe(1);
      expect(game.save()).toBe(save);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("shows the same beat as a display that loads the full save", async () => {
    const show = async (throughSave: boolean) => {
      const h = await createPlayerHarness({
        files: [{ uri: MAIN_URI, text: SOURCE }],
        startFrom: { file: MAIN_URI, line: lineOf("The last beat") },
      });
      const shown: ReturnType<typeof h.snapshotDOM>[] = [];
      try {
        await h.compile();
        const game = h.workerState.gameState.game! as CheckpointGame;
        if (throughSave) {
          game.loadCheckpoint = (checkpoint: unknown) =>
            game.load(game.checkpointJson(checkpoint)!);
        }
        for (const beat of ["The fourth beat", "The first beat", "The last beat"]) {
          await h.select(lineOf(beat));
          await settle(40);
          shown.push(h.snapshotDOM());
        }
      } finally {
        h.dispose();
      }
      return shown;
    };
    const inPlace = await show(false);
    const throughSave = await show(true);
    expect(inPlace.length).toBe(3);
    expect(inPlace).toEqual(throughSave);
  }, 120_000);
});
