import { describe, expect, test } from "vitest";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { stripAnsi } from "./grammarSnapshot";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

// These tests guarantee that the parse tree produced via INCREMENTAL
// updates matches a fresh full parse of the same final source. If
// they diverge, downstream consumers (formatter, syntax highlighting,
// compilation) will misbehave on any document the user edits.
//
// The historic offender: each incremental edit duplicated the
// trailing-EOF `Newline` node (because the empty trailing-split chunk
// in `Packet.add` was positioned at the token's `from` instead of the
// chunk's `to`, making `packet.last.to` artificially small and
// triggering a redundant re-emission of the final newline on append).

type Edit = {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  text: string;
};

function freshTreeStr(source: string): string {
  const reg = new SparkdownDocumentRegistry();
  reg.set({
    textDocument: {
      uri: "file:///fresh.sd",
      text: source,
      version: 1,
      languageId: "sparkdown",
    },
  });
  return stripAnsi(printTree(reg.tree("file:///fresh.sd")!, source));
}

function incrementalTreeStr(initial: string, edits: Edit[][]): string {
  const reg = new SparkdownDocumentRegistry();
  const uri = "file:///incremental.sd";
  reg.set({
    textDocument: { uri, text: initial, version: 1, languageId: "sparkdown" },
  });
  let version = 1;
  for (const batch of edits) {
    version += 1;
    reg.update({
      textDocument: { uri, version },
      contentChanges: batch,
    });
  }
  return stripAnsi(printTree(reg.tree(uri)!, reg.get(uri)!.getText()));
}

function applyEditsToString(source: string, edits: Edit[]): string {
  // Apply in reverse start-offset order so earlier edits don't shift
  // later edits' positions. Mirrors the convention text-document
  // clients use.
  const offsets = edits.map((e) => {
    const ls = e.range.start.line;
    const cs = e.range.start.character;
    const le = e.range.end.line;
    const ce = e.range.end.character;
    return { ls, cs, le, ce, text: e.text };
  });
  const lines = source.split("\n");
  // For simplicity in these tests, only single-line edits at known
  // positions are used; offset-based math is overkill here.
  for (const e of offsets.sort(
    (a, b) =>
      b.ls - a.ls || b.cs - a.cs,
  )) {
    if (e.ls !== e.le) throw new Error("multi-line edits not supported in tests");
    const line = lines[e.ls] ?? "";
    lines[e.ls] = line.slice(0, e.cs) + e.text + line.slice(e.ce);
  }
  return lines.join("\n");
}

function runIncrementalCase(
  initial: string,
  batches: Edit[][],
): { fresh: string; incremental: string; final: string } {
  let source = initial;
  for (const batch of batches) {
    source = applyEditsToString(source, batch);
  }
  return {
    fresh: freshTreeStr(source),
    incremental: incrementalTreeStr(initial, batches),
    final: source,
  };
}

describe("incremental parse", () => {
  test("ten single-char inserts at start of line", () => {
    const initial = "line one\nline two\nline three\n";
    const batches: Edit[][] = Array.from({ length: 10 }, () => [
      {
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 0 },
        },
        text: " ",
      },
    ]);
    const { fresh, incremental } = runIncrementalCase(initial, batches);
    expect(incremental).toBe(fresh);
  });

  test("alternating insert and delete near start", () => {
    const initial = "abc\ndef\nghi\n";
    const batches: Edit[][] = [];
    for (let i = 0; i < 8; i++) {
      batches.push([
        {
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 0 },
          },
          text: "x",
        },
      ]);
      batches.push([
        {
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 1 },
          },
          text: "",
        },
      ]);
    }
    const { fresh, incremental } = runIncrementalCase(initial, batches);
    expect(incremental).toBe(fresh);
  });

  test("edits at end of document", () => {
    const initial = "scene Foo:\n  N: Hi\nend\n";
    const batches: Edit[][] = Array.from({ length: 5 }, () => [
      {
        range: {
          start: { line: 2, character: 3 },
          end: { line: 2, character: 3 },
        },
        text: " ",
      },
    ]);
    const { fresh, incremental } = runIncrementalCase(initial, batches);
    expect(incremental).toBe(fresh);
  });

  test("edits in middle of dialogue body", () => {
    const initial = "N: Hello\n  there\n  friend\nN: Bye\n";
    const batches: Edit[][] = [
      [
        {
          range: {
            start: { line: 1, character: 8 },
            end: { line: 1, character: 8 },
          },
          text: "!",
        },
      ],
      [
        {
          range: {
            start: { line: 2, character: 9 },
            end: { line: 2, character: 9 },
          },
          text: "?",
        },
      ],
      [
        {
          range: {
            start: { line: 0, character: 8 },
            end: { line: 0, character: 8 },
          },
          text: ",",
        },
      ],
    ];
    const { fresh, incremental } = runIncrementalCase(initial, batches);
    expect(incremental).toBe(fresh);
  });

  test("inserting and removing keywords", () => {
    const initial = "function f()\n  return 1\nend\n";
    const batches: Edit[][] = [
      [
        {
          range: {
            start: { line: 1, character: 9 },
            end: { line: 1, character: 9 },
          },
          text: " + 1",
        },
      ],
      [
        {
          range: {
            start: { line: 1, character: 9 },
            end: { line: 1, character: 13 },
          },
          text: "",
        },
      ],
      [
        {
          range: {
            start: { line: 1, character: 9 },
            end: { line: 1, character: 9 },
          },
          text: " * 2",
        },
      ],
    ];
    const { fresh, incremental } = runIncrementalCase(initial, batches);
    expect(incremental).toBe(fresh);
  });

  test("100 small edits do not accumulate stray nodes", () => {
    const initial = "scene S:\n  N: hi\n  M: bye\nend\n";
    const batches: Edit[][] = [];
    for (let i = 0; i < 100; i++) {
      const line = (i % 3) + 1;
      const col = (i % 4) + 1;
      batches.push([
        {
          range: {
            start: { line, character: col },
            end: { line, character: col },
          },
          text: ".",
        },
      ]);
    }
    const { fresh, incremental } = runIncrementalCase(initial, batches);
    expect(incremental).toBe(fresh);
  });
});
