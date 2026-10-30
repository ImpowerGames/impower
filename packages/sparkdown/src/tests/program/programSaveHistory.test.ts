import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { buildPreviewFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import type { ObjectValue } from "../../runtime/Value";
import type { ProgramRoot } from "../../program/ProgramRoot";
import {
  BEAT_DECISIONS_FIXED,
  BEAT_REWIND_FLOOR,
  BEAT_WAITED,
} from "../../program/ProgramSave";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, programSession } from "./programHarness";
import { SAVE_SCENARIOS, SCENARIO_MARKER } from "./programSaveScenarios";

const HERE = dirname(fileURLToPath(import.meta.url));

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

const rootOf = (text: string): ProgramRoot => {
  const program = silence(() => compileScript(text).program);
  expect(program.chunks).toBeDefined();
  return program.chunks!;
};

const engine = (
  root: ProgramRoot,
  options: { saveHistory?: number; rewindBeats?: number } = {},
): ProgramStory => {
  const story = new ProgramStory(root, options);
  story.keepBeatImages = true;
  story.onError = () => {};
  return story;
};

const shown = (story: ProgramStory) => story.currentText?.trim() ?? "";

const advance = (story: ProgramStory, count: number, onBeat?: (n: number) => void): string[] => {
  const out: string[] = [];
  while (story.canContinue && out.length < count) {
    story.Continue();
    if (shown(story)) {
      out.push(shown(story));
      onBeat?.(out.length);
    }
  }
  return out;
};

const play = (story: ProgramStory, picks: number[] = []): string[] => {
  const beats: string[] = [];
  for (let guard = 0; guard < 2000; guard += 1) {
    while (story.canContinue) {
      story.Continue();
      if (shown(story)) beats.push(shown(story));
    }
    if (story.currentChoices.length === 0 || picks.length === 0) break;
    story.ChooseChoiceIndex(picks.shift()!);
  }
  return beats;
};

const global = (story: ProgramStory, name: string) =>
  story.variablesState.GetVariableWithName(name);

const field = (table: unknown, key: string) =>
  ((table as ObjectValue).value as Map<string, any>).get(key)?.value;

let saves: Record<string, string> = {};

beforeAll(() => {
  const writer = join(HERE, "programSaveWriter.ts");
  const viteNode = createRequire(import.meta.url).resolve("vite-node/vite-node.mjs");
  const run = spawnSync(process.execPath, [viteNode, writer, "--scenarios"], {
    cwd: join(HERE, "..", "..", ".."),
    encoding: "utf-8",
    timeout: 300_000,
    windowsHide: true,
  });
  expect(run.status, run.stderr).toBe(0);
  for (const line of run.stdout.split("\n")) {
    if (line.startsWith(SCENARIO_MARKER)) {
      const tab = line.indexOf("\t");
      saves[line.slice(SCENARIO_MARKER.length, tab)] = line.slice(tab + 1);
    }
  }
  expect(Object.keys(saves).sort()).toEqual(Object.keys(SAVE_SCENARIOS).sort());
}, 320_000);

describe("a save holds the last saveHistory beats", () => {
  const LONG = SAVE_SCENARIOS["long"]!.script;
  const cut = () =>
    rootOf(LONG.split("\n").filter((line) => !/^ {2}Line (1[2-9]|2\d|30)\.$/.test(line)).join("\n"));

  const fallsBackToTheOldest = (save: string) => {
    const loaded = engine(cut());
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    expect(report.beats).toBe(16);
    expect(report.beat).toBe(0);
    expect(report.exact).toBe(true);
    expect(shown(loaded)).toBe("Line 10.");
    expect(play(loaded)).toEqual(["Line 11."]);
  };

  it("whatever the keyframe interval: with the newest statements deleted, a save falls back to the oldest of the last 16 beats across two keyframe intervals, and again after a load", () => {
    const story = engine(rootOf(LONG));
    advance(story, 25, (n) => {
      if (n % 7 === 0) story.captureBeat(true);
    });
    const held = story.beats.slice(-16).map((record) => record.image.keyframe);
    expect(new Set(held).size).toBeGreaterThanOrEqual(3);
    const save = story.toSave();
    expect(JSON.parse(save).beats).toHaveLength(16);
    fallsBackToTheOldest(save);
    const loaded = engine(rootOf(LONG));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.beat).toBe(15);
    expect(loaded.beats).toHaveLength(16);
    const again = loaded.toSave();
    expect(JSON.parse(again).beats).toHaveLength(16);
    fallsBackToTheOldest(again);
  });

  it("written by another process, which took a keyframe every seven beats, falls back to the oldest of them here", () => {
    fallsBackToTheOldest(saves["long"]!);
  });

  it("restores an older beat's heap in a fresh process: a table two globals refer to, a table the keyframe wrote first written after it, a table and a cell made after it, and two closures that share the cell", () => {
    const save = saves["heap"]!;
    const beats = JSON.parse(save).beats;
    expect(JSON.stringify(beats[0].variablesState)).toContain('"u"');
    const text = SAVE_SCENARIOS["heap"]!.script.replace(
      [
        "  Beat 4 {t.n} {late.w} {get()}.",
        "  & t.n = t.n + 1",
        "  & alias = t",
        "  Beat 5 {t.n}.",
      ].join("\n"),
      "  Report {t.n} {late.w} {get()} {alias == t} {uAlias == u}.",
    );
    const loaded = engine(rootOf(text));
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    expect(report.beat).toBe(report.beats - 2);
    expect(shown(loaded)).toBe("Beat 3 2 5 1 1.");
    const t = global(loaded, "t");
    expect(field(t, "n")).toBe(2);
    expect(global(loaded, "alias")).toBe(t);
    const u = global(loaded, "u");
    expect(field(u, "v")).toBe(5);
    expect(global(loaded, "uAlias")).toBe(u);
    expect(field(global(loaded, "late"), "w")).toBe(1);
    expect(play(loaded)).toEqual(["Report 3 2 2 true true."]);
  });
});

describe("a beat's delta", () => {
  it("writes a table whose entries changed, however its keys and values read when joined", () => {
    const text = [
      'store t = { a = "b=StringValue:c" }',
      "",
      "",
      "",
      "scene start",
      "  One.",
      "  & t.a = nil",
      '  & t["a=StringValue:b"] = "c"',
      "  Two.",
      '  Three {t.a == nil} {t["a=StringValue:b"]}.',
      "end",
      "",
    ].join("\n");
    const story = engine(rootOf(text));
    expect(advance(story, 2)).toEqual(["One.", "Two."]);
    const save = story.toSave();
    const loaded = engine(rootOf(text));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.beat).toBe(loaded.loadedSaveReport!.beats - 1);
    expect(play(loaded)).toEqual(["Three true c."]);
  });
});

describe("a beat's delta of a define", () => {
  it("takes out a store field assigned nil since the beat before, which reads as it did", () => {
    const text = [
      "define hero as character with",
      '  name = "Hero"',
      '  store mood = "calm"',
      "end",
      "",
      "",
      "",
      "scene start",
      '  & character.hero.mood = "glad"',
      "  One {character.hero.mood}.",
      "  & character.hero.mood = nil",
      "  Two {character.hero.mood}.",
      "  Three {character.hero.mood}.",
      "end",
      "",
    ].join("\n");
    const story = engine(rootOf(text));
    expect(advance(story, 2)).toEqual(["One glad.", "Two nil."]);
    const save = story.toSave();
    expect(JSON.parse(save).beats.length).toBeGreaterThan(2);
    const loaded = engine(rootOf(text));
    loaded.loadSave(save);
    expect(play(loaded)).toEqual(["Three nil."]);
  });
});

describe("what the rewind Feature reads at each beat", () => {
  const TEXT = [
    "store pool = { \"a\", \"b\", \"c\", \"d\", \"e\", \"f\", \"g\", \"h\" }",
    "",
    "",
    "",
    "scene start",
    "  First.",
    "  # mood: tense",
    '  Draws {math.random(1, 1000)} {shuffle|"one"|"two"|"three"|"four"} {pool:random()}.',
    '  Again {math.random(1, 1000)} {shuffle|"one"|"two"|"three"|"four"} {pool:random()}.',
    "  choose",
    "    * [Left]",
    "      Went left.",
    "    * [Right]",
    "      Went right.",
    "  end",
    "end",
    "",
  ].join("\n");

  const table = (value: ObjectValue) =>
    JSON.stringify([...((value.value as Map<string, any>) ?? new Map())].map(([k, v]) => [k, String(v?.value ?? v)]));

  it("restoring an earlier beat's image draws again what the run drew, re-presents its line, tags and display tables without running it, and reaches the same menu with the recorded choice matched by its Choice address", () => {
    const story = engine(rootOf(TEXT));
    expect(advance(story, 1)).toEqual(["First."]);
    const first = story.beats.at(-1)!;
    const draws = advance(story, 1);
    const tags = story.currentTags.slice();
    const tables = story.currentDisplayInstructions.map(table);
    const drawn = story.beats.at(-1)!;
    expect(tags).toEqual(["mood: tense"]);
    const again = advance(story, 1);
    story.Continue();
    const menu = story.currentChoices.map((c) => c.text);
    expect(menu).toEqual(["Left", "Right"]);
    const right = Number(story.currentChoices[1]!.sourcePath);
    story.ChooseChoiceIndex(1);
    const atMenu = story.beats.at(-1)!;
    expect(atMenu.decisions).toEqual([right]);
    expect(atMenu.image.beat).toBe(atMenu);
    const steps = story.stepCount;
    expect(story.restore(drawn.image)).toBe(true);
    expect(story.stepCount).toBe(steps);
    expect(shown(story)).toBe(draws[0]);
    expect(story.currentTags).toEqual(tags);
    expect(story.currentDisplayInstructions.map(table)).toEqual(tables);
    expect(story.restore(first.image)).toBe(true);
    expect(advance(story, 2)).toEqual([...draws, ...again]);
    story.Continue();
    expect(story.currentChoices.map((c) => c.text)).toEqual(menu);
    expect(story.currentChoices.map((c) => Number(c.sourcePath))).toContain(atMenu.decisions[0]);
  });

  it("a beat's image and a save carry the beat's three flags and the decisions taken at it", () => {
    const story = engine(rootOf(TEXT));
    advance(story, 2);
    story.setBeatFlags(BEAT_WAITED | BEAT_REWIND_FLOOR);
    const floor = story.beats.at(-1)!;
    expect(floor.image.beat?.flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
    advance(story, 1);
    story.Continue();
    story.setBeatFlags(BEAT_WAITED | BEAT_DECISIONS_FIXED);
    story.ChooseChoiceIndex(1);
    const save = story.toSave();
    const beats = JSON.parse(save).beats;
    expect(beats.at(-2).flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
    expect(beats.at(-1).flags).toBe(BEAT_WAITED | BEAT_DECISIONS_FIXED);
    expect(beats.at(-1).decisions).toHaveLength(1);
    expect(beats.at(-1).decisions[0].a.ch[2]).toBe(1);
    const loaded = engine(rootOf(TEXT));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.chosen).toBe("taken");
    const records = loaded.beats;
    expect(records.at(-2)!.flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
    const menu = records.at(-1)!;
    expect(menu.flags).toBe(BEAT_WAITED | BEAT_DECISIONS_FIXED);
    expect(menu.image.beat).toBe(menu);
    expect(menu.decisions).toHaveLength(1);
    expect(play(loaded)).toEqual(["Went right."]);
  });

  it("the story keeps the last rewindBeats beats restorable during play", () => {
    const story = engine(rootOf(SAVE_SCENARIOS["long"]!.script), { rewindBeats: 10 });
    expect(advance(story, 15)).toHaveLength(15);
    expect(story.beats).toHaveLength(10);
    const oldest = story.beats[0]!;
    expect(story.restore(oldest.image)).toBe(true);
    expect(shown(story)).toBe("Line 6.");
    expect(story.beats).toHaveLength(1);
    expect(advance(story, 2)).toEqual(["Line 7.", "Line 8."]);
  });

  const PLAYTHROUGHS = (withOld: boolean) =>
    [
      "store gold = 0",
      "",
      ...(withOld ? ["scene old", "  Old one.", "  Old two.", "  Old three.", "end", ""] : []),
      "scene new",
      "  New one.",
      "  New two.",
      "  New three.",
      "end",
      "",
    ].join("\n");

  it("a rewind to a checkpoint of a playthrough a reset ended keeps none of the beats played since", () => {
    const story = engine(rootOf(PLAYTHROUGHS(true)));
    story.ChoosePathString("old");
    expect(advance(story, 2)).toEqual(["Old one.", "Old two."]);
    const checkpoint = story.captureBeat();
    story.ResetState();
    story.ChoosePathString("new");
    expect(advance(story, 3)).toEqual(["New one.", "New two.", "New three."]);
    expect(story.restore(checkpoint)).toBe(true);
    expect(advance(story, 1)).toEqual(["Old three."]);
    const save = story.toSave();
    const flows = JSON.parse(save).beats.map((beat: any) => beat.position.st.levels[0].flow);
    expect(flows).not.toContain("new");
    let refused: unknown;
    try {
      engine(rootOf(PLAYTHROUGHS(false))).loadSave(save);
    } catch (e) {
      refused = e;
    }
    expect((refused as { flow?: string } | undefined)?.flow).toBe("old");
  });

  it("a rewind to a checkpoint taken before the host wrote to its beat keeps that beat's record, flags included, and takes it once", () => {
    const story = engine(rootOf(PLAYTHROUGHS(true)));
    story.ChoosePathString("new");
    expect(advance(story, 1)).toEqual(["New one."]);
    story.setBeatFlags(BEAT_WAITED | BEAT_REWIND_FLOOR);
    const checkpoint = story.captureBeat();
    const record = story.beats.at(-1)!;
    const count = story.beats.length;
    story.variablesState["gold"] = 5;
    expect(advance(story, 2)).toEqual(["New two.", "New three."]);
    expect(record.image).not.toBe(checkpoint);
    expect(story.restore(checkpoint)).toBe(true);
    expect(story.beats).toHaveLength(count);
    expect(story.beats.at(-1)).toBe(record);
    expect(record.image).toBe(checkpoint);
    expect(record.flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
    expect(advance(story, 1)).toEqual(["New two."]);
    expect(story.beats).toHaveLength(count + 1);
  });

  it("a checkpoint whose beat the history no longer holds is exported, and restored and saved, with its beat's flags", () => {
    const script = SAVE_SCENARIOS["long"]!.script;
    const story = engine(rootOf(script), { rewindBeats: 2 });
    expect(advance(story, 1)).toHaveLength(1);
    story.setBeatFlags(BEAT_WAITED | BEAT_REWIND_FLOOR);
    const checkpoint = story.captureBeat();
    expect(checkpoint.beat?.flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
    expect(advance(story, 4)).toHaveLength(4);
    expect(story.beats.some((record) => record.image === checkpoint || record === checkpoint.beat)).toBe(false);
    const exported = story.saveOfImage(checkpoint)!;
    expect(JSON.parse(exported).beats.at(-1).flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
    const loaded = engine(rootOf(script));
    loaded.loadSave(exported);
    expect(loaded.beats.at(-1)!.flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
    expect(story.restore(checkpoint)).toBe(true);
    expect(JSON.parse(story.toSave()).beats.at(-1).flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
    expect(advance(story, 1)).toHaveLength(1);
    const beats = JSON.parse(story.toSave()).beats;
    expect(beats).toHaveLength(2);
    expect(beats[0].flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
    expect(story.beats[0]!.image).toBe(checkpoint);
  });

  it("a keyframe taken of a restored checkpoint's state is its beat, flags included, and no second record of it", () => {
    const script = SAVE_SCENARIOS["long"]!.script;
    const story = engine(rootOf(script), { rewindBeats: 2 });
    expect(advance(story, 1)).toHaveLength(1);
    story.setBeatFlags(BEAT_WAITED | BEAT_REWIND_FLOOR);
    const evicted = story.captureBeat();
    expect(advance(story, 4)).toHaveLength(4);
    expect(story.restore(evicted)).toBe(true);
    const keyframe = story.captureBeat(true);
    expect(keyframe).not.toBe(evicted);
    expect(keyframe.beat?.flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
    expect(advance(story, 1)).toHaveLength(1);
    expect(JSON.parse(story.toSave()).beats[0].flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
    const held = story.beats.at(-1)!;
    expect(story.restore(held.image)).toBe(true);
    const again = story.captureBeat(true);
    expect(held.image).toBe(again);
    expect(advance(story, 1)).toHaveLength(1);
    expect(story.beats.at(-2)).toBe(held);
    expect(story.beats.filter((record) => record.image === again)).toHaveLength(1);
  });

  it("a restored beat taken again after the host wrote to it keeps its record and flags", () => {
    const story = engine(rootOf(PLAYTHROUGHS(true)));
    story.ChoosePathString("new");
    expect(advance(story, 1)).toEqual(["New one."]);
    story.setBeatFlags(BEAT_WAITED | BEAT_REWIND_FLOOR);
    const checkpoint = story.captureBeat();
    const record = story.beats.at(-1)!;
    const count = story.beats.length;
    expect(advance(story, 2)).toEqual(["New two.", "New three."]);
    expect(story.restore(checkpoint)).toBe(true);
    story.variablesState["gold"] = 5;
    const keyframe = story.captureBeat(true);
    expect(keyframe.beat).toBe(record);
    expect(JSON.parse(story.saveOfImage(keyframe)!).beats.at(-1).flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
    expect(advance(story, 1)).toEqual(["New two."]);
    expect(story.beats).toHaveLength(count + 1);
    expect(story.beats.at(-2)).toBe(record);
    expect(record.flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
  });

  it("a checkpoint restored by the engine of the next compile is its beat, flags included, and taken once", () => {
    const text = SAVE_SCENARIOS["long"]!.script;
    const session = programSession(text);
    const story = engine(session.root);
    expect(advance(story, 2)).toHaveLength(2);
    story.setBeatFlags(BEAT_WAITED | BEAT_REWIND_FLOOR);
    const checkpoint = story.captureBeat();
    const record = story.beats.at(-1)!;
    expect(advance(story, 2)).toHaveLength(2);
    const edited = session.edit("Line 30.", "Line thirty.");
    const next = new ProgramStory(edited, { images: story.images, history: story.history });
    next.keepBeatImages = true;
    next.onError = () => {};
    expect(next.restore(checkpoint)).toBe(true);
    const keyframe = next.captureBeat(true);
    expect(keyframe.beat).toBe(record);
    expect(JSON.parse(next.saveOfImage(keyframe)!).beats.at(-1).flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
    expect(advance(next, 1)).toHaveLength(1);
    expect(next.beats.filter((r) => r === record)).toHaveLength(1);
    expect(next.beats.at(-2)).toBe(record);
    expect(record.flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
  });

  it("a keyframe of the beat a continue ended, taken after the host wrote to it, is that beat, flags included", () => {
    const story = engine(rootOf(PLAYTHROUGHS(true)));
    story.ChoosePathString("new");
    expect(advance(story, 1)).toEqual(["New one."]);
    story.setBeatFlags(BEAT_WAITED | BEAT_REWIND_FLOOR);
    const record = story.beats.at(-1)!;
    const count = story.beats.length;
    story.variablesState["gold"] = 5;
    const keyframe = story.captureBeat(true);
    expect(keyframe.beat).toBe(record);
    expect(record.image).toBe(keyframe);
    expect(JSON.parse(story.saveOfImage(keyframe)!).beats.at(-1).flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
    expect(advance(story, 1)).toEqual(["New two."]);
    expect(story.beats).toHaveLength(count + 1);
    expect(story.beats.at(-2)).toBe(record);
  });

  it("a beat restored between the steps of an asynchronous continue is no longer the current beat once the continue runs on", () => {
    const story = engine(rootOf(PLAYTHROUGHS(true)));
    story.ChoosePathString("new");
    expect(advance(story, 1)).toEqual(["New one."]);
    story.setBeatFlags(BEAT_WAITED | BEAT_REWIND_FLOOR);
    const checkpoint = story.captureBeat();
    const record = story.beats.at(-1)!;
    expect(advance(story, 1)).toEqual(["New two."]);
    story.ContinueAsync();
    expect(story.restore(checkpoint)).toBe(true);
    expect(story.Continue()?.trim()).toBe("New one.");
    expect(story.beats.at(-1)).toBe(record);
    expect(story.beats.filter((r) => r === record || r.image === checkpoint)).toHaveLength(1);
    expect(story.Continue()?.trim()).toBe("New two.");
    story.setBeatFlags(BEAT_WAITED | BEAT_DECISIONS_FIXED);
    expect(story.beats.at(-1)).not.toBe(record);
    expect(story.beats.at(-1)!.flags).toBe(BEAT_WAITED | BEAT_DECISIONS_FIXED);
    expect(record.flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
  });

  it("an engine handed the history takes no image of its own state as the beat the engine before it ended", () => {
    const session = programSession(PLAYTHROUGHS(true));
    const story = engine(session.root);
    story.ChoosePathString("new");
    story.variablesState["gold"] = 7;
    expect(advance(story, 1)).toEqual(["New one."]);
    story.setBeatFlags(BEAT_WAITED | BEAT_REWIND_FLOOR);
    const record = story.beats.at(-1)!;
    const image = record.image;
    const edited = session.edit("  New three.", "  New three!");
    const next = new ProgramStory(edited, { images: story.images, history: story.history });
    next.keepBeatImages = true;
    next.onError = () => {};
    const fresh = next.captureBeat(true);
    expect(fresh.beat).toBeUndefined();
    expect(record.image).toBe(image);
    expect(next.beats.at(-1)).toBe(record);
    expect(JSON.parse(next.saveOfImage(fresh)!).beats.at(-1).flags).toBe(0);
    expect(next.restore(image)).toBe(true);
    const restored = next.captureBeat(true);
    expect(restored.beat).toBe(record);
    expect(JSON.parse(next.saveOfImage(restored)!).beats.at(-1).flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
  });

  it("a loaded beat taken again after the host wrote to it keeps its flags", () => {
    const story = engine(rootOf(PLAYTHROUGHS(true)));
    story.ChoosePathString("new");
    story.variablesState["gold"] = 7;
    expect(advance(story, 1)).toEqual(["New one."]);
    story.setBeatFlags(BEAT_WAITED | BEAT_REWIND_FLOOR);
    const loaded = engine(rootOf(PLAYTHROUGHS(true)));
    loaded.loadSave(story.toSave());
    loaded.variablesState["gold"] = 5;
    const keyframe = loaded.captureBeat(true);
    expect(keyframe.beat).toBe(loaded.beats.at(-1));
    expect(JSON.parse(loaded.saveOfImage(keyframe)!).beats.at(-1).flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
  });

  it("an engine handed the history neither saves, continues nor flags over the beat the engine before it ended", () => {
    const handOff = () => {
      const session = programSession(PLAYTHROUGHS(true));
      const story = engine(session.root);
      story.ChoosePathString("new");
      story.variablesState["gold"] = 7;
      expect(advance(story, 1)).toEqual(["New one."]);
      story.setBeatFlags(BEAT_WAITED | BEAT_REWIND_FLOOR);
      const record = story.beats.at(-1)!;
      const image = record.image;
      const next = new ProgramStory(session.edit("  New three.", "  New three!"), {
        images: story.images,
        history: story.history,
      });
      next.keepBeatImages = true;
      next.onError = () => {};
      return { next, record, image };
    };
    {
      const { next, record, image } = handOff();
      next.toSave();
      expect(record.image).toBe(image);
    }
    {
      const { next, record, image } = handOff();
      next.ChoosePathString("new");
      expect(next.Continue()?.trim()).toBe("New one.");
      expect(record.image).toBe(image);
      expect(record.flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
    }
    {
      const { next, record, image } = handOff();
      next.setBeatFlags(0);
      expect(record.flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
      expect(JSON.parse(next.saveOfImage(image)!).beats.at(-1).flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
    }
  });

  it("a state loaded in place is not the beat the story stood at before", () => {
    const story = engine(rootOf(PLAYTHROUGHS(true)));
    story.ChoosePathString("new");
    const initial = story.state.toJson();
    expect(advance(story, 1)).toEqual(["New one."]);
    story.setBeatFlags(BEAT_WAITED | BEAT_REWIND_FLOOR);
    const record = story.beats.at(-1)!;
    const image = record.image;
    story.state.LoadJson(initial);
    const keyframe = story.captureBeat(true);
    expect(keyframe.beat).toBeUndefined();
    expect(record.image).toBe(image);
  });

  it("a host's function evaluation leaves the beat the story stood at its beat, and adds no record", () => {
    const text = [
      "store gold = 0",
      "",
      "function bump()",
      "  gold = gold + 1",
      "  return gold",
      "end",
      "",
      "",
      "",
      "scene start",
      "  One.",
      "  Two.",
      "end",
      "",
    ].join("\n");
    const story = engine(rootOf(text));
    expect(advance(story, 1)).toEqual(["One."]);
    story.setBeatFlags(BEAT_WAITED | BEAT_REWIND_FLOOR);
    const record = story.beats.at(-1)!;
    const count = story.beats.length;
    expect(story.EvaluateFunction("bump")).toBe(1);
    expect(story.beats).toHaveLength(count);
    expect(story.beats.at(-1)).toBe(record);
    const keyframe = story.captureBeat(true);
    expect(keyframe.beat).toBe(record);
    expect(JSON.parse(story.saveOfImage(keyframe)!).beats.at(-1).flags).toBe(BEAT_WAITED | BEAT_REWIND_FLOOR);
    expect(advance(story, 1)).toEqual(["Two."]);
    expect(story.beats.at(-2)).toBe(record);
  });

  it("a beat restored between the steps of an asynchronous continue that then runs on to its line is not the beat that line ends", () => {
    const story = engine(rootOf(PLAYTHROUGHS(true)));
    story.ChoosePathString("new");
    story.ContinueAsync();
    const first = story.beats.at(-1)!;
    const image = first.image;
    expect(story.restore(image)).toBe(true);
    expect(story.Continue()?.trim()).toBe("New one.");
    expect(story.beats.at(-1)).not.toBe(first);
    expect(first.image).toBe(image);
  });

  it("flags set after restoring a checkpoint whose record the history evicted are the restored beat's", () => {
    const script = SAVE_SCENARIOS["long"]!.script;
    const story = engine(rootOf(script), { rewindBeats: 2 });
    expect(advance(story, 1)).toHaveLength(1);
    story.setBeatFlags(BEAT_WAITED | BEAT_REWIND_FLOOR);
    const checkpoint = story.captureBeat();
    expect(advance(story, 4)).toHaveLength(4);
    expect(story.restore(checkpoint)).toBe(true);
    story.setBeatFlags(BEAT_WAITED | BEAT_DECISIONS_FIXED);
    expect(JSON.parse(story.toSave()).beats.at(-1).flags).toBe(BEAT_WAITED | BEAT_DECISIONS_FIXED);
    expect(advance(story, 1)).toHaveLength(1);
    expect(JSON.parse(story.toSave()).beats[0].flags).toBe(BEAT_WAITED | BEAT_DECISIONS_FIXED);
  });
});

const statementForms = (save: Record<string, any>) => {
  const forms: {
    levels: { s: number; at: number; flow?: string; decl?: string; k?: string; i?: number; block?: number }[];
  }[] = [];
  const visit = (token: unknown): void => {
    if (Array.isArray(token)) {
      token.forEach(visit);
      return;
    }
    if (!token || typeof token !== "object") return;
    const obj = token as Record<string, any>;
    if (Array.isArray(obj["levels"])) {
      forms.push(obj as never);
      return;
    }
    for (const [key, value] of Object.entries(obj)) {
      if (key === "listings" || key === "parts") continue;
      visit(key === "^symsave" ? JSON.parse(value as string) : value);
    }
  };
  visit(save);
  return forms;
};

const checkWindows = (save: Record<string, any>) => {
  const listings = save["listings"] as { n: number; windows: (number | string)[][] }[];
  let entries = 0;
  for (const listing of listings) {
    let end = -1;
    for (const window of listing.windows) {
      const from = Number(window[0]);
      expect(from).toBeGreaterThan(end);
      end = from + window.length - 1;
      expect(end).toBeLessThanOrEqual(listing.n);
      entries += window.length - 1;
    }
  }
  let ends = 0;
  for (const form of statementForms(save)) {
    for (const level of form.levels) {
      const listing = listings[level.s]!;
      if (level.at === listing.n) {
        ends += 1;
        expect(listing.windows.some((w) => Number(w[0]) + w.length - 1 === listing.n)).toBe(true);
      } else {
        expect(
          listing.windows.some((w) => Number(w[0]) <= level.at && level.at < Number(w[0]) + w.length - 1),
        ).toBe(true);
      }
    }
  }
  return { entries, ends };
};

describe("a save's listings", () => {
  it("cost at most 24 bytes per window entry at the fixture route's last beat, written once per sequence, and every saved form has its window", () => {
    const { files } = buildPreviewFixture();
    const text = files
      .get("main.sd")!
      .replace("scene MAIN\n", 'store mark = nil\n\nscene start\n  -> MAIN\nend\n\nscene MAIN\n  & mark = function() return 1 end\n  Start {cycle|"a"|"b"}.\n');
    const story = engine(rootOf(text));
    const beats = silence(() => play(story, [0]));
    expect(beats.length).toBeGreaterThan(700);
    expect(beats.at(-1)).toBe("A CRASH of thunder.");
    const json = story.toSave();
    const save = JSON.parse(json);
    const listingBytes = JSON.stringify(save.listings).length;
    const { entries, ends } = checkWindows(save);
    expect(entries).toBeGreaterThan(0);
    expect(listingBytes / entries).toBeLessThanOrEqual(24);
    expect(ends).toBeGreaterThan(0);
    const listingOf = new Map<string, Set<number>>();
    for (const form of statementForms(save)) {
      form.levels.forEach((level, n) => {
        const key = JSON.stringify([
          form.levels[0]!.flow ?? form.levels[0]!.decl,
          ...form.levels.slice(1, n + 1).map((l, m) => [form.levels[m]!.at, l.k, l.i, l.block]),
        ]);
        listingOf.set(key, (listingOf.get(key) ?? new Set()).add(level.s));
      });
    }
    expect(listingOf.size).toBeGreaterThan(1);
    expect([...listingOf.values()].every((indexes) => indexes.size === 1)).toBe(true);
    expect(new Set([...listingOf.values()].flatMap((indexes) => [...indexes])).size).toBe(listingOf.size);
    expect(save.listings.length).toBe(listingOf.size);
    const anonymous = statementForms(save).filter((f) => f.levels.length === 1 && f.levels[0]!.at <= 1);
    expect(anonymous.length).toBeGreaterThanOrEqual(2);
    const full = story.state.toJson().length;
    story.saveHistory = 1;
    const one = story.toSave().length;
    expect(one).toBeLessThan(json.length);
    process.stdout.write(
      `save at the fixture route's last beat: ${json.length} bytes for ${save.beats.length} beats, listings ${listingBytes} bytes for ${entries} entries (${(listingBytes / entries).toFixed(1)} per entry); the newest beat alone ${one} bytes; a full image of the state ${full} bytes\n`,
    );
  });

  it("give a waiting choice, a decision and a count their windows", () => {
    const THREADS = [
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
      "  choose",
      '    * "Ask"',
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
    const story = engine(rootOf(THREADS));
    while (story.canContinue) story.Continue();
    story.ChooseChoiceIndex(0);
    const save = JSON.parse(story.toSave());
    expect(save.beats.at(-1).choices.length).toBeGreaterThan(0);
    expect(save.beats.at(-1).decisions.length).toBe(1);
    checkWindows(save);
  });
});

describe("a save of format 1", () => {
  it("loads through its migration", () => {
    const dir = join(HERE, "fixtures");
    const v1 = readFileSync(join(dir, "program-save-v1.json"), "utf-8");
    expect(JSON.parse(v1).format).toBe(1);
    const loaded = engine(rootOf(readFileSync(join(dir, "program-save.sd"), "utf-8")));
    expect(loaded.loadSave(v1).format).toBe(1);
    expect(loaded.loadedSaveReport!.beats).toBe(1);
    expect(play(loaded)).toEqual(["Bumped 12.", "The end."]);
    expect(JSON.parse(loaded.toSave()).format).toBe(2);
  });
});
