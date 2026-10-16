// An edit near a run of top-level declarations reads again only the
// declarations it touched (#1637): the incremental parse carries every
// unchanged declaration below the edit, so the chunk store keeps its chunk
// and the compile's work does not grow with the run.
import { describe, expect, it } from "vitest";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { TreeFragment } from "@lezer/common";
import { getParser } from "../compiler/grammarSnapshot";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import { stripAnsi } from "../compiler/grammarSnapshot";
import { describeRoot, MAIN_URI, programCompiler } from "./programHarness";

function posAt(text: string, offset: number) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

const quietly = <T>(run: () => T): T => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

const config = { programChunks: true, seedBuiltinsIntoStory: true };

const script = (n: number) =>
  [
    "Intro.",
    "Before.",
    ...Array.from({ length: n }, (_, i) => `store v${i} = ${i}`),
    "After.",
    "store handler = function()",
    "  return 1",
    "end",
    "",
  ].join("\n");

/** Compiles `text`, replaces the first `find` with `replace` as one minimal
 *  edit, and compiles again. */
function editOnce(text: string, find: string, replace: string) {
  const c = programCompiler({ [MAIN_URI]: text }, config);
  quietly(() => c.compile());
  const offset = text.indexOf(find);
  expect(offset, `"${find}" is in the script`).toBeGreaterThanOrEqual(0);
  c.compiler.updateDocument({
    textDocument: { uri: MAIN_URI, version: 2 },
    contentChanges: [
      {
        range: {
          start: posAt(text, offset),
          end: posAt(text, offset + find.length),
        },
        text: replace,
      },
    ],
  });
  const edited = text.slice(0, offset) + replace + text.slice(offset + find.length);
  const { program } = quietly(() => c.compile());
  return {
    identity: c.compiler.chunkStore!.passesLastBuild.identity,
    root: program.chunks!,
    text: edited,
  };
}

const coldRoot = (text: string) =>
  quietly(() => programCompiler({ [MAIN_URI]: text }, config).compile()).program.chunks!;

describe("an edit near a run of top-level declarations", () => {
  const edits: [string, string, string][] = [
    ["loose content above the run", "Before.", "Edited."],
    ["one declaration in the run", "store v10 = 10", "store v10 = 99"],
    ["loose content below the run", "After.", "Later."],
  ];
  for (const [what, find, replace] of edits) {
    it(`reads again only what it touched when it edits ${what}`, () => {
      const counts = [30, 60, 240].map((n) => editOnce(script(n), find, replace).identity);
      console.log(`#1637 ${find} -> ${replace}: identity at N=30,60,240 = ${counts.join(", ")}`);
      const edited = editOnce(script(240), find, replace);
      expect(edited.identity).toBeLessThanOrEqual(4);
      expect(describeRoot(edited.root)).toEqual(describeRoot(coldRoot(edited.text)));
    });
  }
});

/** The tree an incremental parse of `text` after replacing the first `find`
 *  with `replace` gives, and the tree a cold parse of the result gives. */
function parsedBothWays(text: string, find: string, replace: string) {
  const offset = text.indexOf(find);
  expect(offset, `"${find}" is in the script`).toBeGreaterThanOrEqual(0);
  const edited = text.slice(0, offset) + replace + text.slice(offset + find.length);
  const print = (registry: SparkdownDocumentRegistry, uri: string, source: string) =>
    stripAnsi(printTree(registry.tree(uri)!, source));
  const incremental = new SparkdownDocumentRegistry();
  incremental.set({
    textDocument: { uri: MAIN_URI, text, version: 1, languageId: "sparkdown" },
  });
  incremental.update({
    textDocument: { uri: MAIN_URI, version: 2 },
    contentChanges: [
      {
        range: { start: posAt(text, offset), end: posAt(text, offset + find.length) },
        text: replace,
      },
    ],
  });
  const cold = new SparkdownDocumentRegistry();
  cold.set({
    textDocument: { uri: MAIN_URI, text: edited, version: 1, languageId: "sparkdown" },
  });
  return {
    incremental: print(incremental, MAIN_URI, edited),
    cold: print(cold, MAIN_URI, edited),
  };
}

// The old chunks below an edit are spliced in where the reparse arrives at a
// line that starts a top-level construct; the tree is the one a cold parse
// builds wherever the edit stands against those lines.
describe("an incremental parse of a run of top-level declarations", () => {
  const edits: [string, string, string][] = [
    ["a line above the run", "Before.", "Edited."],
    ["a declaration's value", "store v10 = 10", "store v10 = 99"],
    ["the end of a declaration's line", "= 10\n", "= 10 + 1\n"],
    ["a declaration's value into one that goes on to the next line", "= 10\n", "= 10 +\n"],
    ["the newline between two declarations", "= 10\nstore v11", "= 10 store v11"],
    ["a new line between two declarations", "= 10\n", "= 10\nNew line.\n"],
    ["a declaration into a function's first line", "store v29 = 29", "store v29 = function()"],
    ["a line into an open scene", "After.", "scene AFTER"],
  ];
  for (const [what, find, replace] of edits) {
    it(`gives the cold parse's tree after an edit to ${what}`, () => {
      const { incremental, cold } = parsedBothWays(script(30), find, replace);
      expect(incremental).toBe(cold);
    });
  }

  it("keeps the tree of a parse bounded above the old chunks inside its range", () => {
    // A parse asked for a range that ends inside the run: the old chunks
    // below the edit run on past the range's end, so they are not spliced in.
    const text = script(30);
    const find = "Before.";
    const offset = text.indexOf(find);
    const edited = text.slice(0, offset) + "Edited." + text.slice(offset + find.length);
    const to = edited.indexOf("store v10");
    const parser = getParser();
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(parser.parse(text)), [
      { fromA: offset, toA: offset + find.length, fromB: offset, toB: offset + "Edited.".length },
    ]);
    const incremental = parser.parse(edited, fragments, [{ from: 0, to }]);
    const cold = parser.parse(edited, undefined, [{ from: 0, to }]);
    expect(incremental.length).toBe(to);
    expect(incremental.topNode.lastChild!.to).toBeLessThanOrEqual(to);
    expect(stripAnsi(printTree(incremental, edited))).toBe(stripAnsi(printTree(cold, edited)));
  });
});
