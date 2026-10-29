/// <reference path="../../sd-raw.d.ts" />

import { describe, expect, test } from "vitest";
import BUILTINS_PRELUDE from "../../compiler/builtins/builtins.sd?raw";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { flowListings } from "../programListing";

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

const rootFlowContent = (program: any): string[] => {
  expect(program.chunks, "the compile built statement chunks").toBeDefined();
  return flowListings(program.chunks).get("") ?? [];
};

const rootFlowText = (program: any): string[] => {
  const listing = rootFlowContent(program);
  return listing.flatMap((line, i) => {
    const text =
      /^Text (".*")$/.exec(line) ??
      (listing[i - 1] === 'Str "text"' ? /^Str (".*")$/.exec(line) : null);
    return text ? [JSON.parse(text[1]!) as string] : [];
  });
};

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
    const program = compilePrelude(
      `-- a comment at column 0 is display text\n${BUILTINS_PRELUDE}`
    );
    expect(rootFlowText(program)).toContain(
      "-- a comment at column 0 is display text"
    );
  });

  test("adds nothing to a program's own top level when it is seeded", () => {
    const SRC = "Hello from the script.\n";
    const seeded = compileScript(SRC, true);
    const unseeded = compileScript(SRC, false);
    expect(rootFlowText(unseeded)).toContain("Hello from the script.");
    expect(rootFlowText(seeded)).toEqual(rootFlowText(unseeded));
    expect(rootFlowContent(seeded)).toEqual(rootFlowContent(unseeded));
  });
});
