import { describe, expect, it, vi } from "vitest";
import { testCompiler } from "../engineUnderTest";
import { Identifier } from "../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Knot } from "../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { Story } from "../../inkjs/compiler/Parser/ParsedHierarchy/Story";
import { Text } from "../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { DebugMetadata } from "../../runtime/DebugMetadata";

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

function position(line: number, start: number, end: number) {
  const dm = new DebugMetadata();
  dm.filePath = URI;
  dm.startLineNumber = line;
  dm.endLineNumber = line;
  dm.startCharacterNumber = start;
  dm.endCharacterNumber = end;
  return dm;
}

function raiseFromSceneChild(raiserPosition: DebugMetadata | null) {
  const raiser = new Text("x");
  if (raiserPosition) {
    raiser.debugMetadata = raiserPosition;
  }
  const scene = new Knot(new Identifier("s"), [raiser], [], false);
  scene.debugMetadata = position(1, 1, 8);
  const story = new Story([scene]);
  const reported: unknown[] = [];
  story.BeginResolution((_message, _type, metadata) => reported.push(metadata));
  const hidden: string[] = [];
  const warn = vi.spyOn(console, "warn").mockImplementation((...args) => {
    if (args[0] === "HIDDEN") hidden.push(String(args[1]));
  });
  try {
    raiser.Error("unplaced", new Identifier("__synth"));
  } finally {
    warn.mockRestore();
  }
  return { reported, hidden };
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

  it("takes the position of a raiser that has its own", () => {
    const { reported, hidden } = raiseFromSceneChild(position(3, 5, 10));
    expect(hidden).toEqual([]);
    expect(reported).toEqual([
      {
        fileName: null,
        filePath: URI,
        startLineNumber: 3,
        endLineNumber: 3,
        startCharacterNumber: 5,
        endCharacterNumber: 10,
      },
    ]);
  });

  it("stays hidden when its raiser is placed only by the scene around it", () => {
    const { reported, hidden } = raiseFromSceneChild(null);
    expect(reported).toEqual([]);
    expect(hidden).toEqual(["unplaced"]);
  });
});
