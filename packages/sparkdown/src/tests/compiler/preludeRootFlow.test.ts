
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

const startFlowContent = (program: any): string[] => {
  expect(program.chunks, "the compile built statement chunks").toBeDefined();
  return flowListings(program.chunks).get("start") ?? [];
};

const startFlowText = (program: any): string[] => {
  const listing = startFlowContent(program);
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
  test("compiles cleanly and declares no scene the story could start in", () => {
    const program = compilePrelude(BUILTINS_PRELUDE);
    expect(errors(program)).toEqual([]);
    expect(flowListings(program.chunks).has("start")).toBe(false);
  });

  test("adds nothing to the scene the story starts in when it is seeded", () => {
    const SRC = "scene start\n  Hello from the script.\nend\n";
    const seeded = compileScript(SRC, true);
    const unseeded = compileScript(SRC, false);
    // The script's own line first, so the comparisons below cannot agree by
    // both sides being empty.
    expect(startFlowText(unseeded)).toContain("Hello from the script.");
    expect(startFlowText(seeded)).toEqual(startFlowText(unseeded));
    // Stated in full, because the text comparison alone would hide anything
    // the prelude contributes that is not text.
    expect(startFlowContent(seeded)).toEqual(startFlowContent(unseeded));
  });
});
