import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { describeRoot } from "../program/describeRoot";

// An incremental compile decides which scenes an edit touched by comparing
// line ranges. Line numbers only mean something inside one script, so both
// sides of that comparison have to be scoped to a script: a project with an
// `include` has several scripts whose line numbers overlap freely.
//
// The fixture below is the shape that breaks a script-blind comparison. One
// script holds a single scene that runs for dozens of lines; the other holds a
// dozen scenes five lines apart. Sorting every start into one list makes the
// long scene look five lines long, so an edit deep inside it falls outside the
// span and the scene is wrongly treated as untouched — its code and its asset
// list are then served from the previous compile. Both arrangements are
// exercised, since either script can be the one holding the long scene.
//
// The oracle in every case is a cold compile of the edited text: its chunks
// by content (`describeRoot`) and its scene assets.

const MAIN_URI = "file://proj/main.sd";
const CHAPTER_URI = "file://proj/chapter.sd";

const file = (uri: string, text: string, version: number): File => {
  const name = uri.split("/").at(-1)!.split(".")[0]!;
  return {
    uri,
    type: "script",
    name,
    ext: "sd",
    text,
    version,
    languageId: "sparkdown",
  };
};

const SHORT_SCENES = 12;
const LONG_SCENE_FILLER = 60;

/** Twelve five-line scenes: `<p>0` at line 0, `<p>1` at line 5, and so on. */
function shortScenes(prefix: string): string[] {
  const L: string[] = [];
  for (let s = 0; s < SHORT_SCENES; s++) {
    L.push(`scene ${prefix}${s}`);
    L.push(`  [[show backdrop room_${prefix}${s}]]`);
    L.push(`  Line ${s} of ${prefix}.`);
    L.push(`  -> ${prefix}${(s + 1) % SHORT_SCENES}`);
    L.push("end");
  }
  return L;
}

/** One scene whose interesting lines sit ~60 lines past its own start. */
function longScene(name: string, portrait: string, target: string): string[] {
  const L: string[] = [];
  L.push(`scene ${name}`);
  L.push(`  [[show backdrop ${name}_bg]]`);
  for (let i = 0; i < LONG_SCENE_FILLER; i++) {
    L.push(`  Filler line ${i} of ${name}.`);
  }
  L.push(`  [[show portrait ${portrait}]]`);
  L.push(`  -> ${target}`);
  L.push("end");
  return L;
}

function posAt(text: string, offset: number) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

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

/** The player worker's configuration, which is where the bug was observed. */
function newCompiler(main: string, chapter: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [file(MAIN_URI, main, 1), file(CHAPTER_URI, chapter, 1)],
  });
  return compiler;
}

function cold(main: string, chapter: string) {
  return newCompiler(main, chapter).compile({
    textDocument: { uri: MAIN_URI },
  }).program;
}

/** A compile's chunks by content and its scene assets, with each beat's
 *  address read as where it stands: an address counts the chunks the
 *  compiler has made, so an incremental compile's differs from a cold
 *  compile's for the same beat. */
function outcome(program: SparkProgram) {
  expect(program.chunks, "the compile built statement chunks").toBeDefined();
  return {
    chunks: describeRoot(program.chunks!),
    sceneAssets: JSON.parse(
      JSON.stringify(program.sceneAssets, (key, value) =>
        key === "address" && typeof value === "number"
          ? program.chunks!.locationOf(value)
          : value,
      ),
    ),
  };
}

/** Replace the first occurrence of `find` in `uri`'s text, incrementally. */
function edit(
  compiler: SparkdownCompiler,
  uri: string,
  text: string,
  find: string,
  replace: string,
) {
  const offset = text.indexOf(find);
  expect(offset).toBeGreaterThanOrEqual(0);
  compiler.updateDocument({
    textDocument: { uri, version: 2 },
    contentChanges: [
      {
        range: {
          start: posAt(text, offset),
          end: posAt(text, offset + find.length),
        },
        text: replace,
      },
    ],
  });
  return text.slice(0, offset) + replace + text.slice(offset + find.length);
}

/**
 * `longIn` names the script that holds the long scene; the other holds the
 * twelve short ones. `main.sd` always carries the `include`.
 */
function fixture(longIn: "main" | "chapter", portrait: string, target: string) {
  const longLines = longScene("alpha", portrait, target);
  const shortLines = shortScenes("c");
  if (longIn === "main") {
    return {
      main: ["include chapter.sd", "", ...longLines].join("\n"),
      chapter: shortLines.join("\n"),
    };
  }
  return {
    main: ["include chapter.sd", "", ...shortLines].join("\n"),
    chapter: longLines.join("\n"),
  };
}

describe("incremental compiles across more than one script", () => {
  for (const longIn of ["main", "chapter"] as const) {
    const longUri = longIn === "main" ? MAIN_URI : CHAPTER_URI;
    const where = `the ${longIn === "main" ? "including" : "included"} script`;

    it(`a deep asset edit in ${where} is not masked by the other script's flow starts`, () => {
      quiet(() => {
        const before = fixture(longIn, "face_old", "c0");
        const compiler = newCompiler(before.main, before.chapter);
        const first = compiler.compile({ textDocument: { uri: MAIN_URI } })
          .program;

        // Positive control: the fixture really does start out holding the
        // pre-edit asset, so a red run below is the defect and not a fixture
        // that never had the asset in the first place.
        expect(first.sceneAssets?.["alpha"]?.image).toContain("face_old");

        const editedText = edit(
          compiler,
          longUri,
          longIn === "main" ? before.main : before.chapter,
          "face_old",
          "face_new",
        );
        const after =
          longIn === "main"
            ? { main: editedText, chapter: before.chapter }
            : { main: before.main, chapter: editedText };

        const second = compiler.compile({ textDocument: { uri: MAIN_URI } })
          .program;
        const oracle = cold(after.main, after.chapter);

        expect(second.sceneAssets?.["alpha"]?.image).toContain("face_new");
        expect(second.sceneAssets?.["alpha"]?.image).not.toContain("face_old");
        expect(outcome(second)).toEqual(outcome(oracle));
      });
    });

    it(`a deep divert-target edit in ${where} reaches successors and code`, () => {
      quiet(() => {
        const before = fixture(longIn, "face_old", "c0");
        const compiler = newCompiler(before.main, before.chapter);
        const first = compiler.compile({ textDocument: { uri: MAIN_URI } })
          .program;
        expect(first.sceneAssets?.["alpha"]?.successors).toEqual(["c0"]);

        const editedText = edit(
          compiler,
          longUri,
          longIn === "main" ? before.main : before.chapter,
          "-> c0\nend",
          "-> c7\nend",
        );
        const after =
          longIn === "main"
            ? { main: editedText, chapter: before.chapter }
            : { main: before.main, chapter: editedText };

        const second = compiler.compile({ textDocument: { uri: MAIN_URI } })
          .program;
        const oracle = cold(after.main, after.chapter);

        expect(second.sceneAssets?.["alpha"]?.successors).toEqual(["c7"]);
        expect(outcome(second)).toEqual(outcome(oracle));
      });
    });
  }

  it("a short scene deep in the included script is still recompiled", () => {
    // The short-scene side of the same fixture: `c9` starts at line 45 of
    // `chapter.sd`, which is past every one of `main.sd`'s flow starts.
    quiet(() => {
      const before = fixture("main", "face_old", "c0");
      const compiler = newCompiler(before.main, before.chapter);
      const first = compiler.compile({ textDocument: { uri: MAIN_URI } })
        .program;
      expect(first.sceneAssets?.["c9"]?.image).toContain("room_c9");

      const chapter = edit(
        compiler,
        CHAPTER_URI,
        before.chapter,
        "room_c9",
        "room_c9_edited",
      );
      const second = compiler.compile({ textDocument: { uri: MAIN_URI } })
        .program;
      const oracle = cold(before.main, chapter);

      expect(second.sceneAssets?.["c9"]?.image).toContain("room_c9_edited");
      expect(second.sceneAssets?.["c9"]?.image).not.toContain("room_c9");
      expect(outcome(second)).toEqual(outcome(oracle));
    });
  });

  // Content above a script's first flow lives outside every flow: a
  // constant's value, and a declared NAME entering the program, which can
  // change how call sites in flows whose own source never changed compile.
  // The included script opens with a scene on line 0, so a comparison that
  // ignores which script a line belongs to never registers these edits as
  // preceding a flow.
  it("retyping a constant above every flow of its own script compiles as a cold compile does", () => {
    quiet(() => {
      const base = fixture("main", "face_old", "c0");
      const before = {
        main: base.main.replace(
          "include chapter.sd",
          "const LIMIT = 5\ninclude chapter.sd",
        ),
        chapter: base.chapter,
      };
      const compiler = newCompiler(before.main, before.chapter);
      compiler.compile({ textDocument: { uri: MAIN_URI } });

      const main = edit(
        compiler,
        MAIN_URI,
        before.main,
        "const LIMIT = 5",
        'const LIMIT = "five"',
      );
      const second = compiler.compile({ textDocument: { uri: MAIN_URI } })
        .program;
      const oracle = cold(main, before.chapter);

      expect(outcome(second)).toEqual(outcome(oracle));
    });
  });

  it("declaring a name above every flow of its own script compiles as a cold compile does", () => {
    quiet(() => {
      const base = fixture("main", "face_old", "c0");
      const before = {
        main: base.main.replace(
          "include chapter.sd",
          "const LIMIT = 5\ninclude chapter.sd",
        ),
        chapter: base.chapter,
      };
      const compiler = newCompiler(before.main, before.chapter);
      compiler.compile({ textDocument: { uri: MAIN_URI } });

      const main = edit(
        compiler,
        MAIN_URI,
        before.main,
        "const LIMIT = 5",
        "const LIMIT = 5\nstore extra = 1",
      );
      const second = compiler.compile({ textDocument: { uri: MAIN_URI } })
        .program;
      const oracle = cold(main, before.chapter);

      expect(outcome(second)).toEqual(outcome(oracle));
    });
  });
});
