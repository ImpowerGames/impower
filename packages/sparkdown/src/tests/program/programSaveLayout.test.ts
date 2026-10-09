// The fingerprints and the layout check of a durable save across sessions and
// releases (#1429, docs/engine/binary-program.md, sections 1 and 8): saves
// written by another process (`programSaveWriter.ts --scenarios`), which
// this one never compiles the programs of, load at the statement they name
// after the program changed around it, and a frame whose code changed is
// placed after the statement or loop it was inside, or dropped.
//
// A compiler release that lowers a statement differently changes its
// layout hash and not its fingerprint. The tests make that change by
// writing another layout hash into the save where the save names one, which
// is all the loader reads of the code a frame was saved in.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { normalizeSource } from "../../program/BinaryProgramWriter";
import { fingerprintOf } from "../../program/ProgramSave";
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

const engine = (root: ProgramRoot): ProgramStory => {
  const story = new ProgramStory(root);
  story.keepBeatImages = true;
  story.onError = () => {};
  return story;
};

const shown = (story: ProgramStory) => story.currentText?.trim() ?? "";

const play = (story: ProgramStory): string[] => {
  const beats: string[] = [];
  while (story.canContinue) {
    story.Continue();
    if (shown(story)) beats.push(shown(story));
  }
  return beats;
};

/** The saves the other process wrote, by scenario. */
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

/** Another hash than `hash`. */
const differ = (hash: string) => hash.replace(/^./, (c) => (c === "0" ? "1" : "0"));

/** The program of scenario `name`, edited by replacing `before` with
 *  `after` in its script. */
const program = (name: string, ...edits: [string, string][]): ProgramRoot => {
  let text = SAVE_SCENARIOS[name]!.script;
  for (const [before, after] of edits) {
    expect(text).toContain(before);
    text = text.replace(before, after);
  }
  return rootOf(text);
};

/** A scenario's save with `change` made to the newest beat's JSON. */
const changed = (name: string, change: (beat: any) => void): string => {
  const save = JSON.parse(saves[name]!);
  change(save.beats.at(-1));
  return JSON.stringify(save);
};

// The frame of the newest beat whose position is inside a statement's code.
const insideFrame = (beat: any) =>
  beat.frames.find((f: any) => Array.isArray(f.returnTo?.a)).returnTo;

describe("a fingerprint", () => {
  it("reads two statements that differ in comments or in the spacing between tokens as the same, and two that differ inside a string or a displayed line as different", () => {
    const prints = (lines: string[]) =>
      rootOf(["-> start", "scene start", ...lines.map((l) => `  ${l}`), "end", ""].join("\n"))
        .flowNamed("start")!
        .arrays.chunks.map(fingerprintOf);
    const a = prints([
      "& x = 1 + 2",
      "& y = 3",
      "Hello there.",
      '& s = "a b"',
      "Spaced words.",
    ]);
    const b = prints([
      "& x  =  1 +   2 -- a comment",
      "& y = --[[ a block comment ]] 3",
      "Hello there. // a note",
      '& s = "a  b"',
      "Spaced  words.",
    ]);
    expect(a).toHaveLength(5);
    expect(b[0]).toBe(a[0]);
    expect(b[1]).toBe(a[1]);
    expect(b[2]).toBe(a[2]);
    expect(b[3]).not.toBe(a[3]);
    expect(b[4]).not.toBe(a[4]);
  });

  // Round 1 of the review of #1654 (report 6030606004): spacing between
  // tokens includes none, and a long string keeps every line it holds.
  it("reads a statement written with no space between its tokens as the same, and keeps the lines and edge spaces of a long string", () => {
    const prints = (lines: string[]) =>
      rootOf(["-> start", "scene start", ...lines.map((l) => `  ${l}`), "end", ""].join("\n"))
        .flowNamed("start")!
        .arrays.chunks.map(fingerprintOf);
    const [spaced, packed, unary, joined] = prints([
      "& x = 1 + 2",
      "& x=1+2",
      "& y = 1 - -2",
      "& y = 1 - 2",
    ]);
    expect(packed).toBe(spaced);
    // `- -2` is not `-2`, and does not read as a comment.
    expect(unary).not.toBe(joined);
    // A long string across lines, as the source a fingerprint hashes reads
    // it: its blank line and its edge spaces are its value.
    const none = normalizeSource("& s = [[a\nb]]");
    expect(normalizeSource("& s = [[a\n\nb]]")).not.toBe(none);
    expect(normalizeSource("& s = [[a \nb]]")).not.toBe(none);
    expect(normalizeSource("& s = [[a\n  b]]")).not.toBe(none);
    expect(normalizeSource("&   s  =  [[a\nb]]  -- note")).toBe(none);
  });

  // Found adjudicating round 1's undirected report (6031983271), another
  // instance of its first finding: a line of a declaration that starts with
  // no mark of its own is logic, where `//` is floor division or the text
  // of a string, and not a displayed line's comment.
  it("tells apart two declarations that differ after a `//` in a field of a define or a line of a table literal", () => {
    const prints = (table: string, field: string) => {
      const root = rootOf(
        [
          "store t = {",
          `  ${table}`,
          "}",
          "",
          "define hero as character with",
          `  ${field}`,
          "end",
          "",
          "-> start",
          "scene start",
          "  Hello {t.a} {hero.name}.",
          "end",
          "",
        ].join("\n"),
      );
      const declarations = [...root.sequences()].find((sequence) => sequence.flow === -1)!;
      return declarations.arrays.chunks.map(fingerprintOf);
    };
    const [table, define] = prints("a = 10 // 2,", 'name = "a // b"');
    const [otherTable, otherDefine] = prints("a = 10 // 3,", 'name = "a // c"');
    const [spacedTable, spacedDefine] = prints("a  =  10  //  2,  -- a note", 'name  =  "a // b"');
    expect(otherTable).not.toBe(table);
    expect(otherDefine).not.toBe(define);
    expect(spacedTable).toBe(table);
    expect(spacedDefine).toBe(define);
  });
});

describe("a save written by another process", () => {
  it("at a statement's start loads there after a constant the statement reads changed value and after the statement's lowering changed", () => {
    const save = saves["constant"]!;
    // The beat stands at the statement's start, which names no layout: a
    // lowering that changed is not read.
    const beat = JSON.parse(save).beats.at(-1);
    expect(beat.position.a).toBe("start");
    const loaded = engine(program("constant", ["const K = 1", "const K = 2"]));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.exact).toBe(true);
    expect(play(loaded)).toEqual(["Total 2."]);
  });

  describe("inside a statement's code, with an operand on the eval stack, in a function that displays a line", () => {
    it("loads where it was when the code is the same", () => {
      const save = saves["inside"]!;
      // The caller holds an operand while the function runs.
      expect(JSON.parse(save).beats.at(-1).evalStack.length).toBeGreaterThan(0);
      const loaded = engine(program("inside"));
      loaded.loadSave(save);
      expect(loaded.loadedSaveReport!.exact).toBe(true);
      expect(shown(loaded)).toBe("Shown 10");
      expect(play(loaded)).toEqual(["Shown 20", "After 32 20."]);
      expect(loaded.state.evaluationStack).toHaveLength(0);
    });

    it("is placed after that statement with a warning when its lowering changed: the function runs to its return, its value is dropped and the eval stack cut", () => {
      const save = changed("inside", (beat) => {
        const at = insideFrame(beat);
        at.a[1] = differ(at.a[1]);
      });
      const loaded = engine(program("inside"));
      loaded.loadSave(save);
      const report = loaded.loadedSaveReport!;
      expect(report.exact).toBe(false);
      expect(report.warnings.join("\n")).toMatch(/resumes after it/);
      // The assignment of the first pass is abandoned: `x` stays 0, and the
      // loop goes on to its second pass with its scopes.
      expect(play(loaded)).toEqual(["Shown 20", "After 21 20."]);
      expect(loaded.state.evaluationStack).toHaveLength(0);
    });

    it("is placed after the loop when the loop's hidden layout changed, and a captured variable of a scope it drops keeps its value", () => {
      const save = changed("inside", (beat) => {
        const at = insideFrame(beat);
        const loop = at.st.levels.find((level: any) => level.loop);
        loop.loop = differ(loop.loop);
      });
      const loaded = engine(program("inside"));
      loaded.loadSave(save);
      const report = loaded.loadedSaveReport!;
      expect(report.exact).toBe(false);
      expect(report.warnings.join("\n")).toMatch(/loop/);
      // The function runs to its return, the loop is left, and the closure
      // reads `v` of the pass whose scope the cut closed.
      expect(play(loaded)).toEqual(["After 0 10."]);
      expect(loaded.state.evaluationStack).toHaveLength(0);
    });
  });

  describe("inside a loop's second pass", () => {
    it("loads and finishes the loop after a comment was inserted above the loop", () => {
      const loaded = engine(
        program("pass", ["  while n < 3 do", "  // The loop that counts.\n  while n < 3 do"]),
      );
      loaded.loadSave(saves["pass"]!);
      expect(loaded.loadedSaveReport!.exact).toBe(true);
      expect(shown(loaded)).toBe("Pass 2 a.");
      expect(play(loaded)).toEqual(["Pass 2 b.", "Pass 3 a.", "Pass 3 b.", "Done 3."]);
    });

    it("loads and finishes the loop after the loop moved to another line", () => {
      const loaded = engine(program("pass", ["  Begin.\n", "  Begin.\n\n\n\n"]));
      loaded.loadSave(saves["pass"]!);
      expect(loaded.loadedSaveReport!.exact).toBe(true);
      expect(play(loaded)).toEqual(["Pass 2 b.", "Pass 3 a.", "Pass 3 b.", "Done 3."]);
    });

    it("is placed after the loop when the loop's hidden layout changed", () => {
      const save = changed("pass", (beat) => {
        const loop = beat.position.st.levels.find((level: any) => level.loop);
        loop.loop = differ(loop.loop);
      });
      const loaded = engine(program("pass"));
      loaded.loadSave(save);
      expect(loaded.loadedSaveReport!.exact).toBe(false);
      expect(play(loaded)).toEqual(["Done 2."]);
    });
  });

  it("is placed after the loop when its statements were newly wrapped in a loop, which the save carries no layout for", () => {
    const loaded = engine(
      program("wrap", [
        "  W1.\n  W2.\n  W3.\n  W4.\n",
        "  while k < 1 do\n    W1.\n    W2.\n    W3.\n    W4.\n    & k = k + 1\n  end\n",
      ]),
    );
    loaded.loadSave(saves["wrap"]!);
    const report = loaded.loadedSaveReport!;
    expect(report.exact).toBe(false);
    expect(report.warnings.join("\n")).toMatch(/loop/);
    expect(play(loaded)).toEqual(["Outro."]);
  });

  it("at the last statement of a loop's body, abandoned because its call is gone, leaves the loop to finish its remaining passes with its scopes", () => {
    const loaded = engine(program("last", ["    & show(i)", "    & quiet(i)"]));
    loaded.loadSave(saves["last"]!);
    expect(loaded.loadedSaveReport!.exact).toBe(false);
    expect(shown(loaded)).toBe("Shown 1");
    expect(play(loaded)).toEqual(["Line 2.", "Line 3.", "Done."]);
  });

  it("inside a variadic function whose hidden varargs local's layout changed drops the frame and places the caller after its calling statement", () => {
    const loaded = engine(program("variadic", ["function vf(...)", "function vf(first, ...)"]));
    loaded.loadSave(saves["variadic"]!);
    expect(loaded.loadedSaveReport!.exact).toBe(false);
    expect(loaded.loadedSaveReport!.warnings.join(" ")).toMatch(/'vf' is dropped/);
    expect(shown(loaded)).toBe("In vf");
    expect(play(loaded)).toEqual(["After."]);
    expect(loaded.state.callStack.elements).toHaveLength(1);
  });

  // Round 1 of the review of #1654 (report 6030606004): a tunnel's frame
  // holds what its scene's entry bound, as a function's does.
  it("inside a tunnel whose scene binds its parameters in other code drops the frame and places the caller after the tunnel", () => {
    const TUNNEL = (params: string) =>
      [
        "-> start",
        "",
        "scene start",
        "  Before.",
        "  -> helper(10, 20, 30) ->",
        "  After.",
        "end",
        "",
        `scene helper(${params})`,
        "  Helper {a}.",
        "  Helper again {a}.",
        "  ->->",
        "end",
        "",
      ].join("\n");
    const story = new ProgramStory(rootOf(TUNNEL("a, ...")), { saveHistory: 1 });
    story.keepBeatImages = true;
    story.onError = () => {};
    const beats: string[] = [];
    while (story.canContinue && beats.length < 2) {
      story.Continue();
      if (shown(story)) beats.push(shown(story));
    }
    expect(beats).toEqual(["Before.", "Helper 10."]);
    const save = story.toSave();
    // The same scene: the frame is kept.
    const same = engine(rootOf(TUNNEL("a, ...")));
    same.loadSave(save);
    expect(same.loadedSaveReport!.exact).toBe(true);
    expect(play(same)).toEqual(["Helper again 10.", "After."]);
    // Another parameter ahead of `a`: `a` and the varargs mean other
    // values, so the frame is dropped.
    const loaded = engine(rootOf(TUNNEL("first, a, ...")));
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    expect(report.exact).toBe(false);
    expect(report.warnings.join(" ")).toMatch(/'helper' is dropped/);
    expect(play(loaded)).toEqual(["After."]);
  });

  // Round 6 of the review of #1654 (report 6043744707, an unverified
  // concern): a waiting choice raised by a thread inside a tunnel, whose
  // frame, the tunnel's, is the one dropped.
  it("at a menu inside a tunnel whose scene binds its parameters in other code drops the frame and the choice a thread raised in it", () => {
    const TUNNEL = (params: string) =>
      [
        "-> start",
        "",
        "scene start",
        "  Before.",
        "  -> helper(10, 20) ->",
        "  After.",
        "end",
        "",
        `scene helper(${params})`,
        "  <- merchant",
        "  Helper {a}.",
        "  choose",
        '    * "Leave"',
        "      Left.",
        "  end",
        "  ->->",
        "end",
        "",
        "scene merchant",
        "  choose",
        '    * "Ask"',
        "      Asked.",
        "  end",
        "  done",
        "end",
        "",
      ].join("\n");
    const story = new ProgramStory(rootOf(TUNNEL("a, ...")), { saveHistory: 1 });
    story.keepBeatImages = true;
    story.onError = () => {};
    expect(play(story)).toEqual(["Before.", "Helper 10."]);
    expect(story.currentChoices.map((c) => c.text)).toEqual(['"Ask"', '"Leave"']);
    const save = story.toSave();
    const beat = JSON.parse(save).beats.at(-1);
    expect(beat.choices.map((c: { text: string }) => c.text)).toEqual(['"Ask"']);
    // The same scene: the frame and the choice are kept.
    const same = engine(rootOf(TUNNEL("a, ...")));
    same.loadSave(save);
    expect(same.loadedSaveReport!.exact).toBe(true);
    // The beat before the menu ended at its line; the continue raises it.
    expect(play(same)).toEqual([]);
    expect(same.currentChoices.map((c) => c.text)).toEqual(['"Ask"', '"Leave"']);
    // Another parameter ahead of `a`: the tunnel's frame is dropped, and the
    // choice raised in it with it.
    const loaded = engine(rootOf(TUNNEL("first, a, ...")));
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    expect(report.exact).toBe(false);
    expect(report.warnings.join(" ")).toMatch(/'helper' is dropped/);
    // The choice was raised in the tunnel's frame, the top of its thread.
    expect(beat.choices[0].frames.at(-1).fn).toEqual({ n: "helper" });
    expect(report.warnings.join(" ")).toMatch(/Ask.*cannot be placed, and was dropped/);
    expect(play(loaded)).toEqual(["After."]);
    expect(loaded.currentChoices.map((c) => c.text)).toEqual([]);
    // Within a session: the checkpoint of the beat before the menu,
    // restored by the engine of a compile that changed the parameters, is
    // translated with the same cut, and the choice is dropped too.
    const session = programSession(TUNNEL("a, ..."));
    const game = engine(session.root);
    expect(play(game)).toEqual(["Before.", "Helper 10."]);
    const checkpoint = game.captureBeat();
    const edited = session.edit("scene helper(a, ...)", "scene helper(first, a, ...)");
    const next = new ProgramStory(edited, { images: game.images, history: game.history });
    next.keepBeatImages = true;
    next.onError = () => {};
    expect(next.restore(checkpoint)).toBe(true);
    expect(play(next)).toEqual(["After."]);
    expect(next.currentChoices.map((c) => c.text)).toEqual([]);
  });

  // Round 1 of the review of #1654 (report 6031983271, a coverage gap): a
  // save of several beats, each placed after the loop it stands in, so the
  // newest is taken with its deltas replayed and then cut.
  it("of several beats inside a loop whose layout changed replays their deltas and cuts the newest, closing the pass's captured variable", () => {
    const LOOP = [
      "store t = { n = 0 }",
      "store keep = nil",
      "",
      "-> start",
      "",
      "scene start",
      "  for i = 1, 3 do",
      "    & local v = i * 10",
      "    & keep = function() return v end",
      "    & t.n = t.n + v",
      "    Pass {i} {t.n}.",
      "    Again {i}.",
      "  end",
      "  After {t.n} {keep()}.",
      "end",
      "",
    ].join("\n");
    const story = new ProgramStory(rootOf(LOOP), { saveHistory: 3 });
    story.keepBeatImages = true;
    story.onError = () => {};
    const beats: string[] = [];
    while (story.canContinue && beats.length < 4) {
      story.Continue();
      if (shown(story)) beats.push(shown(story));
    }
    expect(beats).toEqual(["Pass 1 10.", "Again 1.", "Pass 2 30.", "Again 2."]);
    const save = JSON.parse(story.toSave());
    expect(save.beats).toHaveLength(3);
    // Every beat stands in the loop's body; a release lowers the loop
    // differently.
    for (const beat of save.beats) {
      const loop = beat.position.st.levels.find((level: any) => level.loop);
      expect(loop).toBeDefined();
      loop.loop = differ(loop.loop);
    }
    const loaded = engine(rootOf(LOOP));
    loaded.loadSave(JSON.stringify(save));
    const report = loaded.loadedSaveReport!;
    expect(report.beat).toBe(2);
    expect(report.exact).toBe(false);
    // The second pass's sum, and the `v` it captured, closed by the cut.
    expect(play(loaded)).toEqual(["After 30 20."]);
  });

  // Round 2 of the review of #1654 (report 6032759458, finding 1): the cut
  // of an older beat closes a cell the newer beat still holds open, with
  // another value and no delta of its own.
  it("of several beats inside a loop whose layout changed closes a captured variable on the newest beat's value, whatever an older beat's cut closed it on", () => {
    const LOOP = [
      "store keep = nil",
      "",
      "-> start",
      "",
      "scene start",
      "  for i = 1, 1 do",
      "    & local v = 10",
      "    & keep = function() return v end",
      "    First.",
      "    & v = 20",
      "    Second.",
      "  end",
      "  After {keep()}.",
      "end",
      "",
    ].join("\n");
    const story = new ProgramStory(rootOf(LOOP), { saveHistory: 2 });
    story.keepBeatImages = true;
    story.onError = () => {};
    const beats: string[] = [];
    while (story.canContinue && beats.length < 2) {
      story.Continue();
      if (shown(story)) beats.push(shown(story));
    }
    expect(beats).toEqual(["First.", "Second."]);
    const save = JSON.parse(story.toSave());
    expect(save.beats).toHaveLength(2);
    for (const beat of save.beats) {
      const loop = beat.position.st.levels.find((level: any) => level.loop);
      expect(loop).toBeDefined();
      loop.loop = differ(loop.loop);
    }
    const loaded = engine(rootOf(LOOP));
    loaded.loadSave(JSON.stringify(save));
    expect(loaded.loadedSaveReport!.beat).toBe(1);
    expect(loaded.loadedSaveReport!.exact).toBe(false);
    expect(play(loaded)).toEqual(["After 20."]);
    // The older beat, restored from the history the load seeded, has the
    // value it had.
    expect(loaded.restore(loaded.beats[0]!.image)).toBe(true);
    expect(play(loaded)).toEqual(["After 10."]);
  });

  it("inside a closure defined in a loop and run after the loop ended is placed exactly, whatever the loop's layout", () => {
    const save = changed("closure", (beat) => {
      // A layout of the loop the closure was written in, which is no owner
      // on the closure's frame.
      const levels = beat.frames.flatMap((f: any) => f.returnTo?.st.levels ?? []);
      const loops = levels.filter((level: any) => level.loop);
      expect(loops.length).toBeGreaterThan(0);
      for (const level of loops) level.loop = differ(level.loop);
    });
    for (const text of [saves["closure"]!, save]) {
      const loaded = engine(program("closure"));
      loaded.loadSave(text);
      expect(loaded.loadedSaveReport!.exact).toBe(true);
      expect(shown(loaded)).toBe("Shown 2");
      expect(play(loaded)).toEqual(["After."]);
    }
  });
});

// #1728: a scene entered by a divert pushes no frame of its own, and its
// entry binds the parameters as temporaries of the frame that diverted. A
// release that changes the scene's parameter list places a save held inside
// the scene at the scene's start, each parameter bound from the saved
// argument of the same name, or nil when the old scene had no parameter of
// that name (a parameter added or renamed), and an old parameter the scene
// no longer has unbound.
describe("a save inside a scene entered by a divert", () => {
  const SCENE = (params: string, line: string) =>
    [
      "-> start",
      "",
      "scene start",
      "  -> s(10, 20)",
      "end",
      "",
      `scene s(${params})`,
      `  First ${line}.`,
      `  Second ${line}.`,
      "end",
      "",
    ].join("\n");

  // The save, taken at the beat that showed the scene's first line.
  const saveIn = (params: string, line: string): string => {
    const story = new ProgramStory(rootOf(SCENE(params, line)), { saveHistory: 1 });
    story.keepBeatImages = true;
    story.onError = () => {};
    story.Continue();
    expect(shown(story)).toBe("First 10 20.");
    return story.toSave();
  };

  // The temporaries of the frame the scene's entry bound, by name: a value's
  // own value, or null for nil.
  const bindings = (story: ProgramStory): Record<string, unknown> => {
    const scope = story.state.callStack.currentThread.callstack[0]!.temporaryScopes[0]!;
    return Object.fromEntries(
      [...scope].map(([name, value]) => [name, (value as { value?: unknown } | null)?.value ?? null]),
    );
  };

  it("loads in place, exactly, when the scene's parameters did not change", () => {
    const save = saveIn("a, b", "{a} {b}");
    const loaded = engine(rootOf(SCENE("a, b", "{a} {b}")));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.exact).toBe(true);
    expect(bindings(loaded)).toEqual({ a: 10, b: 20 });
    expect(play(loaded)).toEqual(["Second 10 20."]);
  });

  const RELEASES: {
    change: string;
    params: string;
    line: string;
    bound: Record<string, unknown>;
    beats: string[];
  }[] = [
    // `c` is new: nil.
    { change: "added", params: "a, b, c", line: "{a} {b} {c}", bound: { a: 10, b: 20, c: null }, beats: ["First 10 20 nil.", "Second 10 20 nil."] },
    // `a` is gone: unbound.
    { change: "removed", params: "b", line: "{b}", bound: { b: 20 }, beats: ["First 20.", "Second 20."] },
    // `b` became `x`: `x` is a new name, nil, and `b` is gone.
    { change: "renamed", params: "a, x", line: "{a} {x}", bound: { a: 10, x: null }, beats: ["First 10 nil.", "Second 10 nil."] },
    // By name, not by position: `a` keeps 10 and `b` keeps 20.
    { change: "reordered", params: "b, a", line: "{a} {b}", bound: { a: 10, b: 20 }, beats: ["First 10 20.", "Second 10 20."] },
  ];

  for (const { change, params, line, bound, beats } of RELEASES) {
    it(`whose parameter list had a parameter ${change} (s(a, b) to s(${params})) is placed at the scene's start with its parameters bound by name`, () => {
      const save = saveIn("a, b", "{a} {b}");
      const loaded = engine(rootOf(SCENE(params, line)));
      loaded.loadSave(save);
      const report = loaded.loadedSaveReport!;
      expect(report.exact).toBe(false);
      expect(report.warnings.join(" ")).toMatch(/'s'.*start/);
      expect(bindings(loaded)).toEqual(bound);
      expect(play(loaded)).toEqual(beats);
    });
  }

  it("restarts the scene with its parameters bound by name when a checkpoint is restored after an edit within a session", () => {
    const session = programSession(SCENE("a, b", "{a} {b}"));
    const game = engine(session.root);
    game.Continue();
    expect(shown(game)).toBe("First 10 20.");
    const checkpoint = game.captureBeat();
    const edited = session.edit("scene s(a, b)", "scene s(b, a)");
    const next = new ProgramStory(edited, { images: game.images, history: game.history });
    next.keepBeatImages = true;
    next.onError = () => {};
    expect(next.restore(checkpoint)).toBe(true);
    expect(bindings(next)).toEqual({ a: 10, b: 20 });
    expect(play(next)).toEqual(["First 10 20.", "Second 10 20."]);
  });

  // The save of `text` at the beat that showed `line`.
  const saveAt = (text: string, line: string): string => {
    const story = new ProgramStory(rootOf(text), { saveHistory: 1 });
    story.keepBeatImages = true;
    story.onError = () => {};
    while (story.canContinue && shown(story) !== line) story.Continue();
    expect(shown(story)).toBe(line);
    return story.toSave();
  };

  // Round 1 of the review of #1730 (report 6083306813, finding 1): a scene
  // whose entry goes on to its first branch binds its parameters in the
  // frame that runs the branch.
  it("inside the first branch of a scene whose parameters changed restarts the scene, which enters the branch again", () => {
    const OUTER = (params: string) =>
      [
        "-> outer(10, 20)",
        "",
        `scene outer(${params})`,
        "  branch inner",
        "    First {a} {b}.",
        "    Second {a} {b}.",
        "  end",
        "end",
        "",
      ].join("\n");
    const save = saveAt(OUTER("a, b"), "First 10 20.");
    const level = JSON.parse(save).beats.at(-1).position.st.levels[0];
    expect(level.flow).toBe("outer.inner");
    expect(level.scene.params).toEqual(["a", "b"]);
    const same = engine(rootOf(OUTER("a, b")));
    same.loadSave(save);
    expect(same.loadedSaveReport!.exact).toBe(true);
    expect(play(same)).toEqual(["Second 10 20."]);
    const loaded = engine(rootOf(OUTER("b, a")));
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    expect(report.exact).toBe(false);
    expect(report.warnings.join(" ")).toMatch(/'outer' resumes at its start/);
    expect(bindings(loaded)).toEqual({ a: 10, b: 20 });
    expect(play(loaded)).toEqual(["First 10 20.", "Second 10 20."]);
    // Within a session: an edit to the scene's header alone keeps the
    // branch's chunks, and the checkpoint still restarts the scene.
    const session = programSession(OUTER("a, b"));
    const game = engine(session.root);
    while (shown(game) !== "First 10 20.") game.Continue();
    const checkpoint = game.captureBeat();
    const edited = session.edit("scene outer(a, b)", "scene outer(b, a)");
    const next = new ProgramStory(edited, { images: game.images, history: game.history });
    next.keepBeatImages = true;
    next.onError = () => {};
    expect(next.restore(checkpoint)).toBe(true);
    expect(play(next)).toEqual(["First 10 20.", "Second 10 20."]);
  });

  // Round 1 of the review of #1730 (report 6083306813, finding 1): a jump
  // to a label of a scene passes its entry, which binds nothing in the
  // frame.
  it("at a label a frame jumped to, past the scene's entry, loads in place when the scene's parameters changed", () => {
    const LABEL = (params: string) =>
      [
        "-> start",
        "",
        "scene start",
        "  -> s.middle",
        "end",
        "",
        `scene s(${params})`,
        "  Skipped.",
        "  label middle",
        "  Middle.",
        "  After.",
        "end",
        "",
      ].join("\n");
    const save = saveAt(LABEL("a, b"), "Middle.");
    const loaded = engine(rootOf(LABEL("b, a")));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.exact).toBe(true);
    expect(play(loaded)).toEqual(["After."]);
  });

  // Round 1 of the review of #1730 (report 6083306813, finding 2): a new
  // parameter's name the frame already binds, in a local a closure captured.
  it("closes a captured local that a new parameter of the same name replaces, so the closure keeps its value", () => {
    const CAPTURE = (params: string) =>
      [
        "store keep = nil",
        "",
        "-> start",
        "",
        "scene start",
        "  & local c = 30",
        "  & keep = function() return c end",
        "  -> s(10)",
        "end",
        "",
        `scene s(${params})`,
        "  First {a} {keep()}.",
        "  Second {a} {keep()}.",
        "end",
        "",
      ].join("\n");
    const save = saveAt(CAPTURE("a"), "First 10 30.");
    const loaded = engine(rootOf(CAPTURE("a, c")));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.exact).toBe(false);
    expect(bindings(loaded)).toEqual({ a: 10, c: null });
    expect(play(loaded)).toEqual(["First 10 30.", "Second 10 30."]);
  });

  // A scene whose content starts with a branch, entered by a divert.
  const STARTS = (header: string, divert: string) =>
    [
      `-> ${divert}`,
      "",
      `scene ${header}`,
      "  branch inner",
      "    First.",
      "    Second.",
      "  end",
      "end",
      "",
    ].join("\n");

  // Round 1 of the review of #1730 (report 6084052356, finding 1): the
  // scene with no parameters left has no entry and no content of its own,
  // and is entered at its first branch.
  it("inside the first branch of a scene that lost its last parameter restarts the scene at that branch", () => {
    const save = saveAt(STARTS("outer(a)", "outer(10)"), "First.");
    const loaded = engine(rootOf(STARTS("outer", "outer(10)").replace("-> outer(10)", "-> outer")));
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    expect(report.exact).toBe(false);
    expect(report.warnings.join(" ")).toMatch(/'outer' resumes at its start/);
    expect(bindings(loaded)).toEqual({});
    expect(play(loaded)).toEqual(["First.", "Second."]);
  });

  // Round 1 of the review of #1730 (report 6084052356, finding 2, rejected):
  // an entry that bound nothing left nothing in the frame to be stale, and a
  // frame that ran it cannot be told from one that jumped past it, so the
  // save loads where it was.
  it("inside a scene that gained its first parameter loads in place, since its entry bound nothing", () => {
    const save = saveAt(STARTS("outer", "outer"), "First.");
    const loaded = engine(rootOf(STARTS("outer(a)", "outer(10)")));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.exact).toBe(true);
    expect(play(loaded)).toEqual(["Second."]);
  });

  // Round 1 of the review of #1730 (report 6084052356, finding 3): the
  // entry's jump to the scene's first branch is no part of its parameters.
  it("inside a branch of a scene whose parameters did not change loads in place when its branches were reordered", () => {
    const BRANCHES = (first: string, second: string) =>
      ["-> outer(10)", "", "scene outer(a)", first, second, "end", ""].join("\n");
    const ONE = ["  branch one", "    One {a}.", "    -> two", "  end"].join("\n");
    const TWO = ["  branch two", "    First {a}.", "    Second {a}.", "  end"].join("\n");
    const save = saveAt(BRANCHES(ONE, TWO), "First 10.");
    const loaded = engine(rootOf(BRANCHES(TWO, ONE)));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.exact).toBe(true);
    expect(play(loaded)).toEqual(["Second 10."]);
  });

  // Round 1 of the review of #1730 (report 6084052356, finding 4): a jump
  // to a label of a scene that bound nothing, which gains a parameter.
  it("at a label a frame jumped to loads in place when the scene, which took no parameters, gains one", () => {
    const LABEL = (header: string) =>
      [
        "-> start",
        "",
        "scene start",
        "  -> s.middle",
        "end",
        "",
        `scene ${header}`,
        "  Skipped.",
        "  label middle",
        "  Middle.",
        "  After.",
        "end",
        "",
      ].join("\n");
    const save = saveAt(LABEL("s"), "Middle.");
    const loaded = engine(rootOf(LABEL("s(a)")));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.exact).toBe(true);
    expect(play(loaded)).toEqual(["After."]);
  });

  it("inside a variadic scene keeps the saved varargs under the same name when a parameter before them is removed", () => {
    const VARIADIC = (params: string, line: string) =>
      ["-> s(10, 20, 30)", "", `scene s(${params})`, `  First ${line}.`, `  Second ${line}.`, "end", ""].join(
        "\n",
      );
    const save = saveAt(VARIADIC("a, ...", '{a} {select("#", ...)}'), "First 10 2.");
    const loaded = engine(rootOf(VARIADIC("...", '{select("#", ...)}')));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.exact).toBe(false);
    expect(play(loaded)).toEqual(["First 2.", "Second 2."]);
  });
});

// #1728: a scene entered by a thread binds its parameters in the forked
// thread's frame.
describe("a save inside a scene entered by a thread", () => {
  const THREAD = (params: string) =>
    [
      "-> start",
      "",
      "scene start",
      "  <- s(10, 20)",
      "  Main.",
      "  choose",
      '    * "Stay"',
      "      Stayed.",
      "  end",
      "end",
      "",
      `scene s(${params})`,
      "  First {a} {b}.",
      "  Second {a} {b}.",
      "  choose",
      '    * "Ask"',
      "      Asked {a} {b}.",
      "  end",
      "  done",
      "end",
      "",
    ].join("\n");

  const story = () => {
    const s = new ProgramStory(rootOf(THREAD("a, b")), { saveHistory: 1 });
    s.keepBeatImages = true;
    s.onError = () => {};
    return s;
  };

  it("while the fork runs restarts the scene in the fork, which then returns to the thread that forked it", () => {
    const game = story();
    game.Continue();
    expect(shown(game)).toBe("First 10 20.");
    const save = game.toSave();
    const same = engine(rootOf(THREAD("a, b")));
    same.loadSave(save);
    expect(same.loadedSaveReport!.exact).toBe(true);
    expect(play(same)).toEqual(["Second 10 20.", "Main."]);
    const loaded = engine(rootOf(THREAD("b, a")));
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    expect(report.exact).toBe(false);
    expect(report.warnings.join(" ")).toMatch(/'s'.*start/);
    expect(play(loaded)).toEqual(["First 10 20.", "Second 10 20.", "Main."]);
    expect(loaded.currentChoices.map((c) => c.text)).toEqual(['"Ask"', '"Stay"']);
  });

  it("at a menu drops the choice the fork raised in the scene, which has no start to restart at", () => {
    const game = story();
    expect(play(game)).toEqual(["First 10 20.", "Second 10 20.", "Main."]);
    expect(game.currentChoices.map((c) => c.text)).toEqual(['"Ask"', '"Stay"']);
    const save = game.toSave();
    const same = engine(rootOf(THREAD("a, b")));
    same.loadSave(save);
    expect(same.loadedSaveReport!.exact).toBe(true);
    expect(play(same)).toEqual([]);
    expect(same.currentChoices.map((c) => c.text)).toEqual(['"Ask"', '"Stay"']);
    const loaded = engine(rootOf(THREAD("b, a")));
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    expect(report.exact).toBe(false);
    expect(report.warnings.join(" ")).toMatch(/choice raised in 's' is dropped/);
    expect(play(loaded)).toEqual([]);
    expect(loaded.currentChoices.map((c) => c.text)).toEqual(['"Stay"']);
  });
});
