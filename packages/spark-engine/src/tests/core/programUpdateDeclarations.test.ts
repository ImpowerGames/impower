import { afterEach, describe, expect, it, vi } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { VariablesState } from "@impower/sparkdown/src/runtime/VariablesState";
import { Game } from "../../game/core/classes/Game";

const URI = "file:///main.sd";

const SOURCE = `store base_speed = 5

function boost()
  return 2
end

store boosted = boost()

const LIMIT = 3

define pace as config with
  speed = base_speed
end

define hero as character with
  name = "Hero"
end

-> start

scene start
  Action line.

  HERO:
    [[hero_concerned:gloves]]
    Line one of dialogue.

  & base_speed = 6

  Last line.
end
`;

function quiet<T>(fn: () => T): T {
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

const posAt = (text: string, offset: number) => {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
};

function session(initial: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: initial,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  let text = initial;
  let version = 1;
  const compile = () =>
    quiet(() => compiler.compile({ textDocument: { uri: URI } }))
      .program as SparkProgram;
  return {
    compile,
    edit(find: string, replace: string): SparkProgram {
      const offset = text.indexOf(find);
      expect(offset, `"${find}" is in the text`).toBeGreaterThanOrEqual(0);
      version += 1;
      compiler.updateDocument({
        textDocument: { uri: URI, version },
        contentChanges: [
          {
            range: {
              start: posAt(text, offset),
              end: posAt(text, offset + find.length),
            },
            text: replace,
          },
        ],
      } as never);
      text = text.slice(0, offset) + replace + text.slice(offset + find.length);
      return compile();
    },
  };
}

const makeGame = (program: SparkProgram) =>
  quiet(
    () =>
      new Game({
        program,
        now: () => 0,
        setTimeout: (fn: () => void) => {
          fn();
          return 0;
        },
        resolve: (path: string) => path,
        fetch: async () => "",
        log: () => {},
      } as never),
  );

const context = (game: Game) => game.context as Record<string, any>;

const globalsOf = (game: Game) => {
  const variables = game.programStory.variablesState;
  const value = (name: string): unknown =>
    (variables.GetVariableWithName(name) as { valueObject?: unknown } | null)
      ?.valueObject;
  return {
    base_speed: value("base_speed"),
    boosted: value("boosted"),
    LIMIT: value("LIMIT"),
  };
};

function update(game: Game, program: SparkProgram) {
  const snapshot = vi.spyOn(VariablesState.prototype, "SnapshotDefaultGlobals");
  const builds = game.definesContextBuilds;
  try {
    quiet(() => game.updateProgram(program));
    return {
      declarations: game.programStory.declarationsRun,
      snapshots: snapshot.mock.calls.length,
      builds: game.definesContextBuilds - builds,
    };
  } finally {
    snapshot.mockRestore();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a game given a program that runs the same declarations (#1759)", () => {
  it.each([
    ["a line of dialogue", "Line one of dialogue.", "Line one, rewritten."],
    ["a word of a portrait directive", "hero_concerned", "hero_worried"],
  ])(
    "runs no declaration, walks no init table and keeps its defines for an edit to %s",
    (_name, find, replace) => {
      const s = session(SOURCE);
      const game = makeGame(s.compile());
      expect(game.programStory.declarationsRun).toBeGreaterThan(0);
      const defines = context(game)["character"];

      const second = s.edit(find, replace);
      expect(second.changes?.chunks?.initializers).toBe(false);
      expect(update(game, second)).toEqual({
        declarations: 0,
        snapshots: 0,
        builds: 0,
      });
      expect(context(game)["character"]).toBe(defines);
      expect(context(game)["character"]?.["hero"]?.["name"]).toBe("Hero");
      expect(context(game)["config"]?.["pace"]?.["speed"]).toBe(5);
      expect(globalsOf(game)).toEqual({ base_speed: 5, boosted: 2, LIMIT: 3 });

      expect(update(game, s.edit("Last line.", "The last line."))).toEqual({
        declarations: 0,
        snapshots: 0,
        builds: 0,
      });
      expect(context(game)["character"]).toBe(defines);
    },
  );

  it("keeps its defines although a directive's word moved the context revision", () => {
    const s = session(SOURCE);
    const first = s.compile();
    const game = makeGame(first);
    const second = s.edit("hero_concerned", "hero_worried");
    expect(second.contextRevision).not.toBe(first.contextRevision);
    expect(update(game, second).builds).toBe(0);
    expect(
      context(game)["filtered_image"]?.["hero_worried~gloves"],
    ).toBeDefined();
  });

  it("takes over the tables the declarations built, with their anchors, and hands the next reset a fresh run", () => {
    const s = session(SOURCE);
    const game = makeGame(s.compile());
    const before = game.programStory;
    const anchors = before.variablesState.InitTableAnchors();
    const [name, table] = [...before.variablesState.Declared.roots][0]!;

    update(game, s.edit("Last line.", "The last line."));
    const story = game.programStory;
    expect(story).not.toBe(before);
    expect(story.declarationsCarried).toBe(true);
    expect(story.variablesState.InitTableAnchors()).toBe(anchors);
    expect(story.variablesState.globalEntries.get(name)).toBe(table);
    expect(story.stateIsPristine).toBe(false);

    quiet(() => story.ResetState());
    expect(story.declarationsCarried).toBe(false);
    expect(story.declarationsRun).toBeGreaterThan(0);
    expect(story.stateIsPristine).toBe(true);
    expect(story.variablesState.InitTableAnchors()).not.toBe(anchors);
    expect(story.variablesState.globalEntries.get(name)).not.toBe(table);
    expect(globalsOf(game)).toEqual({ base_speed: 5, boosted: 2, LIMIT: 3 });
  });

  it("restores a checkpoint taken before the update, and saves what a game that ran the declarations saves", () => {
    const s = session(SOURCE);
    const game = makeGame(s.compile());
    const story = game.programStory;
    quiet(() => {
      story.Continue();
      game.checkpoint();
    });
    const checkpoint = game.checkpoints.length - 1;
    quiet(() => {
      while (story.canContinue) story.Continue();
    });
    expect(globalsOf(game).base_speed).toBe(6);

    const second = s.edit("Line one of dialogue.", "Line one, rewritten.");
    expect(update(game, second).declarations).toBe(0);
    expect(globalsOf(game).base_speed).toBe(6);
    expect(quiet(() => game.restoreCheckpoint(checkpoint))).toBe(true);
    expect(globalsOf(game)).toEqual({ base_speed: 5, boosted: 2, LIMIT: 3 });
    quiet(() => {
      while (game.programStory.canContinue) game.programStory.Continue();
    });
    expect(globalsOf(game).base_speed).toBe(6);

    const saved = quiet(() => game.save());
    const fresh = makeGame(second);
    quiet(() => fresh.load(saved));
    expect(globalsOf(fresh)).toEqual(globalsOf(game));
    expect(JSON.parse(quiet(() => fresh.save())).story).toEqual(
      JSON.parse(saved).story,
    );
  });
});

const GUIDE = `define guide with
  store mood = 1
  title = "calm"
end

-> start
scene start
  Before.
  Restored {guide.title}.
  & guide.title = "stern"
  After.
end
`;

const guideTitle = (game: Game) =>
  (
    game.programStory.variablesState.GetVariableWithName("guide") as {
      value?: Map<string, { valueObject?: unknown }>;
    } | null
  )?.value?.get("title")?.valueObject;

describe("a save loaded after an update that carried the declarations (#1759)", () => {
  it("rebuilds the properties a save does not hold, as a load after a fresh run does", () => {
    const s = session(GUIDE);
    const game = makeGame(s.compile());
    const story = game.programStory;
    quiet(() => story.Continue());
    const saved = quiet(() => game.save());
    quiet(() => {
      while (story.canContinue) story.Continue();
    });
    expect(guideTitle(game)).toBe("stern");

    const second = s.edit("After.", "After edited.");
    expect(update(game, second).declarations).toBe(0);
    quiet(() => game.load(saved));
    expect(guideTitle(game)).toBe("calm");
    const shown: string[] = [];
    quiet(() => {
      while (game.programStory.canContinue) {
        shown.push(game.programStory.Continue() ?? "");
      }
    });
    expect(shown.join("")).toContain("Restored calm.");

    const fresh = makeGame(second);
    quiet(() => fresh.load(saved));
    expect(guideTitle(fresh)).toBe("calm");
  });

});

describe("a game whose constant holds a table (#1759)", () => {
  const limits = (write: string) => `const LIMITS = { cap = 3 }
store visits = 0

-> start
scene start
  Before.
  ${write}
  After.
end
`;
  const capOf = (game: Game) =>
    (
      game.programStory.variablesState.GetVariableWithName("LIMITS") as {
        value?: Map<string, { valueObject?: unknown }>;
      } | null
    )?.value?.get("cap")?.valueObject;

  it("carries the run while the story leaves the table as declared, reading nothing of it", () => {
    const s = session(limits("& visits = 1"));
    const game = makeGame(s.compile());
    const story = game.programStory;
    quiet(() => {
      while (story.canContinue) story.Continue();
      game.checkpoint();
    });
    const map = (
      story.variablesState.GetVariableWithName("LIMITS") as unknown as {
        value: Map<string, unknown>;
      }
    ).value as Map<string, unknown> & Record<PropertyKey, unknown>;
    let reads = 0;
    for (const name of [
      "get",
      "has",
      "forEach",
      "entries",
      "keys",
      "values",
      Symbol.iterator,
    ] as const) {
      const original = (Map.prototype as any)[name] as Function;
      map[name] = function (this: unknown, ...args: unknown[]) {
        reads += 1;
        return original.apply(this, args);
      };
    }
    const ran = update(game, s.edit("After.", "After edited."));
    expect(reads).toBe(0);
    for (const name of [
      "get",
      "has",
      "forEach",
      "entries",
      "keys",
      "values",
      Symbol.iterator,
    ] as const) {
      delete map[name];
    }
    expect(ran.declarations).toBe(0);
    expect(
      quiet(() => game.restoreCheckpoint(game.checkpoints.length - 1)),
    ).toBe(true);
    expect(capOf(game)).toBe(3);
  });

  it("runs the declarations once the story wrote in it, and a checkpoint restores the constant as compiled", () => {
    const s = session(limits("& LIMITS.cap = 9"));
    const game = makeGame(s.compile());
    const story = game.programStory;
    quiet(() => {
      while (story.canContinue) story.Continue();
      game.checkpoint();
    });
    expect(capOf(game)).toBe(9);

    const ran = update(game, s.edit("After.", "After edited."));
    expect(
      quiet(() => game.restoreCheckpoint(game.checkpoints.length - 1)),
    ).toBe(true);
    expect(capOf(game)).toBe(3);
    expect(ran.declarations).toBeGreaterThan(0);
  });

  it("runs the declarations after a load that merged into a table a constant reaches", () => {
    const s = session(`const LIMITS = { cap = 3 }
store guide = LIMITS

-> start
scene start
  Before.
  After.
end
`);
    const game = makeGame(s.compile());
    const story = game.programStory;
    quiet(() => story.Continue());
    const save = JSON.parse(quiet(() => game.save()));
    const storySave = JSON.parse(save.story);
    for (const beat of storySave.beats) {
      if (beat.variablesState) {
        beat.variablesState.guide = { obj: { cap: 9 }, defself: "guide" };
      }
    }
    save.story = JSON.stringify(storySave);
    quiet(() => game.load(JSON.stringify(save)));
    expect(capOf(game)).toBe(9);
    quiet(() => {
      while (game.programStory.canContinue) game.programStory.Continue();
      game.checkpoint();
    });

    const ran = update(game, s.edit("After.", "After edited."));
    expect(
      quiet(() => game.restoreCheckpoint(game.checkpoints.length - 1)),
    ).toBe(true);
    expect(capOf(game)).toBe(3);
    expect(ran.declarations).toBeGreaterThan(0);
  });
});

describe("a game given a program that changes a declaration (#1759)", () => {
  it.each([
    {
      name: "a define's value",
      find: "speed = base_speed",
      replace: "speed = 9",
      check: (game: Game) =>
        expect(context(game)["config"]?.["pace"]?.["speed"]).toBe(9),
    },
    {
      name: "a store a define reads",
      find: "store base_speed = 5",
      replace: "store base_speed = 8",
      check: (game: Game) => {
        expect(context(game)["config"]?.["pace"]?.["speed"]).toBe(8);
        expect(globalsOf(game).base_speed).toBe(8);
      },
    },
    {
      name: "a const",
      find: "const LIMIT = 3",
      replace: "const LIMIT = 4",
      check: (game: Game) => expect(globalsOf(game).LIMIT).toBe(4),
    },
    {
      name: "a top-level function",
      find: "return 2",
      replace: "return 7",
      check: (game: Game) => expect(globalsOf(game).boosted).toBe(7),
    },
    {
      name: "a character's name",
      find: 'name = "Hero"',
      replace: 'name = "Heroine"',
      check: (game: Game) =>
        expect(context(game)["character"]?.["hero"]?.["name"]).toBe("Heroine"),
    },
  ])("runs every declaration and rebuilds the defines for an edit to $name", ({ find, replace, check }) => {
    const s = session(SOURCE);
    const game = makeGame(s.compile());
    const second = s.edit(find, replace);
    expect(second.changes?.chunks?.initializers).toBe(true);
    const ran = update(game, second);
    expect(ran.declarations).toBeGreaterThan(0);
    expect(ran.snapshots).toBe(1);
    expect(ran.builds).toBe(1);
    expect(game.programStory.declarationsCarried === true).toBe(false);
    expect(game.programStory.stateIsPristine).toBe(true);
    check(game);
  });
});
