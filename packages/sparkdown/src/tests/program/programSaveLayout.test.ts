import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { normalizeSource } from "../../compiler/utils/fingerprintSource";
import { fingerprintOf } from "../../program/ProgramSave";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, programSession } from "./programHarness";
import { SAVE_SCENARIOS, SCENARIO_MARKER } from "./programSaveScenarios";
import { CallStack } from "../../runtime/CallStack";

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

const differ = (hash: string) => hash.replace(/^./, (c) => (c === "0" ? "1" : "0"));

const program = (name: string, ...edits: [string, string][]): ProgramRoot => {
  let text = SAVE_SCENARIOS[name]!.script;
  for (const [before, after] of edits) {
    expect(text).toContain(before);
    text = text.replace(before, after);
  }
  return rootOf(text);
};

const changed = (name: string, change: (beat: any) => void): string => {
  const save = JSON.parse(saves[name]!);
  change(save.beats.at(-1));
  return JSON.stringify(save);
};

const insideFrame = (beat: any) =>
  beat.frames.find((f: any) => Array.isArray(f.returnTo?.a)).returnTo;

describe("a fingerprint", () => {
  it("reads two statements that differ in comments or in the spacing between tokens as the same, and two that differ inside a string or a displayed line as different", () => {
    const prints = (lines: string[]) =>
      rootOf(["scene start", ...lines.map((l) => `  ${l}`), "end", ""].join("\n"))
        .flowNamed("start")!
        .arrays.chunks.slice(0, -1)
        .map(fingerprintOf);
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

  it("reads a statement written with no space between its tokens as the same, and keeps the lines and edge spaces of a long string", () => {
    const prints = (lines: string[]) =>
      rootOf(["scene start", ...lines.map((l) => `  ${l}`), "end", ""].join("\n"))
        .flowNamed("start")!
        .arrays.chunks.map(fingerprintOf);
    const [spaced, packed, unary, joined] = prints([
      "& x = 1 + 2",
      "& x=1+2",
      "& y = 1 - -2",
      "& y = 1 - 2",
    ]);
    expect(packed).toBe(spaced);
    expect(unary).not.toBe(joined);
    const none = normalizeSource("& s = [[a\nb]]");
    expect(normalizeSource("& s = [[a\n\nb]]")).not.toBe(none);
    expect(normalizeSource("& s = [[a \nb]]")).not.toBe(none);
    expect(normalizeSource("& s = [[a\n  b]]")).not.toBe(none);
    expect(normalizeSource("&   s  =  [[a\nb]]  -- note")).toBe(none);
  });

  it("continues a quoted string after a z escape only over ASCII whitespace", () => {
    const z = String.fromCharCode(92) + "z";
    const nbsp = String.fromCharCode(0xa0);
    expect(normalizeSource(`& s = "a${z} \n  b"`)).toContain("\n  b");
    expect(normalizeSource(`& s = "a${z}${nbsp}\n  b"`)).not.toContain("\n  b");
  });

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

  it("inside a variadic function saved before its hidden varargs local was renamed drops the frame and places the caller after its calling statement", () => {
    const save = JSON.parse(saves["variadic"]!);
    const frames = save.beats.at(-1).frames;
    const vf = frames.find((f: any) => f.temps?.some((s: any) => "__varargs$" in s));
    expect(vf, "the save holds vf's frame with its pack").toBeDefined();
    vf.temps = vf.temps.map((s: any) =>
      Object.fromEntries(Object.entries(s).map(([k, v]) => [k === "__varargs$" ? "__varargs__" : k, v])),
    );
    vf.bound = differ(vf.bound);
    const loaded = engine(program("variadic"));
    loaded.loadSave(JSON.stringify(save));
    expect(loaded.loadedSaveReport!.exact).toBe(false);
    expect(loaded.loadedSaveReport!.warnings.join(" ")).toMatch(/'vf' is dropped, since it binds its parameters in other code/);
    expect(play(loaded)).toEqual(["After."]);
    expect(loaded.state.callStack.elements).toHaveLength(1);
  });

  it("inside a tunnel whose scene binds its parameters in other code drops the frame and places the caller after the tunnel", () => {
    const TUNNEL = (params: string) =>
      [
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
    const same = engine(rootOf(TUNNEL("a, ...")));
    same.loadSave(save);
    expect(same.loadedSaveReport!.exact).toBe(true);
    expect(play(same)).toEqual(["Helper again 10.", "After."]);
    const loaded = engine(rootOf(TUNNEL("first, a, ...")));
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    expect(report.exact).toBe(false);
    expect(report.warnings.join(" ")).toMatch(/'helper' is dropped/);
    expect(play(loaded)).toEqual(["After."]);
  });

  it("at a menu inside a tunnel whose scene binds its parameters in other code drops the frame and the choice a thread raised in it", () => {
    const TUNNEL = (params: string) =>
      [
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
    const same = engine(rootOf(TUNNEL("a, ...")));
    same.loadSave(save);
    expect(same.loadedSaveReport!.exact).toBe(true);
    expect(play(same)).toEqual([]);
    expect(same.currentChoices.map((c) => c.text)).toEqual(['"Ask"', '"Leave"']);
    const loaded = engine(rootOf(TUNNEL("first, a, ...")));
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    expect(report.exact).toBe(false);
    expect(report.warnings.join(" ")).toMatch(/'helper' is dropped/);
    expect(beat.choices[0].frames.at(-1).fn).toEqual({ n: "helper" });
    expect(report.warnings.join(" ")).toMatch(/Ask.*cannot be placed, and was dropped/);
    expect(play(loaded)).toEqual(["After."]);
    expect(loaded.currentChoices.map((c) => c.text)).toEqual([]);
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

  it("of several beats inside a loop whose layout changed replays their deltas and cuts the newest, closing the pass's captured variable", () => {
    const LOOP = [
      "store t = { n = 0 }",
      "store keep = nil",
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
    expect(play(loaded)).toEqual(["After 30 20."]);
  });

  it("of several beats inside a loop whose layout changed closes a captured variable on the newest beat's value, whatever an older beat's cut closed it on", () => {
    const LOOP = [
      "store keep = nil",
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
    expect(loaded.restore(loaded.beats[0]!.image)).toBe(true);
    expect(play(loaded)).toEqual(["After 10."]);
  });

  it("inside a closure defined in a loop and run after the loop ended is placed exactly, whatever the loop's layout", () => {
    const save = changed("closure", (beat) => {
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

describe("a save inside a scene entered by a divert", () => {
  const SCENE = (params: string, line: string) =>
    [
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

  const saveIn = (params: string, line: string): string => {
    const story = new ProgramStory(rootOf(SCENE(params, line)), { saveHistory: 1 });
    story.keepBeatImages = true;
    story.onError = () => {};
    story.Continue();
    expect(shown(story)).toBe("First 10 20.");
    return story.toSave();
  };

  const bindings = (story: ProgramStory): Record<string, unknown> => {
    const scope = story.state.callStack.currentThread.callstack[0]!.temporaryScopes[1]!;
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
    { change: "added", params: "a, b, c", line: "{a} {b} {c}", bound: { a: 10, b: 20, c: null }, beats: ["First 10 20 nil.", "Second 10 20 nil."] },
    { change: "removed", params: "b", line: "{b}", bound: { b: 20 }, beats: ["First 20.", "Second 20."] },
    { change: "renamed", params: "a, x", line: "{a} {x}", bound: { a: 10, x: null }, beats: ["First 10 nil.", "Second 10 nil."] },
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

  const saveAt = (text: string, line: string): string => {
    const story = new ProgramStory(rootOf(text), { saveHistory: 1 });
    story.keepBeatImages = true;
    story.onError = () => {};
    while (story.canContinue && shown(story) !== line) story.Continue();
    expect(shown(story)).toBe(line);
    return story.toSave();
  };

  it("inside the first branch of a scene whose parameters changed restarts the scene, which enters the branch again", () => {
    const OUTER = (params: string) =>
      [
        "scene start",
        "  -> outer(10, 20)",
        "end",
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
    expect(level.params).toEqual([]);
    expect(level.scene).toEqual(["a", "b"]);
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

  it("at a label a frame jumped to, past the scene's entry, loads in place when the scene's parameters changed", () => {
    const LABEL = (params: string) =>
      [
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

  it("closes a captured local that a new parameter of the same name replaces, so the closure keeps its value", () => {
    const CAPTURE = (params: string) =>
      [
        "store keep = nil",
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

  it("closes a closure's captured parameter on a restart as entering the scene again closes it", () => {
    const REENTER = (params: string, extra: string) =>
      [
        "store keep = nil",
        "",
        "scene start",
        `  -> s(10${extra})`,
        "end",
        "",
        `scene s(${params})`,
        "  & keep = keep or function() return a end",
        "  & a = a + 5",
        "  First {a} {keep()}.",
        "  Second {a} {keep()}.",
        `  -> s(20${extra})`,
        "end",
        "",
      ].join("\n");
    const beats = (story: ProgramStory, count: number) => {
      const seen: string[] = [];
      const errors: string[] = [];
      story.onError = (message: string) => errors.push(message);
      while (story.canContinue && seen.length < count) {
        story.Continue();
        if (shown(story)) seen.push(shown(story));
      }
      return { seen, errors };
    };
    const retire = vi.spyOn(CallStack.Element.prototype, "RetireBindings");
    const retired = () =>
      retire.mock.calls.map(([scope, names]) => [scope, names("a"), names("b")]);
    try {
      expect(beats(engine(rootOf(REENTER("a", ""))), 4)).toEqual({
        seen: ["First 15 15.", "Second 15 15.", "First 25 15.", "Second 25 15."],
        errors: [],
      });
      const save = saveAt(REENTER("a", ""), "Second 15 15.");
      const loaded = engine(rootOf(REENTER("a, b", ", 0")));
      retire.mockClear();
      loaded.loadSave(save);
      expect(loaded.loadedSaveReport!.exact).toBe(false);
      expect(retired()).toContainEqual([1, true, false]);
      expect(beats(loaded, 4)).toEqual({
        seen: ["First 20 15.", "Second 20 15.", "First 25 15.", "Second 25 15."],
        errors: [],
      });
    } finally {
      retire.mockRestore();
    }
  });

  it("restarts a scene whose frame holds no open cell with its parameters bound by name", () => {
    const save = saveIn("a, b", "{a} {b}");
    const loaded = engine(rootOf(SCENE("b, a, c", "{a} {b} {c}")));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.exact).toBe(false);
    const element = loaded.state.callStack.currentThread.callstack[0]!;
    expect(element.openUpvalues).toEqual([]);
    expect(element.borrowedUpvalues).toEqual([]);
    expect(bindings(loaded)).toEqual({ a: 10, b: 20, c: null });
    expect(play(loaded)).toEqual(["First 10 20 nil.", "Second 10 20 nil."]);
  });

  const STARTS = (header: string, divert: string) =>
    [
      "scene start",
      `  -> ${divert}`,
      "end",
      "",
      `scene ${header}`,
      "  branch inner",
      "    First.",
      "    Second.",
      "  end",
      "end",
      "",
    ].join("\n");

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

  it("inside a scene that gained its first parameter loads in place, since its entry bound nothing", () => {
    const save = saveAt(STARTS("outer", "outer"), "First.");
    const loaded = engine(rootOf(STARTS("outer(a)", "outer(10)")));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.exact).toBe(true);
    expect(play(loaded)).toEqual(["Second."]);
  });

  it("inside a branch of a scene whose parameters did not change loads in place when its branches were reordered", () => {
    const BRANCHES = (first: string, second: string) =>
      ["scene start", "  -> outer(10)", "end", "", "scene outer(a)", first, second, "end", ""].join("\n");
    const ONE = ["  branch one", "    One {a}.", "    -> two", "  end"].join("\n");
    const TWO = ["  branch two", "    First {a}.", "    Second {a}.", "  end"].join("\n");
    const save = saveAt(BRANCHES(ONE, TWO), "First nil.");
    const loaded = engine(rootOf(BRANCHES(TWO, ONE)));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.exact).toBe(true);
    expect(play(loaded)).toEqual(["Second nil."]);
  });

  it("at a label a frame jumped to past the entry loads in place, though a block's local takes a parameter's name", () => {
    const BLOCK = (header: string) =>
      [
        "scene start",
        "  -> s.middle",
        "end",
        "",
        `scene ${header}`,
        "  Skipped.",
        "  label middle",
        "  if true then",
        "    local a = 7",
        "    First {a}.",
        "    Second {a}.",
        "  end",
        "end",
        "",
      ].join("\n");
    const save = saveAt(BLOCK("s(a)"), "First 7.");
    const loaded = engine(rootOf(BLOCK("s(a, b)")));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.exact).toBe(true);
    expect(play(loaded)).toEqual(["Second 7."]);
  });

  it("inside a branch a divert entered loads in place, though the branch's local takes its scene's parameter's name", () => {
    const BRANCH = (header: string) =>
      [
        "scene start",
        "  -> s.b",
        "end",
        "",
        `scene ${header}`,
        "  Skipped.",
        "  branch b",
        "    local a = 7",
        "    First {a}.",
        "    Second {a}.",
        "  end",
        "end",
        "",
      ].join("\n");
    const save = saveAt(BRANCH("s(a)"), "First 7.");
    const loaded = engine(rootOf(BRANCH("s(a, b)")));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.exact).toBe(true);
    expect(play(loaded)).toEqual(["Second 7."]);
  });

  it("at a label a frame jumped to loads in place when the scene, which took no parameters, gains one", () => {
    const LABEL = (header: string) =>
      [
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
      ["scene start", "  -> s(10, 20, 30)", "end", "", `scene s(${params})`, `  First ${line}.`, `  Second ${line}.`, "end", ""].join(
        "\n",
      );
    const save = saveAt(VARIADIC("a, ...", '{a} {select("#", ...)}'), "First 10 2.");
    const loaded = engine(rootOf(VARIADIC("...", '{select("#", ...)}')));
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.exact).toBe(false);
    expect(play(loaded)).toEqual(["First 2.", "Second 2."]);
  });
});

describe("a save inside a scene entered by a thread", () => {
  const THREAD = (params: string) =>
    [
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

describe("a local declared again in the scope that binds it", () => {
  it("closes a captured local on its old value", () => {
    const story = engine(
      rootOf(
        [
          "store keep = nil",
          "",
          "scene start",
          "  & local c = 30",
          "  & keep = function() return c end",
          "  & c = 35",
          "  & local c = 40",
          "  First {c} {keep()}.",
          "end",
          "",
        ].join("\n"),
      ),
    );
    expect(play(story)).toEqual(["First 40 35."]);
  });
});
