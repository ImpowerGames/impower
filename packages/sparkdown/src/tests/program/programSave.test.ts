// The durable save of the program engine (#699, docs/engine/binary-program.md,
// sections 7 and 8): the image of the newest beat with every position in the
// saved form, which loads into a fresh game of the same program, in another
// process, after the table was reseeded, and which is refused, naming the
// flow, when a statement it names differs.
import "../../inkjs/engine/Container";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { SAVE_FORMAT } from "../../program/ProgramSave";
import { ProgramStory } from "../../program/ProgramStory";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { compileScript, programSession } from "./programHarness";
import { LOOP_TUNNEL_SCRIPT, SAVE_MARKER } from "./programSaveScripts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "runtime", "fixtures");

const silence = <T>(run: () => T): T => {
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const rootOf = (text: string): ProgramRoot | undefined =>
  silence(() => compileScript(text, { programChunks: true }).program.chunks);

/** A story that keeps its beats' images, as a game does, sharing the
 *  pristine copies of `images` when given, as the engines of one game do. */
const engine = (
  root: ProgramRoot,
  images?: ProgramStory["images"],
  saveHistory?: number,
): ProgramStory => {
  const story = new ProgramStory(root, { images, saveHistory });
  story.keepBeatImages = true;
  story.onError = () => {};
  return story;
};

const shows = (story: ProgramStory) =>
  Boolean(story.currentText?.trim()) ||
  story.currentDisplayInstructions.length > 0;

interface Transcript {
  beats: string[];
  menus: string[][];
  /** Whether the last continue showed something. */
  captioned?: boolean;
}

/** Runs on from where the story stands, taking `picks[n]` at the n-th menu
 *  from `menusTaken` on (the first choice past the end), until the story
 *  ends or `maxMenus` menus were taken; `onBeat` and `onMenu` hear each
 *  beat and each menu as they come. */
const play = (
  story: ProgramStory,
  {
    picks = [],
    menusTaken = 0,
    maxMenus = 6,
    onBeat,
    onMenu,
  }: {
    picks?: number[];
    menusTaken?: number;
    maxMenus?: number;
    onBeat?: (shown: Transcript) => void;
    onMenu?: (shown: Transcript) => void;
  } = {},
): Transcript => {
  const shown: Transcript = { beats: [], menus: [] };
  let taken = menusTaken;
  for (;;) {
    while (story.canContinue) {
      story.Continue();
      shown.captioned = shows(story);
      if (shown.captioned) {
        shown.beats.push(story.currentText?.trim() ?? "");
      }
      onBeat?.(shown);
    }
    const choices = story.currentChoices;
    if (choices.length === 0 || taken >= maxMenus) {
      if (choices.length > 0) {
        shown.menus.push(choices.map((c) => c.text));
      }
      return shown;
    }
    shown.menus.push(choices.map((c) => c.text));
    onMenu?.(shown);
    story.ChooseChoiceIndex((picks[taken] ?? 0) % choices.length);
    taken += 1;
  }
};

const fixtureFiles = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      fixtureFiles(full, out);
    } else if (name.endsWith(".sd")) {
      out.push(full);
    }
  }
  return out;
};

describe("a save taken at any beat of the shared fixtures", () => {
  it("loads into a fresh game of the program compiled again and continues to the same beats, choices and state", () => {
    let fixtures = 0;
    let saves = 0;
    const failures: string[] = [];
    for (const file of fixtureFiles(FIXTURES)) {
      const name = relative(FIXTURES, file);
      const text = readFileSync(file, "utf-8");
      // The game that plays the fixture, and the program compiled again by
      // another compiler, as another process would.
      const played = rootOf(text);
      const again = rootOf(text);
      if (!played || !again) {
        continue;
      }
      fixtures += 1;
      // Saves of one beat, so that the save at the end compares the state
      // the load reached with the uninterrupted run's, and not the beats
      // the two passed.
      const story = engine(played, undefined, 1);
      const taken: { save: string; beats: number; menus: number }[] = [];
      // A beat whose continue raised a menu is the menu's, which `onMenu`
      // takes.
      const take = (shown: Transcript) => {
        if (!story.canContinue && story.currentChoices.length > 0) {
          return;
        }
        taken.push({
          save: story.toSave(),
          beats: shown.beats.length,
          menus: shown.menus.length,
        });
      };
      let whole: Transcript;
      let end: string;
      try {
        taken.push({ save: story.toSave(), beats: 0, menus: 0 });
        whole = silence(() =>
          play(story, {
            onBeat: take,
            // A save at a menu holds the beat before it, which is before
            // the menu's caption, if it has one; the menu is not taken
            // yet.
            onMenu: (shown) =>
              taken.push({
                save: story.toSave(),
                beats: shown.beats.length - (shown.captioned ? 1 : 0),
                menus: shown.menus.length - 1,
              }),
          }),
        );
        end = story.toSave();
      } catch (e) {
        failures.push(`${name}: the run threw ${e}`);
        continue;
      }
      for (const at of taken) {
        saves += 1;
        const loaded = engine(again, undefined, 1);
        try {
          loaded.loadSave(at.save);
          const rest = silence(() => play(loaded, { menusTaken: at.menus }));
          const expected = {
            beats: whole.beats.slice(at.beats),
            menus: whole.menus.slice(at.menus),
          };
          delete rest.captioned;
          if (JSON.stringify(rest) !== JSON.stringify(expected)) {
            failures.push(
              `${name} at beat ${at.beats}, menu ${at.menus}: ${JSON.stringify(rest)} != ${JSON.stringify(expected)}`,
            );
          } else if (loaded.toSave() !== end) {
            failures.push(`${name} at beat ${at.beats}, menu ${at.menus}: the state at the end differs`);
          }
        } catch (e) {
          failures.push(`${name} at beat ${at.beats}, menu ${at.menus}: ${e}`);
        }
      }
    }
    expect(failures).toEqual([]);
    expect(fixtures).toBeGreaterThan(150);
    expect(saves).toBeGreaterThan(fixtures * 2);
  });
});

/** The text of the next beat that shows something. */
const nextBeat = (story: ProgramStory): string => {
  while (story.canContinue) {
    story.Continue();
    if (shows(story)) {
      return story.currentText?.trim() ?? "";
    }
  }
  return "";
};

const choiceTexts = (story: ProgramStory) =>
  story.currentChoices.map((choice) => choice.text);

/** The newest beat of a save, with the globals of the beats up to it put
 *  together as `variablesState`. */
const newestBeat = (save: string): any => {
  const beats = JSON.parse(save).beats as any[];
  const globals: Record<string, unknown> = { ...(beats[0]!.variablesState ?? {}) };
  for (const beat of beats.slice(1)) {
    Object.assign(globals, beat.globals ?? {});
  }
  return { ...beats.at(-1)!, variablesState: globals };
};

describe("a save holds the values of its state", () => {
  it("keeps a table two variables refer to, a define and an instance of one, a symbol value and closures that share a captured variable", () => {
    const text = [
      "store first = { 1, 2 }",
      "store second = nil",
      "store target = -> there",
      "store inc = nil",
      "store get = nil",
      "store pet = nil",
      "define hero as character with",
      '  name = "Hero"',
      "end",
      "define Bird with",
      '  kind = "bird"',
      "  store wings = 2",
      "end",
      "",
      "-> start",
      "",
      "scene start",
      "  & second = first",
      "  & pet = new Bird()",
      "  & pet.wings = 3",
      "  & local function make()",
      "  &   local n = 10",
      "  &   inc = function() n = n + 1 end",
      "  &   get = function() return n end",
      "  & end",
      "  & make()",
      "  & inc()",
      "  Saved {get()} {#first} {character.hero.name}.",
      "  & table.insert(second, 3)",
      "  & inc()",
      "  Then {get()} {#first} {first == second} {pet.kind} {pet.wings}.",
      "  -> target",
      "end",
      "",
      "scene there",
      "  There.",
      "end",
      "",
    ].join("\n");
    const story = engine(rootOf(text)!);
    expect(nextBeat(story)).toBe("Saved 11 2 Hero.");
    const save = story.toSave();
    const loaded = engine(rootOf(text)!);
    loaded.loadSave(save);
    const vars = loaded.variablesState;
    expect(vars.GetVariableWithName("second")).toBe(vars.GetVariableWithName("first"));
    expect(nextBeat(loaded)).toBe("Then 12 3 true bird 3.");
    expect(nextBeat(loaded)).toBe("There.");
  });
});

// A menu whose condition calls an author function that assigns a global,
// raises a count (the function's) and draws a random number. The condition
// is an `if` of the block's preamble that gates the first choice: a choice's
// own `if (...)` does not take a call (the grammar reads the call as the
// choice's text).
const MENU_TEXT = [
  "store calls = 0",
  "store drawn = 0",
  "",
  "function allowed()",
  "  calls = calls + 1",
  "  drawn = math.random(1, 1000)",
  "  return true",
  "end",
  "",
  "-> start",
  "",
  "scene start",
  "  Before the menu.",
  "  choose",
  "    if allowed() then",
  "      * First {calls} {drawn}",
  "    end",
  "    * Second {allowed}",
  "  end",
  "  After {calls} {drawn} {allowed}.",
  "end",
  "",
].join("\n");

describe("a save taken while choices are waiting", () => {
  const MENU = MENU_TEXT;

  it("holds the beat before the menu and none of its choices, and raises the menu as an uninterrupted run does however many times it is loaded", () => {
    const root = rootOf(MENU)!;
    const story = engine(root);
    expect(nextBeat(story)).toBe("Before the menu.");
    story.Continue();
    expect(choiceTexts(story)).toHaveLength(2);
    // The condition ran once: the function's global and its count.
    const calls = (s: ProgramStory) =>
      s.variablesState.GetVariableWithName("calls")?.toString();
    expect(calls(story)).toBe("1");
    const atMenu = story.state.toJson();
    const save = story.toSave();
    expect(newestBeat(save).choices).toBeUndefined();
    // The save is the beat before the condition ran.
    expect(newestBeat(save).variablesState.calls ?? 0).toBe(0);
    // Saving put back the state as it stands.
    expect(story.state.toJson()).toBe(atMenu);
    const loaded = engine(root);
    for (let i = 0; i < 3; i += 1) {
      loaded.loadSave(save);
      expect(loaded.currentChoices).toHaveLength(0);
      loaded.Continue();
      expect(choiceTexts(loaded)).toEqual(choiceTexts(story));
      expect(loaded.state.toJson()).toBe(atMenu);
    }
    loaded.ChooseChoiceIndex(0);
    story.ChooseChoiceIndex(0);
    expect(nextBeat(loaded)).toBe(nextBeat(story));
    expect(nextBeat(loaded)).toBe(nextBeat(story));
    expect(loaded.state.toJson()).toBe(story.state.toJson());
  });

  // The shape of `threads/multi-threads.sd`, and the same with a line the
  // guard's thread displays after the merchant's thread raised its choice,
  // so that the image of that line's beat holds the merchant's choice with
  // its thread.
  const THREADS = (guardSpeaks: boolean) =>
    [
      "-> hub",
      "scene hub",
      "  You arrive at the town square.",
      "  <- merchant",
      "  <- guard",
      "  choose",
      '    * "Leave town"',
      "      fin",
      "  end",
      "end",
      "scene merchant",
      "  choose",
      '    * "What do you sell?"',
      "      Nothing much.",
      "      fin",
      "  end",
      "  done",
      "end",
      "scene guard",
      ...(guardSpeaks ? ["  The guard nods."] : []),
      "  choose",
      '    * "Any news?"',
      "      None.",
      "      fin",
      "  end",
      "  done",
      "end",
      "",
    ].join("\n");

  for (const guardSpeaks of [false, true]) {
    it(`presents every choice three threads contributed, each of which can be chosen${guardSpeaks ? ", with a choice raised before a beat held in its image" : ""}`, () => {
      const root = rootOf(THREADS(guardSpeaks))!;
      const story = engine(root);
      const before: string[] = [];
      while (story.canContinue) {
        story.Continue();
        if (shows(story)) before.push(story.currentText!.trim());
        if (guardSpeaks && before.at(-1) === "The guard nods." && story.canContinue) {
          // The merchant's choice is raised and waits, with its thread.
          expect(story.state.generatedChoices.map((c) => c.text)).toEqual([
            '"What do you sell?"',
          ]);
        }
      }
      const menu = choiceTexts(story);
      expect(menu).toHaveLength(3);
      const save = story.toSave();
      const held = newestBeat(save).choices ?? [];
      expect(held.map((c: { text: string }) => c.text)).toEqual(
        guardSpeaks ? ['"What do you sell?"'] : [],
      );
      menu.forEach((_, index) => {
        const expected = (() => {
          const s = engine(root);
          while (s.canContinue) s.Continue();
          s.ChooseChoiceIndex(index);
          return play(s);
        })();
        const loaded = engine(rootOf(THREADS(guardSpeaks))!);
        loaded.loadSave(save);
        while (loaded.canContinue) loaded.Continue();
        expect(choiceTexts(loaded)).toEqual(menu);
        loaded.ChooseChoiceIndex(index);
        expect(play(loaded)).toEqual(expected);
      });
    });
  }

  it("loads each of two menus in a row with no beat between them", () => {
    const text = [
      "-> start",
      "scene start",
      "  Before.",
      "  choose",
      "    * [One]",
      "  end",
      "  choose",
      "    * [Two]",
      "    * [Three]",
      "  end",
      "  After.",
      "end",
      "",
    ].join("\n");
    const root = rootOf(text)!;
    const story = engine(root);
    expect(nextBeat(story)).toBe("Before.");
    story.Continue();
    expect(choiceTexts(story)).toEqual(["One"]);
    const first = story.toSave();
    story.ChooseChoiceIndex(0);
    story.Continue();
    expect(story.currentText?.trim() ?? "").toBe("");
    expect(choiceTexts(story)).toEqual(["Two", "Three"]);
    const second = story.toSave();
    for (const [save, menus] of [
      [first, [["One"], ["Two", "Three"]]],
      [second, [["Two", "Three"]]],
    ] as const) {
      const loaded = engine(rootOf(text)!);
      loaded.loadSave(save);
      const shown = play(loaded);
      expect(shown.menus).toEqual(menus);
      expect(shown.beats.at(-1)).toBe("After.");
    }
  });

  it("is the same save when taken after a load and before another beat", () => {
    const root = rootOf(MENU)!;
    const story = engine(root);
    nextBeat(story);
    story.Continue();
    const save = story.toSave();
    const loaded = engine(root);
    loaded.loadSave(save);
    expect(loaded.toSave()).toBe(save);
    // And once the load raised the menu again, which is no beat.
    loaded.Continue();
    expect(loaded.toSave()).toBe(save);
  });

  it("taken after a choice was made, loads and continues from that choice", () => {
    const root = rootOf(MENU)!;
    const story = engine(root);
    nextBeat(story);
    story.Continue();
    story.ChooseChoiceIndex(1);
    const checkpoint = story.captureBeat();
    const save = story.toSave();
    const rest = play(story);
    expect(rest.beats[0]).toMatch(/^Second/);
    const restored = engine(root, story.images);
    expect(restored.restore(checkpoint)).toBe(true);
    expect(play(restored)).toEqual(rest);
    const loaded = engine(rootOf(MENU)!);
    loaded.loadSave(save);
    expect(play(loaded)).toEqual(rest);
  });
});

describe("a save at the end", () => {
  const ENDS = [
    "-> start",
    "scene start",
    "  First.",
    "  -> other",
    "end",
    "scene other",
    "  Last of the story.",
    "end",
    "",
  ].join("\n");

  it("at the last beat of a flow, at a final beat and at the end of the story loads and ends where it ended", () => {
    const root = rootOf(ENDS)!;
    const story = engine(root);
    expect(nextBeat(story)).toBe("First.");
    const lastOfFlow = story.toSave();
    expect(nextBeat(story)).toBe("Last of the story.");
    const finalBeat = story.toSave();
    while (story.canContinue) story.Continue();
    const atEnd = story.toSave();
    const load = (save: string) => {
      const loaded = engine(rootOf(ENDS)!);
      loaded.loadSave(save);
      return loaded;
    };
    expect(play(load(lastOfFlow)).beats).toEqual(["Last of the story."]);
    const final = load(finalBeat);
    expect(final.currentText?.trim()).toBe("Last of the story.");
    expect(play(final).beats).toEqual([]);
    const ended = load(atEnd);
    expect(ended.canContinue).toBe(false);
    expect(ended.currentChoices).toHaveLength(0);
  });
});

describe("a save's header", () => {
  const TEXT = "-> start\nscene start\n  One.\n  Two.\nend\n";

  it("names the format's version, the engine's and the game's, empty when the game sets none", () => {
    const story = engine(rootOf(TEXT)!);
    nextBeat(story);
    const plain = JSON.parse(story.toSave());
    expect(plain.format).toBe(SAVE_FORMAT);
    expect(plain.engine).toBe("program");
    expect(typeof plain.engineVersion).toBe("string");
    expect(plain.gameVersion).toBe("");
    const versioned = story.toSave("1.2.0");
    expect(JSON.parse(versioned).gameVersion).toBe("1.2.0");
    const loaded = engine(rootOf(TEXT)!);
    expect(loaded.loadSave(versioned).gameVersion).toBe("1.2.0");
    expect(loaded.loadSave(story.toSave()).gameVersion).toBe("");
  });

  it("refuses a save of a newer format version, naming the version", () => {
    const story = engine(rootOf(TEXT)!);
    nextBeat(story);
    const save = JSON.parse(story.toSave());
    save.format = SAVE_FORMAT + 1;
    const loaded = engine(rootOf(TEXT)!);
    expect(() => loaded.loadSave(JSON.stringify(save))).toThrow(
      new RegExp(`format version ${SAVE_FORMAT + 1}`),
    );
  });

  it("loads the fixture save of each format version that shipped", () => {
    const dir = join(HERE, "fixtures");
    const script = readFileSync(join(dir, "program-save.sd"), "utf-8");
    for (let version = 1; version <= SAVE_FORMAT; version += 1) {
      const save = readFileSync(join(dir, `program-save-v${version}.json`), "utf-8");
      const loaded = engine(rootOf(script)!);
      loaded.loadSave(save);
      expect(play(loaded).beats).toEqual(["Bumped 12.", "The end."]);
    }
  });
});

const session = programSession;

describe("a save in another process", () => {
  const SCRIPT = LOOP_TUNNEL_SCRIPT;

  // Round 1 of the review of #1579 (report 6016969769): the test below
  // loads in the process that wrote the save; this one does not.
  it("written by another process, which reseeded its table, loads here and continues as the writer's run would", () => {
    const writer = join(HERE, "programSaveWriter.ts");
    const viteNode = createRequire(import.meta.url).resolve("vite-node/vite-node.mjs");
    const run = spawnSync(process.execPath, [viteNode, writer], {
      cwd: join(HERE, "..", "..", ".."),
      encoding: "utf-8",
      timeout: 240_000,
      windowsHide: true,
    });
    expect(run.status, run.stderr).toBe(0);
    const line = run.stdout.split("\n").find((l) => l.startsWith(SAVE_MARKER));
    expect(line).toBeDefined();
    const save = line!.slice(SAVE_MARKER.length);
    // This process compiles the program once, with no reseed.
    const here = session(SCRIPT);
    const rest = (() => {
      const story = engine(here.root);
      nextBeat(story);
      nextBeat(story);
      return play(story);
    })();
    const loaded = engine(here.root);
    loaded.loadSave(save);
    expect(play(loaded)).toEqual(rest);
    expect(rest.beats).toEqual(["After 1 1 1."]);
  });

  it("loads at the same statement after the table is reseeded and the program compiled again, every id differing", () => {
    const played = session(SCRIPT);
    const story = engine(played.root);
    expect(nextBeat(story)).toBe("Begin a.");
    expect(nextBeat(story)).toBe("Inside 0.");
    const save = story.toSave();
    // The tunnel's frame returns inside its statement, in the loop's body.
    expect(save).toContain('"loop"');
    const rest = play(story);
    expect(rest.beats).toEqual(["After 1 1 1."]);
    // Another process: a compiler that compiled another program first, then
    // this one, then reseeded and compiled it again.
    const other = session(
      SCRIPT.replace("scene early", "scene before\n  Before.\nend\n\nscene early"),
    );
    other.reseed();
    const root = other.edit("scene before\n  Before.\nend\n\n", "");
    expect(root.generation).toBeGreaterThan(played.root.generation);
    const id = (r: ProgramRoot, name: string) => r.table.symbolIds.get(name);
    for (const name of ["start", "helper", "early"]) {
      expect(id(root, name)).not.toBe(id(played.root, name));
    }
    const loaded = engine(root);
    loaded.loadSave(save);
    expect(play(loaded)).toEqual(rest);
  });

  // #699 refused this save; #1429 places it by the alignment of section 8,
  // since the statement it stands at is unchanged.
  it("loads when a statement of a sequence it names differs by its fingerprint, at the statement it stands at", () => {
    const played = session(SCRIPT);
    const story = engine(played.root);
    nextBeat(story);
    const outside = story.toSave();
    nextBeat(story);
    const save = story.toSave();
    const edited = session(SCRIPT.replace("    total = total + 1", "    total = total + 2"));
    engine(edited.root).loadSave(outside);
    const loaded = engine(edited.root);
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport?.exact).toBe(true);
    expect(loaded.loadedSaveReport?.beat).toBe(2);
    expect(play(loaded).beats).toEqual(["After 2 2 1."]);
  });

  // The source of a statement the same and its code not, as a compiler
  // that lowers it differently makes it: the save's layout hashes, of the
  // loop whose body the frame is in and of the tunnel statement the frame
  // returns inside, are changed in place of the program's.
  it("is placed after the loop or the statement a position is inside when its layout hash differs, with a warning", () => {
    const played = session(SCRIPT);
    // One beat, so that no earlier beat is placed exactly.
    const story = engine(played.root, undefined, 1);
    nextBeat(story);
    nextBeat(story);
    const written = story.toSave();
    const differ = (hash: string) =>
      hash.replace(/^./, (c) => (c === "0" ? "1" : "0"));
    // The frame the tunnel pushed, which returns inside its statement in
    // the loop's body.
    const frameOf = (save: any) =>
      save.beats.at(-1).frames.find((f: { returnTo?: unknown }) => f.returnTo).returnTo;
    const loopOf = (save: any) =>
      frameOf(save).st.levels.find((l: { loop?: string }) => l.loop);
    expect(Array.isArray(frameOf(JSON.parse(written)).a)).toBe(true);
    expect(loopOf(JSON.parse(written))).toBeDefined();
    for (const [change, beats, warning] of [
      // After the loop: the tunnel runs to its return, and the loop's
      // remaining passes are left.
      [
        (save: any) => (loopOf(save).loop = differ(loopOf(save).loop)),
        ["After 0 0 1."],
        /loop/,
      ],
      // After the tunnel's statement: the tunnel runs to its return, and
      // the loop goes on from the statement after it.
      [
        (save: any) => (frameOf(save).a[1] = differ(frameOf(save).a[1])),
        ["After 1 1 1."],
        /resumes after it/,
      ],
    ] as const) {
      const save = JSON.parse(written);
      change(save);
      const text = JSON.stringify(save);
      const loaded = engine(session(SCRIPT).root);
      loaded.loadSave(text);
      expect(loaded.loadedSaveReport?.exact).toBe(false);
      expect(loaded.loadedSaveReport?.warnings.join("\n")).toMatch(warning);
      expect(play(loaded).beats).toEqual(beats);
    }
    // And the save as written loads.
    engine(session(SCRIPT).root).loadSave(written);
  });
});

// Round 1 of the review of #1579 (report 6016565874).
describe("a save at the boundaries the first review found", () => {
  it("keeps the cells a waiting choice's thread borrowed, so a closure and the local it captured stay one variable", () => {
    const text = [
      "store f = nil",
      "",
      "-> hub",
      "scene hub",
      "  You arrive.",
      "  <- merchant",
      "  <- guard",
      "  choose",
      '    * "Leave"',
      "      fin",
      "  end",
      "end",
      "scene merchant",
      "  & local n = 0",
      "  & f = function() return n end",
      "  choose",
      '    * "Ask"',
      "      & n = 1",
      "      Got {n} {f()}.",
      "      fin",
      "  end",
      "  done",
      "end",
      "scene guard",
      "  The guard nods.",
      "  choose",
      '    * "News"',
      "      fin",
      "  end",
      "  done",
      "end",
      "",
    ].join("\n");
    const root = rootOf(text)!;
    const ask = (story: ProgramStory) =>
      story.currentChoices.findIndex((c) => c.text === '"Ask"');
    const story = engine(root);
    while (story.canContinue) story.Continue();
    const save = story.toSave();
    // The image holds the merchant's choice, raised before the guard's line.
    expect((newestBeat(save).choices ?? []).map((c: { text: string }) => c.text)).toEqual([
      '"Ask"',
    ]);
    story.ChooseChoiceIndex(ask(story));
    expect(play(story).beats).toEqual(['"Ask"', "Got 1 1."]);
    const loaded = engine(rootOf(text)!);
    loaded.loadSave(save);
    while (loaded.canContinue) loaded.Continue();
    loaded.ChooseChoiceIndex(ask(loaded));
    expect(play(loaded).beats).toEqual(['"Ask"', "Got 1 1."]);
  });

  it("restores an image taken before a load after the load wrote into a table the program initialized", () => {
    const text = [
      "store t = { 1 }",
      "-> start",
      "scene start",
      "  & t[1] = 2",
      "  Changed {t[1]}.",
      "end",
      "",
    ].join("\n");
    const root = rootOf(text)!;
    const first = (story: ProgramStory) =>
      (story.variablesState.GetVariableWithName("t") as any).value.get("1").value;
    const a = engine(root);
    const before = a.capture();
    const b = engine(root);
    expect(nextBeat(b)).toBe("Changed 2.");
    a.loadSave(b.toSave());
    expect(first(a)).toBe(2);
    expect(a.restore(before)).toBe(true);
    expect(first(a)).toBe(1);
    expect(nextBeat(a)).toBe("Changed 2.");
  });

  it("leaves the state as it was when a save is malformed past what placement checks", () => {
    const root = rootOf(MENU_TEXT)!;
    const story = engine(root);
    nextBeat(story);
    const save = JSON.parse(story.toSave());
    save.beats[0].counts = [null];
    const loaded = engine(root);
    nextBeat(loaded);
    loaded.Continue();
    const before = loaded.state.toJson();
    const choices = choiceTexts(loaded);
    expect(() => loaded.loadSave(JSON.stringify(save))).toThrow();
    expect(loaded.state.toJson()).toBe(before);
    expect(choiceTexts(loaded)).toEqual(choices);
    // And it runs on as it would have.
    loaded.ChooseChoiceIndex(0);
    expect(nextBeat(loaded)).toMatch(/^First 1/);
  });

  it("takes a keyframe of the beat before a menu, which holds none of the menu's choices", () => {
    const root = rootOf(MENU_TEXT)!;
    const story = engine(root);
    expect(nextBeat(story)).toBe("Before the menu.");
    const beat = story.state.toJson();
    story.Continue();
    expect(choiceTexts(story)).toHaveLength(2);
    const atMenu = story.state.toJson();
    const keyframe = story.captureBeat(true);
    expect(keyframe.keyframe).toBe(keyframe);
    expect(keyframe.positional.choices).toHaveLength(0);
    // The state as it stands is put back.
    expect(story.state.toJson()).toBe(atMenu);
    const restored = new ProgramStory(root, { images: story.images });
    restored.onError = () => {};
    expect(restored.restore(keyframe)).toBe(true);
    expect(restored.state.toJson()).toBe(beat);
    restored.Continue();
    expect(restored.state.toJson()).toBe(atMenu);
  });
});
