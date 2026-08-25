// #368: the line-end `>` BREAK split gated on the character after the break
// being exactly "\n". On a CRLF-saved document that character is "\r", so the
// split silently never fired — the chained beats collapsed into one Continue
// and, per splitBodyRangeAtBreaks' own rationale, every box after the first
// became unreachable by the preview. `.gitattributes` protects the repo's
// fixtures, not a user's Windows-authored script.

import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

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
    // The split's observable artifact is the per-beat routing tag: one per
    // beat, so a collapsed (unsplit) compile carries one fewer.
    const countTags = (program: any) =>
      (JSON.stringify(program.compiled ?? {}).match(/\^\\u0000/g) ?? [])
        .length;
    expect(countTags(lf)).toBeGreaterThan(0);
    expect(countTags(crlf)).toBe(countTags(lf));
  });
});
