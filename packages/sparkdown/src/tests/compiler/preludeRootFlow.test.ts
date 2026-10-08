/// <reference path="../../sd-raw.d.ts" />
// The builtins prelude is seeded into every compiled program, so anything the
// prelude leaves at its own top level would travel with every game and play
// back whenever a story starts from the top level.
//
// `--` opens a comment only inside a Luau scope — a struct body, a function
// body, a code block. At a script's top level it is display text, so a `--`
// line written between blocks compiles into that top level as a text beat.
// Sparkdown's comment form outside Luau is `//`, matched whole-line by the
// grammar's `SparkdownLineComment` rule when a whitespace or an end of line
// follows it (definitions/yaml/sparkdown.language-grammar.yaml). That is what
// the prelude uses for its own between-block prose.
//
// These pin the outcome rather than the spelling: the prelude's top level
// carries no text, and seeding the builtins into a program adds nothing to
// the program's own.

import { describe, expect, test } from "vitest";
import BUILTINS_PRELUDE from "../../compiler/builtins/builtins.sd?raw";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { flowListings } from "../programListing";

// The same synthetic URI and options SparkdownCompiler uses when it compiles
// the prelude once, in isolation, to seed its builtins cache (getCompiledPrelude).
const PRELUDE_URI = "file:///__builtins__.sd";
const MAIN_URI = "inmemory:///main.sd";

const file = (uri: string, name: string, text: string) =>
  ({
    uri,
    type: "script",
    name,
    ext: "sd",
    text,
    version: 1,
    languageId: "sparkdown",
  } as any);

const compilePrelude = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: false,
    definitions: { builtins: {} as any },
    files: [file(PRELUDE_URI, "__builtins__", text)],
  });
  return compiler.compile({ textDocument: { uri: PRELUDE_URI } }).program;
};

const compileScript = (text: string, seedBuiltinsIntoStory: boolean) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory,
    files: [file(MAIN_URI, "main", text)],
  });
  return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
};

/** The instructions of a program's top level, the flow a story plays from
 *  its start (`""`, `flowListings`). */
const rootFlowContent = (program: any): string[] => {
  expect(program.chunks, "the compile built statement chunks").toBeDefined();
  return flowListings(program.chunks).get("") ?? [];
};

/** Every text the top level plays back: each string a display table takes
 *  as its `text`, and each string written as text. */
const rootFlowText = (program: any): string[] => {
  const listing = rootFlowContent(program);
  return listing.flatMap((line, i) => {
    const text =
      /^Text (".*")$/.exec(line) ??
      (listing[i - 1] === 'Str "text"' ? /^Str (".*")$/.exec(line) : null);
    return text ? [JSON.parse(text[1]!) as string] : [];
  });
};

/** Error-severity diagnostics, so an empty root flow cannot pass for a clean
 *  one when the prelude has stopped compiling at all. */
const errors = (program: any): string[] => {
  const out: string[] = [];
  for (const list of Object.values(program.diagnostics ?? {})) {
    for (const d of list as any[]) {
      if (d?.severity === 1) {
        out.push(typeof d.message === "string" ? d.message : d.message?.value);
      }
    }
  }
  return out;
};

describe("the builtins prelude's top level", () => {
  test("carries no text", () => {
    const program = compilePrelude(BUILTINS_PRELUDE);
    expect(errors(program)).toEqual([]);
    expect(rootFlowText(program)).toEqual([]);
  });

  test("would report a top-level `--` line, which is display text", () => {
    // Positive control: the same walk over a prelude carrying one top-level
    // `--` line has to find it, so a green run above means the prelude is
    // clean rather than that the walk stopped working.
    const program = compilePrelude(
      `-- a comment at column 0 is display text\n${BUILTINS_PRELUDE}`
    );
    expect(rootFlowText(program)).toContain(
      "-- a comment at column 0 is display text"
    );
  });

  test("adds nothing to a program's own top level when it is seeded", () => {
    // What a player actually receives: the editor's diagnostics compile leaves
    // the builtins unseeded, the runtime seeds them, and the two have to play
    // the same beats from the top level.
    const SRC = "Hello from the script.\n";
    const seeded = compileScript(SRC, true);
    const unseeded = compileScript(SRC, false);
    // The script's own line first, so the comparisons below cannot agree by
    // both sides being empty.
    expect(rootFlowText(unseeded)).toContain("Hello from the script.");
    expect(rootFlowText(seeded)).toEqual(rootFlowText(unseeded));
    // Stated in full, because the text comparison alone would hide anything
    // the prelude contributes that is not text.
    expect(rootFlowContent(seeded)).toEqual(rootFlowContent(unseeded));
  });
});
