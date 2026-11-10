import { describe, expect, test } from "vitest";
import { collectDiagnostics } from "../runtime/runtimeTestHarness";
import { parseSource } from "./grammarSnapshot";
import {
  compareEnginesFull,
  formatDivergences,
  treeScopeStackAt,
  vscodeScopeStacksPerChar,
} from "./scopeEquality";

const COMMENTED = [
  "Hello. // TODO: tidy this line",
  "Hello.// TODO: tidy",
  "Hello. // a: b: c",
  "// TODO: tidy",
  "Hello.\t// TODO: tidy",
  "HERO: Hi. // note: later",
];

const DIALOGUE = [
  { line: "A/B: Hi.", name: "A/B" },
  { line: "A//B: Hi.", name: "A//B" },
  { line: "HERO //x: Hi.", name: "HERO //x" },
  { line: "HERO: Hi.", name: "HERO" },
];

const inScene = (line: string) => `scene start\n  ${line}\nend\n`;

function characterNames(source: string): string[] {
  const names: string[] = [];
  parseSource(source).iterate({
    enter: (node) => {
      if (node.name === "DialogueCharacterName") {
        names.push(source.slice(node.from, node.to));
      }
    },
  });
  return names;
}

describe("a trailing // comment holding a colon", () => {
  test.each(COMMENTED)("%j scopes the same in both engines", async (line) => {
    const result = await compareEnginesFull(inScene(line));
    expect(
      result.divergences,
      formatDivergences(result.source, result.divergences),
    ).toEqual([]);
  });

  test.each(COMMENTED)("%j scopes its comment as a comment", async (line) => {
    const source = inScene(line);
    const vscode = await vscodeScopeStacksPerChar(source);
    const tree = parseSource(source);
    const start = source.indexOf("//");
    const end = source.indexOf("\n", start);
    for (let offset = start; offset < end; offset++) {
      const at = `${JSON.stringify(source[offset])} @ ${offset}`;
      expect(vscode[offset], `vscode ${at}`).toContain(
        "comment.line.double-slash.sd",
      );
      expect(treeScopeStackAt(tree, offset), `tree ${at}`).toContain(
        "comment.line.double-slash.sd",
      );
    }
  });

  test("leaves the display line free of character warnings", () => {
    expect(
      collectDiagnostics(inScene("Hello. // TODO: tidy this line")),
    ).toEqual(collectDiagnostics(inScene("Hello. // todo later")));
  });

  test("names only the speaker when the dialogue line has a comment", () => {
    expect(characterNames(inScene("HERO: Hi. // note: later"))).toEqual([
      "HERO",
    ]);
  });
});

describe("character names holding slashes", () => {
  test.each(DIALOGUE)("$line names $name", async ({ line, name }) => {
    const source = inScene(line);
    expect(characterNames(source)).toEqual([name]);
    const result = await compareEnginesFull(source);
    expect(
      result.divergences,
      formatDivergences(result.source, result.divergences),
    ).toEqual([]);
  });
});
