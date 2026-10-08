// An included script's top-level content on the program path (#1681,
// docs/engine/binary-program.md, What is built, Flows and statements): the
// lines other than declarations written at the top of a script that `include`
// pulls in run where the current engine runs them, before the including
// script's own top-level content, in include order, nested includes first.
// The content is a flow of its own in its script, so its statements carry
// line tables and addresses in that script, an edit inside it re-emits one
// chunk and keeps every other, and a save taken before the edit loads after
// it.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import type { Story } from "../../inkjs/engine/Story";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import { SymbolKind } from "../../program/ProgramSymbols";
import { chunkId } from "../../program/StatementChunk";
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
      programChunks: true,
      files: projectFiles(texts, luau) as never,
    }).compile(MAIN),
  ).program;

const rootOf = (texts: Record<string, string>, luau: Record<string, string> = {}): ProgramRoot => {
  const program = compileProgram(texts, luau);
  expect(program.fallback).toBeUndefined();
  return program.chunks!;
};

/** What `texts` shows on the program engine, taking `picks` at its menus,
 *  after checking that the current engine shows the same. */
const shows = (
  texts: Record<string, string>,
  picks: number[] = [],
  luau: Record<string, string> = {},
) => {
  const root = rootOf(texts, luau);
  const current = quiet(() =>
    programCompiler(texts, { files: projectFiles(texts, luau) as never }).compile(MAIN),
  ).story as Story;
  current.ResetState();
  const expected = quiet(() => storyRun(current, picks));
  const actual = quiet(() => storyRun(new ProgramStory(root), picks));
  expect(actual).toEqual(expected);
  return {
    beats: actual.beats.map((beat) => beat.text),
    menus: actual.menus.map((menu) => menu.choices.map((choice) => choice.text)),
    errors: actual.errors,
  };
};

describe("an included script's top-level content", () => {
  it("compiles to statement chunks and runs at the include, in include order, as on the current engine", () => {
    const shown = shows({
      [MAIN]: lines(
        "include includes/first.sd",
        "include includes/second.sd",
        "This is the main file.",
        "done",
      ),
      [FIRST]: lines("This is include 1."),
      [SECOND]: lines("This is include 2."),
    });
    expect(shown.errors).toEqual([]);
    expect(shown.beats).toEqual([
      "This is include 1.\n",
      "This is include 2.\n",
      "This is the main file.\n",
    ]);
  });

  it("runs a nested include's content before the content of the script that includes it", () => {
    const shown = shows({
      [MAIN]: lines("include includes/first.sd", "This is the main file", "-> knot"),
      [FIRST]: lines("include inner.sd", "First's own line."),
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
    });
    expect(shown.errors).toEqual([]);
    expect(shown.beats).toEqual([
      "The value in the inner file is 5.\n",
      "First's own line.\n",
      "This is the main file\n",
      "From the knot, 5.\n",
    ]);
  });

  it("runs a nested include's content when the script that includes it has none of its own", () => {
    const shown = shows({
      [MAIN]: lines("include includes/first.sd", "Main."),
      [FIRST]: lines("include inner.sd", "", "scene unused", "  Unused.", "end"),
      [INNER]: lines("Inner."),
    });
    expect(shown.beats).toEqual(["Inner.\n", "Main.\n"]);
  });

  // The current engine ends the story where the content of an included
  // script that holds a label ends, and runs nothing of the including
  // script's content after it; the program engine runs on, as the content of
  // an include does everywhere else, and is not compared with it here.
  it("runs on through the rest of the content and back after a jump to a label of it", () => {
    const root = rootOf({
      [MAIN]: lines(
        "include includes/first.sd",
        "store passes = 0",
        "Main {passes}.",
        "& passes = passes + 1",
        "if passes < 3 then",
        "  -> again",
        "end",
        "Main done.",
      ),
      [FIRST]: lines("Included before.", "label again", "Included after {passes}."),
    });
    const shown = storyRun(new ProgramStory(root));
    expect(shown.errors).toEqual([]);
    expect(shown.beats.map((beat) => beat.text)).toEqual([
      "Included before.\n",
      "Included after 0.\n",
      "Main 0.\n",
      "Included after 1.\n",
      "Main 1.\n",
      "Included after 2.\n",
      "Main 2.\n",
      "Main done.\n",
    ]);
  });

  it("runs in the including flow's frame: a local it declares is the including script's, and a tunnel and a thread return into it", () => {
    expect(
      shows({
        [MAIN]: lines("include includes/first.sd", "Main {x}."),
        [FIRST]: lines(
          "local x = 3",
          "Included {x}.",
          "-> side ->",
          "Back.",
          "<- aside",
          "After the thread.",
          "",
          "scene side",
          "  Side.",
          "  ->->",
          "end",
          "",
          "scene aside",
          "  Aside.",
          "end",
        ),
      }).beats,
    ).toEqual([
      "Included 3.\n",
      "Side.\n",
      "Back.\n",
      "Aside.\n",
      "After the thread.\n",
      "Main 3.\n",
    ]);
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

  it("runs the content before the including script's own content written above the include, and keeps doing so through an edit there", () => {
    const texts = {
      [MAIN]: lines("Main first.", "include includes/first.sd", "Main after."),
      [FIRST]: lines("Included."),
    };
    expect(shows(texts).beats).toEqual(["Included.\n", "Main first.\n", "Main after.\n"]);
    const s = session(texts);
    s.edit(MAIN, "Main first.", "Main first.\nMain inserted.");
    matchesCold(s.root, s.texts);
    expect(storyRun(new ProgramStory(s.root)).beats.map((beat) => beat.text)).toEqual([
      "Included.\n",
      "Main first.\n",
      "Main inserted.\n",
      "Main after.\n",
    ]);
  });

  it("stops the story at a `done` of the content, as the top level's own `done` does", () => {
    const shown = shows({
      [MAIN]: lines("include includes/first.sd", "Never shown."),
      [FIRST]: lines("Included.", "done", "Not shown either."),
    });
    expect(shown.beats).toEqual(["Included.\n"]);
  });

  it("presents a `choose` block of the content, and runs the including script's content after it", () => {
    const texts = {
      [MAIN]: lines("include includes/first.sd", "Main after {picked}."),
      [FIRST]: lines(
        "store picked = \"none\"",
        "Pick one.",
        "choose",
        "  * Left",
        "    & picked = \"left\"",
        "  * Right",
        "    & picked = \"right\"",
        "end",
      ),
    };
    expect(shows(texts, [0])).toMatchObject({
      beats: ["Pick one.\n", "Left\n", "Main after left.\n"],
      menus: [["Left", "Right"]],
    });
    expect(shows(texts, [1]).beats).toEqual([
      "Pick one.\n",
      "Right\n",
      "Main after right.\n",
    ]);
  });

  it("is a flow of its own in its script, at its lines, standing in the top level", () => {
    const texts = {
      [MAIN]: lines("include includes/first.sd", "include includes/second.sd", "Main."),
      [FIRST]: lines("", "First one.", "First two.", "", "scene S", "  In S.", "end"),
      [SECOND]: lines("Second one."),
    };
    const root = rootOf(texts);
    const flow = root.flowNamed(includedFlowName(FIRST))!;
    expect(flow).toMatchObject({ uri: FIRST, kind: SymbolKind.Root, firstLine: 0, span: 4 });
    expect(root.flows(FIRST).map((row) => root.table.symbols[row.flow])).toEqual([
      includedFlowName(FIRST),
      "S",
    ]);
    // Each line of the content has its address in its own script, which the
    // top level stands in.
    const two = root.addressAt(FIRST, 2)!;
    expect(root.locationOf(two)).toMatchObject({ uri: FIRST, startLine: 2 });
    expect(root.sceneAt(two)).toBe("0");
    expect(root.locationOf(root.addressAt(FIRST, 0)!)).toMatchObject({
      uri: FIRST,
      startLine: 1,
    });
    // The including script's lines are its own, and each statement that runs
    // an included script's content stands on its `include` line, which no
    // line of a beat maps to.
    expect(root.locationOf(root.addressAt(MAIN, 0)!)).toMatchObject({
      uri: MAIN,
      startLine: 2,
    });
    const top = root.flowNamed("")!;
    expect(
      top.arrays.chunks.map((chunk) => root.locationOf(chunkId(chunk) * 2 ** 21)),
    ).toMatchObject([
      { uri: MAIN, startLine: 0 },
      { uri: MAIN, startLine: 1 },
      { uri: MAIN, startLine: 2 },
    ]);
    // A story started at a line of the content runs the rest of it and the
    // content after it.
    const story = new ProgramStory(root);
    story.ChooseAddress(two);
    expect(storyBeats(story).beats.map((beat) => beat.text)).toEqual([
      "First two.\n",
      "Second one.\n",
      "Main.\n",
    ]);
  });
});

describe("the consumers of an included script's top-level content", () => {
  const texts = {
    [MAIN]: lines("include includes/first.sd", "[[show backdrop room]] Main."),
    [FIRST]: lines("local x = 1", "[[show portrait bunny]] Included {x}.", "Still included."),
  };
  const image = (name: string, ext: string) => ({
    uri: `file://proj/${name}.${ext}`,
    type: "image",
    name,
    ext,
    src: `/file:/proj/${name}.${ext}?v=1`,
  });

  it("records the content's beats and assets under the top level, in the order they run", () => {
    const program = quiet(() =>
      programCompiler(texts, {
        programChunks: true,
        files: [...scriptFiles(texts), image("room", "png"), image("bunny", "svg")] as never,
      }).compile(MAIN),
    ).program;
    expect(program.fallback).toBeUndefined();
    const root = program.chunks!;
    const assets = program.sceneAssets!;
    expect(Object.keys(assets)).toEqual(["0"]);
    expect(assets["0"]!.image).toEqual(["bunny", "room"]);
    const beats = assets["0"]!.beats.map((beat) => ({
      at: root.locationOf(beat.address as number),
      image: beat.image,
    }));
    expect(beats).toMatchObject([
      { at: { uri: FIRST, startLine: 1 }, image: ["bunny"] },
      { at: { uri: MAIN, startLine: 1 }, image: ["room"] },
    ]);
    // The beat a preview of the included line finds is its own.
    const address = root.addressAt(FIRST, 1)!;
    expect(root.sceneAt(address)).toBe("0");
    expect(assets["0"]!.beats.findIndex((beat) => beat.address === address)).toBe(0);
  });

  it("names the frame it runs in as the top level's, inside the content and after it", () => {
    const story = new ProgramStory(rootOf(texts));
    const frameNames = () =>
      story
        .debugFrames(story.state.callStack.currentThread.threadIndex)!
        .map((frame) => frame.name);
    expect(story.Continue()).toContain("Included 1.");
    expect(frameNames()).toEqual(["0"]);
    expect(story.Continue()).toBe("Still included.\n");
    expect(frameNames()).toEqual(["0"]);
    expect(story.Continue()).toContain("Main.");
    expect(frameNames()).toEqual(["0"]);
  });
});

function posAt(text: string, offset: number) {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
}

/** A compiler over `texts` with statement chunks on, and an editor of any of
 *  its scripts that compiles the main script after each edit. */
function session(initial: Record<string, string>) {
  const texts = { ...initial };
  const c = programCompiler(texts, { programChunks: true, seedBuiltinsIntoStory: true });
  let version = 1;
  let root = quiet(() => c.compile(MAIN).program.chunks!);
  return {
    get root() {
      return root;
    },
    get texts() {
      return { ...texts };
    },
    get store() {
      return c.compiler.chunkStore!;
    },
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
      let program;
      try {
        program = c.compile(MAIN).program;
      } finally {
        console.warn = warn;
        console.error = error;
        console.log = log;
      }
      expect(program.fallback).toBeUndefined();
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
    programCompiler(texts, { programChunks: true, seedBuiltinsIntoStory: true }).compile(MAIN),
  ).program;
  expect(program.fallback).toBeUndefined();
  const cold = program.chunks!;
  expect(describeRoot(root)).toEqual(describeRoot(cold));
  expect(storyRun(new ProgramStory(root), [0]).beats).toEqual(
    storyRun(new ProgramStory(cold), [0]).beats,
  );
};

const PROJECT = {
  [MAIN]: lines(
    "include includes/first.sd",
    "include includes/second.sd",
    "Main one.",
    "Main two.",
    "",
    "scene S",
    "  In S.",
    "end",
  ),
  [FIRST]: lines(
    "First one.",
    "First two.",
    "First three.",
    "choose",
    "  * Pick",
    "    Picked.",
    "then",
    "  After pick.",
    "end",
    "First four.",
  ),
  [SECOND]: lines("scene T", "  In T.", "end"),
};

describe("an edit inside an included script", () => {
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

  it("emits only the inserted statement when a line is inserted, and moves the lines below it", () => {
    const s = session(PROJECT);
    const before = s.root;
    const after = s.edit(FIRST, "First three.", "First two and a half.\nFirst three.");
    expect(s.store.emittedLastBuild).toBe(1);
    expect(chunkChanges(before, after)).toMatchObject({ added: [expect.anything()], dropped: [] });
    expect(after.locationOf(after.addressAt(FIRST, 3)!)).toMatchObject({
      uri: FIRST,
      startLine: 3,
    });
    matchesCold(after, s.texts);
  });

  it("matches a cold compile when an included script gains top-level content and loses it again", () => {
    const s = session(PROJECT);
    s.edit(SECOND, "scene T", "Second top.\n\nscene T");
    matchesCold(s.root, s.texts);
    expect(storyRun(new ProgramStory(s.root), [0]).beats.map((beat) => beat.text)).toEqual([
      "First one.\n",
      "First two.\n",
      "First three.\n",
      "Pick\n",
      "Picked.\n",
      "After pick.\n",
      "First four.\n",
      "Second top.\n",
      "Main one.\n",
      "Main two.\n",
    ]);
    s.edit(SECOND, "Second top.\n\n", "");
    matchesCold(s.root, s.texts);
    expect(s.root.flowNamed(includedFlowName(SECOND))).toBeUndefined();
  });

  it("runs the content of nested includes in their new order after the script that includes them swaps two in the middle", () => {
    const WRAPPER = "file://proj/includes/wrapper.sd";
    const child = (name: string) => `file://proj/includes/${name}.sd`;
    const s = session({
      [MAIN]: lines("include includes/wrapper.sd", "Main."),
      [WRAPPER]: lines(
        "include a.sd",
        "include b.sd",
        "include c.sd",
        "include d.sd",
        "Wrapper.",
      ),
      [child("a")]: lines("A."),
      [child("b")]: lines("B."),
      [child("c")]: lines("C."),
      [child("d")]: lines("D."),
    });
    s.edit(WRAPPER, "include b.sd\ninclude c.sd", "include c.sd\ninclude b.sd");
    matchesCold(s.root, s.texts);
    expect(storyRun(new ProgramStory(s.root)).beats.map((beat) => beat.text)).toEqual([
      "A.\n",
      "C.\n",
      "B.\n",
      "D.\n",
      "Wrapper.\n",
      "Main.\n",
    ]);
  });

  it("runs included content in its new order after the starting script swaps two includes in the middle", () => {
    const child = (name: string) => `file://proj/includes/${name}.sd`;
    const s = session({
      [MAIN]: lines(
        "include includes/a.sd",
        "include includes/b.sd",
        "include includes/c.sd",
        "include includes/d.sd",
        "Main.",
      ),
      [child("a")]: lines("A."),
      [child("b")]: lines("B."),
      [child("c")]: lines("C."),
      [child("d")]: lines("D."),
    });
    s.edit(MAIN, "include includes/b.sd\ninclude includes/c.sd", "include includes/c.sd\ninclude includes/b.sd");
    matchesCold(s.root, s.texts);
    expect(storyRun(new ProgramStory(s.root)).beats.map((beat) => beat.text)).toEqual([
      "A.\n",
      "C.\n",
      "B.\n",
      "D.\n",
      "Main.\n",
    ]);
  });

  // The entries of includes written below content of the script's own stand
  // on that content's line, since they run before it.
  for (const nested of [false, true]) {
    it(`runs included content in its new order after ${nested ? "an included" : "the starting"} script swaps two of four includes written below its own content`, () => {
      const WRAPPER = "file://proj/includes/wrapper.sd";
      const child = (name: string) => `file://proj/includes/${name}.sd`;
      const at = nested ? "" : "includes/";
      const includerText = lines(
        "Own first.",
        `include ${at}a.sd`,
        `include ${at}b.sd`,
        `include ${at}c.sd`,
        `include ${at}d.sd`,
      );
      const s = session({
        ...(nested
          ? { [MAIN]: lines("include includes/wrapper.sd", "Main."), [WRAPPER]: includerText }
          : { [MAIN]: includerText }),
        [child("a")]: lines("A."),
        [child("b")]: lines("B."),
        [child("c")]: lines("C."),
        [child("d")]: lines("D."),
      });
      const includer = nested ? WRAPPER : MAIN;
      const order = (...letters: string[]) => [
        ...letters.map((letter) => `${letter}.\n`),
        "Own first.\n",
        ...(nested ? ["Main.\n"] : []),
      ];
      const swapped = `include ${at}c.sd\ninclude ${at}b.sd`;
      const restored = `include ${at}b.sd\ninclude ${at}c.sd`;
      // The swap, its undo and its redo, each on the same compiler.
      for (const [find, replace, expected] of [
        [restored, swapped, order("A", "C", "B", "D")],
        [swapped, restored, order("A", "B", "C", "D")],
        [restored, swapped, order("A", "C", "B", "D")],
      ] as const) {
        s.edit(includer, find, replace);
        matchesCold(s.root, s.texts);
        expect(storyRun(new ProgramStory(s.root)).beats.map((beat) => beat.text)).toEqual(
          expected,
        );
      }
    });
  }

  // A script runs where the first include reaches it, so an edit to one
  // script moves the content of a script another script includes too.
  it("moves a script included from two places to the include that reaches it first, back and forth, as a cold compile does", () => {
    const WRAPPER = "file://proj/includes/wrapper.sd";
    const X = "file://proj/includes/x.sd";
    const s = session({
      [MAIN]: lines("include includes/wrapper.sd", "include includes/x.sd", "Main."),
      [WRAPPER]: lines("include x.sd", "Wrapper."),
      [X]: lines("X."),
    });
    const run = () => storyRun(new ProgramStory(s.root)).beats.map((beat) => beat.text);
    expect(run()).toEqual(["X.\n", "Wrapper.\n", "Main.\n"]);
    for (let pass = 0; pass < 2; pass += 1) {
      s.edit(WRAPPER, "include x.sd\n", "");
      matchesCold(s.root, s.texts);
      expect(run()).toEqual(["Wrapper.\n", "X.\n", "Main.\n"]);
      s.edit(WRAPPER, "Wrapper.", "include x.sd\nWrapper.");
      matchesCold(s.root, s.texts);
      expect(run()).toEqual(["X.\n", "Wrapper.\n", "Main.\n"]);
    }
  });

  it("matches a cold compile when the including script gains an include and loses it again", () => {
    const s = session({ ...PROJECT, [INNER]: lines("Inner top.") });
    s.edit(MAIN, "include includes/second.sd", "include includes/second.sd\ninclude includes/inner.sd");
    matchesCold(s.root, s.texts);
    s.edit(MAIN, "\ninclude includes/inner.sd", "");
    matchesCold(s.root, s.texts);
  });
});

/** An engine on `root` that keeps its beat images, as a game's does. */
const saving = (root: ProgramRoot) => {
  const story = new ProgramStory(root);
  story.keepBeatImages = true;
  story.onError = () => {};
  return story;
};

describe("a save taken inside an included script's content", () => {
  it("loads after an edit above it at a menu the content raised, and takes a choice there", () => {
    const s = session(PROJECT);
    const story = saving(s.root);
    while (story.canContinue) {
      story.Continue();
    }
    expect(story.currentChoices.map((choice) => choice.text)).toEqual(["Pick"]);
    const save = story.toSave();
    const after = s.edit(FIRST, "First three.", "First two and a half.\nFirst three.");
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

  it("loads after an edit above it inside a tunnel the content called, and returns into the content", () => {
    const texts = {
      [MAIN]: lines("include includes/first.sd", "Main."),
      [FIRST]: lines(
        "Before.",
        "-> side ->",
        "Back in the content.",
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
    const after = s.edit(FIRST, "Before.", "Before.\nAlso before.");
    const loaded = saving(after);
    loaded.loadSave(save);
    expect(loaded.loadedSaveReport!.exact).toBe(true);
    expect(storyRun(loaded).beats.map((beat) => beat.text)).toEqual([
      "Side two.\n",
      "Back in the content.\n",
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
    expect(saved[0].flow).toBe(includedFlowName(FIRST));

    const after = s.edit(FIRST, "First two.", "First one and a half.\nFirst two.");
    const loaded = new ProgramStory(after);
    loaded.keepBeatImages = true;
    loaded.onError = () => {};
    loaded.loadSave(save);
    const report = loaded.loadedSaveReport!;
    expect(report.exact).toBe(true);
    expect(report.beat).toBe(report.beats - 1);
    const position = loaded.state.position!;
    expect(after.table.symbols[position.sequence.flow]).toBe(includedFlowName(FIRST));
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
