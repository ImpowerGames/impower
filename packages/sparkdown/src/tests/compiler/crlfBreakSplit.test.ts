import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { programListing, stringCount } from "../programListing";

const URI = "inmemory:///main.sd";

function compile(source: string): any {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

const LF_SOURCE = [
  "scene start",
  "  HERO:",
  "    First part. >",
  "    Second part.",
  "end",
  "",
].join("\n");

describe("line-end > break split on CRLF documents", () => {
  test("a CRLF-saved script splits into the same beats as the LF one", () => {
    const lf = compile(LF_SOURCE);
    const crlf = compile(LF_SOURCE.replace(/\n/g, "\r\n"));
    const countTables = (program: any) =>
      stringCount(programListing(program.chunks), "target");
    expect(countTables(lf)).toBe(2);
    expect(countTables(crlf)).toBe(countTables(lf));
  });
});
