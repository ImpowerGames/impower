import { describe, expect, it } from "vitest";
import { testCompiler } from "../engineUnderTest";

const URI = "file:///main.sd";

function compile(text: string) {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return compiler.compile({ textDocument: { uri: URI } } as never)
    .program as any;
}

function diagnostics(program: any) {
  return Object.entries(program.diagnostics ?? {}).flatMap(
    ([uri, list]: [string, any]) =>
      list.map((d: any) => ({
        uri,
        message: typeof d.message === "string" ? d.message : d.message?.value,
        range: [
          d.range.start.line,
          d.range.start.character,
          d.range.end.line,
          d.range.end.character,
        ],
      })),
  );
}

describe("a diagnostic whose source has no position", () => {
  it("is placed on the node that raised it", () => {
    const text = [
      "scene s",
      "  while true do",
      "    local f = function() break end",
      "  end",
      "end",
      "",
    ].join("\n");
    const breakStart = text.split("\n")[2]!.indexOf("break");
    const reported = diagnostics(compile(text));
    const notFound = reported.filter((d) =>
      /^target not found: `-> __synth/.test(d.message),
    );
    expect(notFound).toEqual([
      {
        uri: URI,
        message: expect.any(String),
        range: [2, breakStart, 2, breakStart + "break".length],
      },
    ]);
  });
});
