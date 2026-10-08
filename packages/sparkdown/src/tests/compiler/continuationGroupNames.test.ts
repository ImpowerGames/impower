// A continuation's display calls carry a `group` the compiler names by
// document order. In a script included from two places every continuation
// keeps a name of its own, and an incremental compile still matches a cold
// one.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { programListing } from "../programListing";
import { describeRoot } from "../program/describeRoot";

const MAIN_URI = "file://proj/main.sd";
const CHAPTER_URI = "file://proj/chapter.sd";
const SHARED_URI = "file://proj/shared.sd";

const file = (uri: string, text: string, version: number): File => ({
  uri,
  type: "script",
  name: uri.split("/").at(-1)!.split(".")[0]!,
  ext: "sd",
  text,
  version,
  languageId: "sparkdown",
});

function posAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines.at(-1)!.length };
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

type Project = { main: string; chapter: string; shared: string };

function configure(compiler: SparkdownCompiler, project: Project, version: number) {
  compiler.configure({
    files: [
      file(MAIN_URI, project.main, version),
      file(CHAPTER_URI, project.chapter, version),
      file(SHARED_URI, project.shared, version),
    ],
  });
}

/** The root of the statement chunks a compile of `main.sd` built. */
function compiled(compiler: SparkdownCompiler): ProgramRoot {
  const root = compiler.compile({ textDocument: { uri: MAIN_URI } }).program.chunks;
  expect(root, "the compile built statement chunks").toBeDefined();
  return root!;
}

/** The group each display call of the program names, in the order of its
 *  instructions: the string pushed after the table key `group`. */
function groups(root: ProgramRoot): string[] {
  const listing = programListing(root);
  return listing.flatMap((line, i) => {
    const value = line === 'Str "group"' ? /^Str (".*")$/.exec(listing[i + 1] ?? "") : null;
    return value ? [JSON.parse(value[1]!) as string] : [];
  });
}

// `shared.sd` is included by `main.sd` and again by `chapter.sd`.
const project: Project = {
  main: [
    "include shared.sd",
    "include chapter.sd",
    "",
    "scene main_one",
    "  Opening line.",
    "HERO: Main glued line ..",
    ".. main carry > and broken.",
    "end",
    "",
  ].join("\n"),
  chapter: ["include shared.sd", "", "scene chapter_one", "  Chapter line.", "end", ""].join("\n"),
  shared: ["HERO: Shared glued line ..", ".. carried on > and broken.", ""].join("\n"),
};

describe("continuation group names", () => {
  it("a script included twice keeps a name for each continuation", () => {
    const root = quiet(() => {
      const compiler = new SparkdownCompiler();
      configure(compiler, project, 1);
      return compiled(compiler);
    });
    const names = groups(root);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => name === "")).toEqual([]);
    // One name for the shared continuation and one for main's.
    expect(new Set(names).size).toBe(2);
  });

  it("a script included twice compiles incrementally as it does cold", () => {
    const find = "  Opening line.";
    const replace = "  Opening line, now a good deal longer.";
    const offset = project.main.indexOf(find);
    const edited = { ...project, main: project.main.slice(0, offset) + replace + project.main.slice(offset + find.length) };
    const [incremental, cold] = quiet(() => {
      const compiler = new SparkdownCompiler();
      configure(compiler, project, 1);
      compiled(compiler);
      compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version: 2 },
        contentChanges: [
          {
            range: { start: posAt(project.main, offset), end: posAt(project.main, offset + find.length) },
            text: replace,
          },
        ],
      });
      const incremental = compiled(compiler);
      const fresh = new SparkdownCompiler();
      configure(fresh, edited, 2);
      return [incremental, compiled(fresh)];
    });
    expect(groups(incremental).filter((name) => name === "")).toEqual([]);
    expect(describeRoot(incremental)).toEqual(describeRoot(cold));
  });
});
