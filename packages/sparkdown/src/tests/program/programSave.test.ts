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
  silence(() => compileScript(text).program.chunks);

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
  captioned?: boolean;
}

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
      const played = rootOf(text);
      const again = rootOf(text);
      if (!played || !again) {
        continue;
      }
      fixtures += 1;
      const story = engine(played, undefined, 1);
      const taken: { save: string; beats: number; menus: number }[] = [];
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
      "scene start",
      "  & second = first",
      "  & pet = new Bird()",
      "  & pet.wings = 3",
      "  local function make()",
      "    local n = 10",
      "    inc = function() n = n + 1 end",
      "    get = function() return n end",
      "  end",
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

  it("leaves a constant out, and a load takes the constant the program compiled", () => {
    const script = (limit: number) =>
      [
        `const LIMIT = ${limit}`,
        "store count = 1",
        "",
        "scene start",
        "  First {count} of {LIMIT}.",
        "  & count = count + 1",
        "  Then {count} of {LIMIT}.",
        "end",
        "",
      ].join("\n");
    const story = engine(rootOf(script(3))!);
    expect(nextBeat(story)).toBe("First 1 of 3.");
    const save = story.toSave();
    const saved = newestBeat(save).variablesState;
    expect(saved).not.toHaveProperty("LIMIT");
    const loaded = engine(rootOf(script(4))!);
    loaded.loadSave(save);
    expect(nextBeat(loaded)).toBe("Then 2 of 4.");
  });
});

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
    const calls = (s: ProgramStory) =>
      s.variablesState.GetVariableWithName("calls")?.toString();
    expect(calls(story)).toBe("1");
    const atMenu = story.state.toJson();
    const save = story.toSave();
    expect(newestBeat(save).choices).toBeUndefined();
    expect(newestBeat(save).variablesState.calls ?? 0).toBe(0);
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

  const THREADS = (guardSpeaks: boolean) =>
    [
      "scene start",
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
  const TEXT = "scene start\n  One.\n  Two.\nend\n";

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

  it("loads a shipped save whose closures a scene's local function built, with each closure naming nothing", () => {
    const script = [
      "store picks = 0",
      "store shared = { 1 }",
      "store alias = nil",
      "store bump = nil",
      "store peek = nil",
      "",
      "scene start",
      "  & alias = shared",
      "  local function cell()",
      "    local n = 10",
      "    bump = function() n = n + 1 end",
      "    peek = function() return n end",
      "  end",
      "  & cell()",
      "  choose",
      "    * [one]",
      "      & picks = picks + 1",
      "      & table.insert(alias, 2)",
      "      & bump()",
      "    * [two]",
      "  end",
      "  Picked {picks} {shared[1]} {#alias} {peek()}.",
      "  & bump()",
      "  Bumped {peek()}.",
      "  The end.",
      "end",
      "",
    ].join("\n");
    const dir = join(HERE, "fixtures");
    for (const version of [1, 2]) {
      const save = readFileSync(join(dir, `program-save-v${version}.json`), "utf-8");
      const loaded = engine(rootOf(script)!);
      loaded.loadSave(save);
      expect(loaded.loadedSaveReport!.warnings).toContain(
        "A function value of the save (an anonymous function) names nothing in this program.",
      );
      expect(play(loaded).beats).toEqual([]);
    }
  });
});

const session = programSession;

describe("a save in another process", () => {
  const SCRIPT = LOOP_TUNNEL_SCRIPT;

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
    expect(save).toContain('"loop"');
    const rest = play(story);
    expect(rest.beats).toEqual(["After 1 1 1."]);
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

  it("is placed after the loop a position is inside when the loop's layout hash differs, with a warning", () => {
    const played = session(SCRIPT);
    const story = engine(played.root, undefined, 1);
    nextBeat(story);
    nextBeat(story);
    const written = story.toSave();
    const differ = (hash: string) =>
      hash.replace(/^./, (c) => (c === "0" ? "1" : "0"));
    const frameOf = (save: any) =>
      save.beats.at(-1).frames.find((f: { returnTo?: unknown }) => f.returnTo).returnTo;
    const loopOf = (save: any) =>
      frameOf(save).st.levels.find((l: { loop?: string }) => l.loop);
    expect(frameOf(JSON.parse(written)).a).toBe("done");
    expect(loopOf(JSON.parse(written))).toBeDefined();
    const save = JSON.parse(written);
    loopOf(save).loop = differ(loopOf(save).loop);
    const loaded = engine(session(SCRIPT).root);
    loaded.loadSave(JSON.stringify(save));
    expect(loaded.loadedSaveReport?.exact).toBe(false);
    expect(loaded.loadedSaveReport?.warnings.join(" ")).toMatch(/loop/);
    expect(play(loaded).beats).toEqual(["After 0 0 1."]);
    const exact = engine(session(SCRIPT).root);
    exact.loadSave(written);
    expect(exact.loadedSaveReport?.exact).toBe(true);
    expect(play(exact).beats).toEqual(["After 1 1 1."]);
  });
});

describe("a save at the boundaries the first review found", () => {
  it("keeps the cells a waiting choice's thread borrowed, so a closure and the local it captured stay one variable", () => {
    const text = [
      "store f = nil",
      "",
      "scene start",
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
    expect(story.state.toJson()).toBe(atMenu);
    const restored = new ProgramStory(root, { images: story.images });
    restored.onError = () => {};
    expect(restored.restore(keyframe)).toBe(true);
    expect(restored.state.toJson()).toBe(beat);
    restored.Continue();
    expect(restored.state.toJson()).toBe(atMenu);
  });
});
