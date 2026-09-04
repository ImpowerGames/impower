// The builtins prelude's root flow is seeded into every compiled program, so
// anything the prelude leaves at its own top level travels with every game and
// plays back whenever a story starts from the root (`Game.setStartFrom` falls
// back to the root path when the cursor resolves no closer one).
//
// `--` opens a comment only inside a Luau scope — a struct body, a function
// body, a code block. At a script's top level it is display text, so a `--`
// line written between blocks compiles into that root flow as a text beat.
// Sparkdown's comment form outside Luau is `//`, matched whole-line by the
// grammar's `SparkdownLineComment` rule when a whitespace or an end of line
// follows it (definitions/yaml/sparkdown.language-grammar.yaml). That is what
// the prelude uses for its own between-block prose.
//
// These pin the outcome rather than the spelling: the prelude's root flow
// carries no text, and seeding the builtins into a program adds none to it.

import { describe, expect, test } from "vitest";
import BUILTINS_PRELUDE from "../../compiler/builtins/builtins.sd?raw";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

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

/** The root flow's own content. `compiled.root` is the story's root container,
 *  `[rootFlowContent, "done", namedFlows]`; the named flows sit in the trailing
 *  object, so the first element is what the story plays from the root. */
const rootFlowContent = (compiled: any): any[] => compiled?.root?.[0] ?? [];

/** Every text string the root flow plays back. A runtime story holds display
 *  text as a `^`-prefixed string; the leading marker is dropped here so a
 *  failure reads as the authored line. */
const rootFlowText = (compiled: any): string[] => {
  const out: string[] = [];
  const walk = (node: any) => {
    if (typeof node === "string") {
      if (node.startsWith("^")) {
        out.push(node.slice(1));
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      Object.values(node).forEach(walk);
    }
  };
  walk(rootFlowContent(compiled));
  return out;
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

describe("the builtins prelude's root flow", () => {
  test("carries no text", () => {
    const program = compilePrelude(BUILTINS_PRELUDE);
    expect(errors(program)).toEqual([]);
    expect(program.compiled).toBeTruthy();
    expect(rootFlowText(program.compiled)).toEqual([]);
  });

  test("would report a top-level `--` line, which is display text", () => {
    // Positive control: the same walk over a prelude carrying one top-level
    // `--` line has to find it, so a green run above means the prelude is
    // clean rather than that the walk stopped working.
    const program = compilePrelude(
      `-- a comment at column 0 is display text\n${BUILTINS_PRELUDE}`
    );
    expect(rootFlowText(program.compiled)).toContain(
      "-- a comment at column 0 is display text"
    );
  });

  test("adds only a newline to a program's own root flow when it is seeded", () => {
    // What a player actually receives: the editor's diagnostics compile leaves
    // the builtins unseeded, the runtime seeds them, and the two have to play
    // the same beats from the root.
    const SRC = "Hello from the script.\n";
    const seeded = compileScript(SRC, true);
    const unseeded = compileScript(SRC, false);
    expect(seeded.compiled).toBeTruthy();
    expect(rootFlowText(seeded.compiled)).toEqual(
      rootFlowText(unseeded.compiled)
    );
    // Stated in full, because the text comparison alone would hide anything the
    // prelude contributes that is not text. Seeding prepends one newline: the
    // prelude arrives as an included file, and a file's terminating newline
    // reaches the root flow. It displays nothing, and it is the whole of what
    // seeding adds.
    const seededContent = rootFlowContent(seeded.compiled);
    const unseededContent = rootFlowContent(unseeded.compiled);
    expect(seededContent[0]).toBe("\n");
    expect(seededContent.slice(1)).toEqual(unseededContent);
  });
});
