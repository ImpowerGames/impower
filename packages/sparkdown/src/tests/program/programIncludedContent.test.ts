// A script other than main on the program path (#1387, Feature #1386): every
// script under the main script's folder is part of the program with no include
// line, and a script other than main holds declarations only. Its scenes are
// flows of their own in its script, so their statements carry line tables and
// addresses in that script, an edit inside one re-emits one chunk and keeps
// every other, and a save taken before the edit loads after it. Its top-level
// lines other than declarations report an error and are dropped, and the
// writes of its member functions run with the declarations, after every
// script's globals initialize (I-1438), so no `$include:` flow stands for
// it. A `run` statement is a call of its file's wrapper where its line
// stands, a statement of the flow it is written in (I-1439).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import { blockCount, chunkId } from "../../program/ProgramChunk";
import {
  describeRoot,
  programCompiler,
  rootChunks,
  scriptFiles,
  storyBeats,
  storyRun,
} from "./programHarness";

const MAIN = "file://proj/main.sd";
const FIRST = "file://proj/includes/first.sd";
const SECOND = "file://proj/includes/second.sd";
const INNER = "file://proj/includes/inner.sd";

const OUTSIDE_SCENE =
  "Only main.sd runs lines outside a scene. Move this into a scene or into main.sd.";

const quiet = <T>(run: () => T): T => {
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

const lines = (...text: string[]) => [...text, ""].join("\n");

/** The qualified name of the flow of an included script's top-level content:
 *  `$include:` and the script's uri, each `.` written `%2E`. */
const includedFlowName = (uri: string) => `$include:${uri.replace(/\./g, "%2E")}`;

/** The files of a project of `texts`, scripts, and `luau`, the Luau files a
 *  `run` statement runs, by uri. */
const projectFiles = (texts: Record<string, string>, luau: Record<string, string>) => [
  ...scriptFiles(texts),
  ...Object.entries(luau).map(([uri, text]) => ({
    uri,
    type: "script",
    name: uri.split("/").at(-1)!.split(".")[0]!,
    ext: "luau",
    text,
    version: 1,
    languageId: "luau",
  })),
];

const compileProgram = (texts: Record<string, string>, luau: Record<string, string> = {}) =>
  quiet(() =>
    programCompiler(texts, {
      files: projectFiles(texts, luau) as never,
    }).compile(MAIN),
  ).program;

const rootOf = (texts: Record<string, string>, luau: Record<string, string> = {}): ProgramRoot => {
  const program = compileProgram(texts, luau);
  expect(program.chunks).toBeDefined();
  return program.chunks!;
};

/** What `texts` shows, taking `picks` at its menus. */
const shows = (
  texts: Record<string, string>,
  picks: number[] = [],
  luau: Record<string, string> = {},
) => {
  const root = rootOf(texts, luau);
  const actual = quiet(() => storyRun(new ProgramStory(root), picks));
  return {
    beats: actual.beats.map((beat) => beat.text),
    menus: actual.menus.map((menu) => menu.choices.map((choice) => choice.text)),
    errors: actual.errors,
  };
};

/** Every error of `program`, as the uri and line it is reported at and its
 *  message, by uri and then line. */
const reported = (program: SparkProgram): [string, number, string][] =>
  Object.entries(program.diagnostics ?? {})
    .flatMap(([uri, diagnostics]) =>
      diagnostics
        .filter((d) => d.severity === 1)
        .map((d): [string, number, string] => [
          uri,
          d.range.start.line,
          typeof d.message === "string" ? d.message : d.message.value,
        ]),
    )
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x - y));

describe("a script other than main", () => {
  it("is part of the program with no include line: its store and its scene are main's to use, and its top-level content is reported and dropped", () => {
    const texts = {
      [MAIN]: lines("This is the main file", "-> knot"),
      [FIRST]: lines("This is include 1."),
      [INNER]: lines(
        "store t2 = 5",
        "",
        "The value in the inner file is { t2 }.",
        "",
        "scene knot",
        "  From the knot, { t2 }.",
        "  fin",
        "end",
      ),
    };
    const program = compileProgram(texts);
    expect(reported(program)).toEqual([
      [FIRST, 0, OUTSIDE_SCENE],
      [INNER, 2, OUTSIDE_SCENE],
    ]);
    const root = program.chunks!;
    expect(root.flowNamed(includedFlowName(FIRST))).toBeUndefined();
    expect(root.flowNamed(includedFlowName(INNER))).toBeUndefined();
    const shown = shows(texts);
    expect(shown.errors).toEqual([]);
    expect(shown.beats).toEqual(["This is the main file\n", "From the knot, 5.\n"]);
  });

  it("runs a `run` statement's Luau file where the statement stands", () => {
    expect(
      shows(
        { [MAIN]: lines("store counter = 0", "run start", "Main {counter}.") },
        [],
        { "file://proj/start.luau": "counter = 7\n" },
      ).beats,
    ).toEqual(["Main 7.\n"]);
  });

  it("has no `$include:` flow of its own, and a `run` statement is a statement of main's top level, on the run line", () => {
    const texts = {
      [MAIN]: lines("store counter = 0", "run start", "Main {counter}.", "-> S"),
      // The declarations a script other than main may hold (`external`, an
      // error in a program of its own, aside).
      [FIRST]: lines(
        "store step = 1",
        "const big = 10",
        "type Point = { x: number, y: number }",
        "",
        "define hero as character with",
        '  name = "Hero"',
        "end",
        "",
        "function bump()",
        "  counter += step",
        "  return counter",
        "end",
      ),
      [SECOND]: lines("scene S", "  In S {bump()}.", "  -> .more", "  branch more", "    More.", "  end", "end"),
    };
    const luau = { "file://proj/start.luau": "counter = 7\n" };
    const program = compileProgram(texts, luau);
    expect(reported(program)).toEqual([]);
    const root = program.chunks!;
    // The `$include:` flows, by the uri each stands for.
    const included = root
      .flowSequences()
      .map((row) => [root.table.symbols[row.flow]!, row.uri] as const)
      .filter(([name]) => name.startsWith("$include:"));
    for (const uri of [MAIN, FIRST, SECOND]) {
      expect(root.flowNamed(includedFlowName(uri))).toBeUndefined();
    }
    // Nor has the `run` statement: its call runs in main's top level.
    expect(included).toEqual([]);
    // The top level calls the wrapper on the run line, and goes on to main's
    // next.
    const top = root.flowNamed("")!;
    expect(
      top.arrays.chunks.map((chunk) => root.locationOf(chunkId(chunk) * 2 ** 21)),
    ).toMatchObject([
      { uri: MAIN, startLine: 1 },
      { uri: MAIN, startLine: 2 },
      { uri: MAIN, startLine: 3 },
    ]);
    expect(shows(texts, [], luau).beats).toEqual(["Main 7.\n", "In S 8.\n", "More.\n"]);
  });

  // A member function's write (#1387) runs with the declarations, before
  // main's top level, and not as a flow of its script (I-1438).
  it("has no `$include:` flow for its member functions' writes, which run before main's top level", () => {
    const texts = {
      [MAIN]: lines("Main {api.twice(3)}."),
      [FIRST]: lines("store api = {}", "", "function api.twice(n)", "  return n * 2", "end"),
    };
    const root = rootOf(texts);
    const included = root
      .flowSequences()
      .map((row) => [root.table.symbols[row.flow]!, row.uri] as const)
      .filter(([name]) => name.startsWith("$include:"));
    expect(included).toEqual([]);
    expect(shows(texts).beats).toEqual(["Main 6.\n"]);
  });

  it("emits no `$include:` flow for any script of a project, and declares main's globals, then each script's in path order, then the scripts' writes", () => {
    const texts = {
      [MAIN]: lines("store total = 2", "run start", "Main {api.twice(total)} {api.add(1)}.", "-> S"),
      [FIRST]: lines("store api = {}", "", "function api.twice(n)", "  return n * 2", "end"),
      // A write into a table another script declares, and a scene.
      [SECOND]: lines(
        "store base = 10",
        "",
        "function api.add(n)",
        "  return n + base",
        "end",
        "",
        "scene S",
        "  In S {api.twice(base)}.",
        "end",
      ),
    };
    const luau = { "file://proj/start.luau": "total = total + 1\n" };
    const program = compileProgram(texts, luau);
    expect(reported(program)).toEqual([]);
    const root = program.chunks!;
    expect(
      root
        .flowSequences()
        .map((row) => root.table.symbols[row.flow]!)
        .filter((name) => name.startsWith("$include:")),
    ).toEqual([]);
    for (const uri of [MAIN, FIRST, SECOND]) {
      expect(root.flowNamed(includedFlowName(uri))).toBeUndefined();
    }
    // The declaration chunks in the order they run, by script and first
    // line: the globals, main's first and then each script's in path order,
    // and then the writes, in the same order.
    const scripts = new Set([MAIN, FIRST, SECOND]);
    expect(
      root.initialization
        .map((chunk) => root.locationOf(chunkId(chunk) * 2 ** 21))
        .filter((at) => at && scripts.has(at.uri))
        .map((at) => [at!.uri, at!.startLine]),
    ).toEqual([
      [MAIN, 0],
      [FIRST, 0],
      [SECOND, 0],
      [FIRST, 2],
      [SECOND, 2],
    ]);
    // Main's top level holds its own lines alone.
    const top = root.flowNamed("")!;
    expect(
      top.arrays.chunks.map((chunk) => root.locationOf(chunkId(chunk) * 2 ** 21)),
    ).toMatchObject([
      { uri: MAIN, startLine: 1 },
      { uri: MAIN, startLine: 2 },
      { uri: MAIN, startLine: 3 },
    ]);
    expect(shows(texts, [], luau)).toEqual({
      beats: ["Main 6 11.\n", "In S 20.\n"],
      menus: [],
      errors: [],
    });
  });

  it("holds its scenes as flows of their own in its script, at their lines, and adds nothing to the top level", () => {
    const texts = {
      [MAIN]: lines("Main.", "-> S"),
      [FIRST]: lines("", "scene S", "  First one.", "  First two.", "  -> T", "end"),
      [SECOND]: lines("scene T", "  Second one.", "end"),
    };
    const root = rootOf(texts);
    const flows = (uri: string) =>
      root.flows(uri).map((row) => [root.table.symbols[row.flow], row.uri, root.firstLineOf(row)]);
    // A scene's first line is the first line of its body.
    expect(flows(FIRST)).toEqual([["S", FIRST, 2]]);
    expect(flows(SECOND)).toEqual([["T", SECOND, 1]]);
    expect(root.flowNamed(includedFlowName(FIRST))).toBeUndefined();
    expect(root.flowNamed(includedFlowName(SECOND))).toBeUndefined();
    // Each line of a scene has its address in its own script.
    const two = root.addressAt(FIRST, 3)!;
    expect(root.locationOf(two)).toMatchObject({ uri: FIRST, startLine: 3 });
    expect(root.sceneAt(two)).toBe("S");
    // The top level holds main's lines alone.
    const top = root.flowNamed("")!;
    expect(
      top.arrays.chunks.map((chunk) => root.locationOf(chunkId(chunk) * 2 ** 21)),
    ).toMatchObject([
      { uri: MAIN, startLine: 0 },
      { uri: MAIN, startLine: 1 },
    ]);
    // A story started at a line of the scene runs the rest of it and the
    // scene it diverts to.
    const story = new ProgramStory(root);
    story.ChooseAddress(two);
    expect(storyBeats(story).beats.map((beat) => beat.text)).toEqual([
      "First two.\n",
      "Second one.\n",
    ]);
  });
});

describe("the consumers of a script other than main", () => {
  const texts = {
    [MAIN]: lines("[[show backdrop room]] Main.", "-> F"),
    [FIRST]: lines(
      "scene F",
      "  local x = 1",
      "  [[show portrait bunny]] Included {x}.",
      "  Still included.",
      "end",
    ),
  };
  const image = (name: string, ext: string) => ({
    uri: `file://proj/${name}.${ext}`,
    type: "image",
    name,
    ext,
    src: `/file:/proj/${name}.${ext}?v=1`,
  });

  it("records a scene's beats and assets under that scene, and main's under the top level", () => {
    const program = quiet(() =>
      programCompiler(texts, {
        files: [...scriptFiles(texts), image("room", "png"), image("bunny", "svg")] as never,
      }).compile(MAIN),
    ).program;
    expect(program.chunks).toBeDefined();
    const root = program.chunks!;
    const assets = program.sceneAssets!;
    expect(assets["0"]!.image).toEqual(["room"]);
    expect(assets["F"]!.image).toEqual(["bunny"]);
    const beatsOf = (flow: string) =>
      assets[flow]!.beats.map((beat) => ({
        at: root.locationOf(beat.address as number),
        image: beat.image,
      }));
    expect(beatsOf("0")).toMatchObject([{ at: { uri: MAIN, startLine: 0 }, image: ["room"] }]);
    expect(beatsOf("F")).toMatchObject([{ at: { uri: FIRST, startLine: 2 }, image: ["bunny"] }]);
    // The beat a preview of the scene's line finds is its own.
    const address = root.addressAt(FIRST, 2)!;
    expect(root.sceneAt(address)).toBe("F");
    expect(assets["F"]!.beats.findIndex((beat) => beat.address === address)).toBe(0);
  });
});

function posAt(text: string, offset: number) {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
}

/** A compiler over `texts` and the Luau files `luau` with statement chunks
 *  on, and an editor of any of its scripts that compiles the main script
 *  after each edit. */
function session(initial: Record<string, string>, luau: Record<string, string> = {}) {
  const texts = { ...initial };
  const c = programCompiler(texts, {
    seedBuiltinsIntoStory: true,
    files: projectFiles(texts, luau) as never,
  });
  let version = 1;
  let program = quiet(() => c.compile(MAIN).program);
  let root = program.chunks!;
  return {
    get root() {
      return root;
    },
    get program() {
      return program;
    },
    get texts() {
      return { ...texts };
    },
    get store() {
      return c.compiler.chunkStore!;
    },
    compiler: c.compiler,
    /** Replaces the first `find` in `uri` with `replace` as one edit. */
    edit(uri: string, find: string, replace: string): ProgramRoot {
      const text = texts[uri]!;
      const offset = text.indexOf(find);
      expect(offset, `"${find}" is in ${uri}`).toBeGreaterThanOrEqual(0);
      version += 1;
      c.compiler.updateDocument({
        textDocument: { uri, version },
        contentChanges: [
          {
            range: { start: posAt(text, offset), end: posAt(text, offset + find.length) },
            text: replace,
          },
        ],
      });
      texts[uri] = text.slice(0, offset) + replace + text.slice(offset + find.length);
      const { warn, error, log } = console;
      const said: string[] = [];
      console.warn = console.error = console.log = (...args: unknown[]) => {
        said.push(args.map(String).join(" "));
      };
      try {
        program = c.compile(MAIN).program;
      } finally {
        console.warn = warn;
        console.error = error;
        console.log = log;
      }
      expect(program.chunks, said.join("\n").slice(0, 3000)).toBeDefined();
      root = program.chunks!;
      return root;
    },
  };
}

/** The chunks of `after` that `before` does not hold, and those of `before`
 *  that `after` does not. */
const chunkChanges = (before: ProgramRoot, after: ProgramRoot) => {
  const was = new Set(rootChunks(before));
  const is = new Set(rootChunks(after));
  return {
    added: rootChunks(after).filter((chunk) => !was.has(chunk)),
    dropped: rootChunks(before).filter((chunk) => !is.has(chunk)),
  };
};

/** `root` by content, beside a cold compile's of the same texts. */
const matchesCold = (root: ProgramRoot, texts: Record<string, string>) => {
  const program = quiet(() =>
    programCompiler(texts, { seedBuiltinsIntoStory: true }).compile(MAIN),
  ).program;
  expect(program.chunks).toBeDefined();
  const cold = program.chunks!;
  expect(describeRoot(root)).toEqual(describeRoot(cold));
  expect(storyRun(new ProgramStory(root), [0]).beats).toEqual(
    storyRun(new ProgramStory(cold), [0]).beats,
  );
};

const PROJECT = {
  [MAIN]: lines(
    "-> F ->",
    "Main one.",
    "Main two.",
    "",
    "scene S",
    "  In S.",
    "end",
  ),
  [FIRST]: lines(
    "scene F",
    "  First one.",
    "  First two.",
    "  First three.",
    "  choose",
    "    * Pick",
    "      Picked.",
    "  then",
    "    After pick.",
    "  end",
    "  First four.",
    "  ->->",
    "end",
  ),
  [SECOND]: lines("scene T", "  In T.", "end"),
};

describe("an edit inside a script other than main", () => {
  it("re-emits exactly one chunk and keeps every other, for a beat and for a statement inside a `then` clause", () => {
    const s = session(PROJECT);
    for (const [find, replace] of [
      ["First two.", "First two, edited."],
      ["After pick.", "After pick, edited."],
      ["First four.", "First four, edited."],
    ] as const) {
      const before = s.root;
      const after = s.edit(FIRST, find, replace);
      expect(s.store.emittedLastBuild).toBe(1);
      const { added, dropped } = chunkChanges(before, after);
      expect(added).toHaveLength(1);
      expect(dropped).toHaveLength(1);
      expect(rootChunks(after)).toHaveLength(rootChunks(before).length);
      matchesCold(after, s.texts);
    }
  });

  // The statements of a block's bodies that an edit leaves as they were are
  // served from their memos (#656) in a script other than main as in main.
  it("serves the unedited statements of a long `then` clause from their memos, and re-emits only the edited one", () => {
    const scene = [
      "scene F",
      "  Pick.",
      "  choose",
      "    * Go",
      "      Went.",
      "  then",
      ...Array.from({ length: 300 }, (_, i) => `    Clause line ${i}.`),
      "  end",
      "end",
    ];
    const s = session({
      [MAIN]: lines("-> F"),
      [FIRST]: lines(...scene),
    });
    const alone = session({ [MAIN]: lines("-> F", "", ...scene) });
    // The first incremental parse after a cold one reparses the whole block
    // (`programStatementMemo.test.ts`, `warmSession`).
    s.edit(FIRST, "Clause line 50.", "Clause line 50, warm.");
    alone.edit(MAIN, "Clause line 50.", "Clause line 50, warm.");
    const before = s.root;
    const after = s.edit(FIRST, "Clause line 150.", "Clause line 150, edited.");
    alone.edit(MAIN, "Clause line 150.", "Clause line 150, edited.");
    // As many as the same block serves in the starting script.
    const served = s.compiler.memoStats(FIRST)!.served;
    expect(served).toBeGreaterThan(100);
    expect(served).toBe(alone.compiler.memoStats(MAIN)!.served);
    expect(s.store.emittedLastBuild).toBe(1);
    expect(chunkChanges(before, after).added).toHaveLength(1);
    matchesCold(after, s.texts);
  });

  it("emits only the inserted statement when a line is inserted, and moves the lines below it", () => {
    const s = session(PROJECT);
    const before = s.root;
    const after = s.edit(FIRST, "  First three.", "  First two and a half.\n  First three.");
    expect(s.store.emittedLastBuild).toBe(1);
    expect(chunkChanges(before, after)).toMatchObject({ added: [expect.anything()], dropped: [] });
    expect(after.locationOf(after.addressAt(FIRST, 4)!)).toMatchObject({
      uri: FIRST,
      startLine: 4,
    });
    matchesCold(after, s.texts);
  });

  // A member function's write is a declaration chunk of its script
  // (I-1438), whose function's body keeps its statements' chunks as a scene
  // does.
  it("re-emits one chunk for an edit inside a member function's body, and runs the edited function from main's first line", () => {
    const s = session({
      [MAIN]: lines("Main {api.twice(3)} {api.half(8)}."),
      [FIRST]: lines(
        "store api = {}",
        "",
        "function api.twice(n)",
        "  return n * 2",
        "end",
        "",
        "function api.half(n)",
        "  return n / 2",
        "end",
      ),
    });
    const run = () =>
      quiet(() => storyRun(new ProgramStory(s.root))).beats.map((beat) => beat.text);
    expect(run()).toEqual(["Main 6 4.\n"]);
    // The chunks of the script's declarations, their bodies' included.
    const declared = (root: ProgramRoot): Int32Array[] => {
      const of = (chunks: readonly Int32Array[]): Int32Array[] =>
        chunks.flatMap((chunk) => [
          chunk,
          ...Array.from({ length: blockCount(chunk) }, (_, k) =>
            of(root.body(chunk, k)?.arrays.chunks ?? []),
          ).flat(),
        ]);
      return of(root.declarations(FIRST)!.arrays.chunks);
    };
    const before = s.root;
    const was = declared(before);
    const after = s.edit(FIRST, "n * 2", "n * 3");
    expect(s.store.emittedLastBuild).toBe(1);
    const is = declared(after);
    expect(is.filter((chunk) => !was.includes(chunk))).toHaveLength(1);
    expect(was.filter((chunk) => !is.includes(chunk))).toHaveLength(1);
    expect(is).toHaveLength(was.length);
    matchesCold(after, s.texts);
    expect(run()).toEqual(["Main 9 4.\n"]);
  });

  // The line is a declaration chunk of the global and one of the write, in
  // one declaration sequence, each keeping its own chunk.
  it("keeps both chunks of a line that declares a table and writes its member function when another line is edited", () => {
    const s = session({
      [MAIN]: lines("Main {api.f()}."),
      [FIRST]: lines("& store api = {}; function api.f() return 7 end"),
    });
    const before = s.root;
    const after = s.edit(MAIN, "Main", "Main, edited,");
    expect(s.store.emittedLastBuild).toBe(1);
    expect(after.declarations(FIRST)!.arrays.chunks).toEqual(
      before.declarations(FIRST)!.arrays.chunks,
    );
    matchesCold(after, s.texts);
    expect(quiet(() => storyRun(new ProgramStory(after))).beats.map((beat) => beat.text)).toEqual([
      "Main, edited, 7.\n",
    ]);
  });

  it("matches a cold compile when a script other than main gains top-level content, which it reports and drops, and loses it again", () => {
    const s = session(PROJECT);
    s.edit(SECOND, "scene T", "Second top.\n\nscene T");
    matchesCold(s.root, s.texts);
    expect(reported(s.program)).toEqual([[SECOND, 0, OUTSIDE_SCENE]]);
    expect(s.root.flowNamed(includedFlowName(SECOND))).toBeUndefined();
    expect(storyRun(new ProgramStory(s.root), [0]).beats.map((beat) => beat.text)).toEqual([
      "First one.\n",
      "First two.\n",
      "First three.\n",
      "Pick\n",
      "Picked.\n",
      "After pick.\n",
      "First four.\n",
      "Main one.\n",
      "Main two.\n",
    ]);
    s.edit(SECOND, "Second top.\n\n", "");
    matchesCold(s.root, s.texts);
    expect(reported(s.program)).toEqual([]);
    expect(s.root.flowNamed(includedFlowName(SECOND))).toBeUndefined();
  });
});

describe("an edit to main's `run` lines", () => {
  // What `root` shows, after checking that it is the root a cold compile of
  // the same texts builds and shows the same.
  const runsAsCold = (root: ProgramRoot, texts: Record<string, string>, luau: Record<string, string>) => {
    const cold = quiet(() =>
      programCompiler(texts, {
        seedBuiltinsIntoStory: true,
        files: projectFiles(texts, luau) as never,
      }).compile(MAIN),
    ).program.chunks!;
    expect(describeRoot(root)).toEqual(describeRoot(cold));
    const shown = storyRun(new ProgramStory(root)).beats.map((beat) => beat.text);
    expect(shown).toEqual(storyRun(new ProgramStory(cold)).beats.map((beat) => beat.text));
    return shown;
  };

  // Each Luau file adds its letter to `log`.
  const letters = Object.fromEntries(
    ["a", "b", "c", "d"].map((name) => [
      `file://proj/lib/${name}.luau`,
      `log = log .. "${name.toUpperCase()}"\n`,
    ]),
  );

  it("runs the files in their new order after main swaps two run lines in the middle", () => {
    const s = session(
      { [MAIN]: lines('store log = ""', "run a", "run b", "run c", "run d", "Main {log}.") },
      letters,
    );
    expect(storyRun(new ProgramStory(s.root)).beats.map((beat) => beat.text)).toEqual([
      "Main ABCD.\n",
    ]);
    s.edit(MAIN, "run b\nrun c", "run c\nrun b");
    expect(runsAsCold(s.root, s.texts, letters)).toEqual(["Main ACBD.\n"]);
  });

  it("runs as a cold compile does when main gains a run line and loses it again", () => {
    const s = session(
      {
        [MAIN]: lines('store log = ""', "run a", "run b", "Main {log}.", "-> T"),
        [SECOND]: lines("scene T", "  In T.", "end"),
      },
      letters,
    );
    s.edit(MAIN, "run b", "run b\nrun c");
    expect(runsAsCold(s.root, s.texts, letters)).toEqual(["Main ABC.\n", "In T.\n"]);
    s.edit(MAIN, "\nrun c", "");
    expect(runsAsCold(s.root, s.texts, letters)).toEqual(["Main AB.\n", "In T.\n"]);
  });

  // A run line in a scene is a statement of the scene's flow (I-1439), which
  // an edit to another line of the scene builds again around it.
  it("runs as a cold compile does after an edit to a scene that holds a run line, and after the run line moves", () => {
    const s = session(
      {
        [MAIN]: lines(
          'store log = ""',
          "-> T",
          "",
          "scene T",
          "  In T {log}.",
          "  run a",
          "  Then {log}.",
          "  run b",
          "  Last {log}.",
          "end",
        ),
      },
      letters,
    );
    expect(storyRun(new ProgramStory(s.root)).beats.map((beat) => beat.text)).toEqual([
      "In T .\n",
      "Then A.\n",
      "Last AB.\n",
    ]);
    s.edit(MAIN, "  Then {log}.", "  Then, now, {log}.");
    expect(runsAsCold(s.root, s.texts, letters)).toEqual(["In T .\n", "Then, now, A.\n", "Last AB.\n"]);
    s.edit(MAIN, "  run a\n", "");
    s.edit(MAIN, "  Last {log}.", "  run a\n  Last {log}.");
    expect(runsAsCold(s.root, s.texts, letters)).toEqual(["In T .\n", "Then, now, .\n", "Last BA.\n"]);
  });
});

/** An engine on `root` that keeps its beat images, as a game's does. */
const saving = (root: ProgramRoot) => {
  const story = new ProgramStory(root);
  story.keepBeatImages = true;
  story.onError = () => {};
  return story;
};

describe("a save taken inside a scene of a script other than main", () => {
  it("loads after an edit above it at a menu the scene raised, and takes a choice there", () => {
    const s = session(PROJECT);
    const story = saving(s.root);
    while (story.canContinue) {
      story.Continue();
    }
    expect(story.currentChoices.map((choice) => choice.text)).toEqual(["Pick"]);
    const save = story.toSave();
    const after = s.edit(FIRST, "  First three.", "  First two and a half.\n  First three.");
    const loaded = saving(after);
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.exact).toBe(true);
    expect(storyRun(loaded, [0]).beats.map((beat) => beat.text)).toEqual([
      "Pick\n",
      "Picked.\n",
      "After pick.\n",
      "First four.\n",
      "Main one.\n",
      "Main two.\n",
    ]);
  });

  it("loads after an edit above it inside a tunnel the scene called, and returns into the scene", () => {
    const texts = {
      [MAIN]: lines("-> F ->", "Main."),
      [FIRST]: lines(
        "scene F",
        "  Before.",
        "  -> side ->",
        "  Back in the scene.",
        "  ->->",
        "end",
        "",
        "scene side",
        "  Side one.",
        "  Side two.",
        "  ->->",
        "end",
      ),
    };
    const s = session(texts);
    const story = saving(s.root);
    const shown: string[] = [];
    while (story.canContinue && shown.length < 2) {
      shown.push(story.Continue()!.trim());
    }
    expect(shown).toEqual(["Before.", "Side one."]);
    const save = story.toSave();
    const after = s.edit(FIRST, "  Before.", "  Before.\n  Also before.");
    const loaded = saving(after);
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.exact).toBe(true);
    expect(storyRun(loaded).beats.map((beat) => beat.text)).toEqual([
      "Side two.\n",
      "Back in the scene.\n",
      "Main.\n",
    ]);
  });

  it("loads after a line was inserted above its statement, at the same statement", () => {
    const s = session(PROJECT);
    const story = new ProgramStory(s.root);
    story.keepBeatImages = true;
    story.onError = () => {};
    const shown: string[] = [];
    while (story.canContinue && shown.length < 2) {
      shown.push(story.Continue()!.trim());
    }
    expect(shown).toEqual(["First one.", "First two."]);
    const save = story.toSave();
    const saved = JSON.parse(save).beats.at(-1).position.st.levels;
    expect(saved[0].flow).toBe("F");

    const after = s.edit(FIRST, "  First two.", "  First one and a half.\n  First two.");
    const loaded = new ProgramStory(after);
    loaded.keepBeatImages = true;
    loaded.onError = () => {};
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    expect(report.exact).toBe(true);
    expect(report.beat).toBe(report.beats - 1);
    const position = loaded.state.position!;
    expect(after.table.symbols[position.sequence.flow]).toBe("F");
    // The statement after the saved beat, which the insertion moved down an
    // entry from where the save names it.
    expect(position.entry).toBe(saved.at(-1).at + 1);
    expect(storyRun(loaded, [0]).beats.map((beat) => beat.text)).toEqual([
      "First three.\n",
      "Pick\n",
      "Picked.\n",
      "After pick.\n",
      "First four.\n",
      "Main one.\n",
      "Main two.\n",
    ]);
  });
});

// A line that declares a global and writes a member function is two chunks
// of its script's declaration sequence from one source: the write's chunk
// hashes its role with that source (`memberWriteFingerprint`), so a save
// never takes the global's chunk, or a closure of its initializer, for the
// write (round 4 of the review of I-1438).
describe("a save of a member function written on a line that declares its table", () => {
  const A = "file://proj/scripts/a.sd";
  const menu = lines("Before.", "choose", "  * Go", "    Result {api.f()}.", "end");
  const shared = lines("& store api = {}; function api.f() return 7 end");
  const edits = {
    "a global function added above the line, and a closure added to its table": lines(
      "store added = function() return 101 end",
      "& store api = { decoy = function() return 2 end }; function api.f() return 7 end",
    ),
    "a global added above the line, and a closure added to its table": lines(
      "store added = 10",
      "& store api = { decoy = function() return 2 end }; function api.f() return 7 end",
    ),
  };
  const programOf = (script: string) =>
    quiet(() =>
      programCompiler({ [MAIN]: menu, [A]: script }, { seedBuiltinsIntoStory: true }).compile(MAIN),
    ).program;
  /** A save at the menu of `story`, continued to it. */
  const saveAtMenu = (story: ProgramStory) => {
    story.keepBeatImages = true;
    quiet(() => {
      while (story.canContinue) story.Continue();
    });
    expect(story.currentChoices.map((choice) => choice.text)).toEqual(["Go"]);
    return story.toSave();
  };
  /** `save` loaded into the program of `script`, and Go taken: the write's
   *  own function runs, from a place the load says it found exactly. */
  const loadsTheWrite = (save: string, script: string) => {
    const program = programOf(script);
    expect(reported(program)).toEqual([]);
    const loaded = new ProgramStory(program.chunks!);
    loaded.keepBeatImages = true;
    const errors: string[] = [];
    loaded.onError = (message: string) => {
      errors.push(message);
    };
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    const run = storyRun(loaded, [0]);
    expect({ exact: report.exact, warnings: report.warnings, beats: run.beats.map((beat) => beat.text) }).toEqual({
      exact: true,
      warnings: [],
      beats: ["Go\n", "Result 7.\n"],
    });
    expect(run.errors).toEqual([]);
    expect(errors).toEqual([]);
  };

  it.each(Object.entries(edits))(
    "keeps the write's function when a save taken on this program loads after %s",
    (_, edited) => {
      loadsTheWrite(saveAtMenu(new ProgramStory(programOf(shared).chunks!)), edited);
    },
  );

  it.each(Object.entries(edits))(
    "keeps the write's function when a save taken before I-1438, loaded and saved again, loads after %s",
    (_, edited) => {
      const old = OLD_SAVES.find(
        (c) => c.name === "a member function written on the line that declares its table",
      )!;
      const story = new ProgramStory(programOf(shared).chunks!);
      story.onError = () => {};
      story.loadSave(old.save);
      loadsTheWrite(saveAtMenu(story), edited);
    },
  );
});

// Saves taken before I-1438, which name a member function's write of a
// script other than main by the `$include:` flow its script's top level then
// had. Each was written by `toSave` at ae10deabd, at the menu, for the
// project of main and one script beside it that the fixture holds with it
// (round 1 and round 2 of the review of I-1438).
const OLD_SAVES: {
  name: string;
  uri: string;
  main: string;
  script: string;
  result: string;
  save: string;
}[] = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "fixtures", "program-save-member-writes-include.json"),
    "utf-8",
  ),
);

describe("a save taken before a member function's write ran with the declarations", () => {
  it.each(OLD_SAVES)("loads, and calls the function it holds: $name", ({ uri, main, script, result, save }) => {
    const program = quiet(() =>
      programCompiler({ [MAIN]: main, [uri]: script }, { seedBuiltinsIntoStory: true }).compile(MAIN),
    ).program;
    expect(reported(program)).toEqual([]);
    const loaded = new ProgramStory(program.chunks!);
    loaded.keepBeatImages = true;
    const errors: string[] = [];
    loaded.onError = (message: string) => {
      errors.push(message);
    };
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    expect(report.exact).toBe(true);
    expect(report.warnings).toEqual([]);
    const run = storyRun(loaded, [0]);
    expect(run.menus.map((menu) => menu.choices.map((choice) => choice.text))).toEqual([["Go"]]);
    expect(run.beats.map((beat) => beat.text)).toEqual(["Go\n", `${result}\n`]);
    expect(run.errors).toEqual([]);
    expect(errors).toEqual([]);
  });
});
