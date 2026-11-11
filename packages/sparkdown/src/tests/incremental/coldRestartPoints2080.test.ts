import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { type Tree, TreeFragment } from "@lezer/common";
import { describe, expect, test } from "vitest";
import { getParser } from "../compiler/grammarSnapshot";
import { applyEdit, type Edit, reparsedSpan } from "./incremental";

const CUES = 300;

const cues = Array.from(
  { length: CUES },
  (_, i) => `    SPEAKER_${i}:\n      (aside ${i})\n      Line number ${i}.\n`,
).join("\n");

const TEXT = [
  "scene room",
  "  Somebody tosses a bag --",
  "",
  "  choose",
  "    + [Success!]",
  "      The catch lands.",
  "",
  "    + [Fail...]",
  "      The catch misses.",
  "  then",
  "",
  cues,
  "  end",
  "end",
  "",
].join("\n");

const CLAUSE_FROM = TEXT.indexOf("  then");
const CLAUSE_TO = TEXT.indexOf("  end\nend");
const DEEP = TEXT.indexOf(`    SPEAKER_${CUES / 2}:`);
const CUE = "    CHARACTER:\n      What do they say?\n\n";
const BOUND = 400;

function parseEdit(base: Tree, text: string, edit: Edit) {
  const next = applyEdit(text, edit);
  const fragments = TreeFragment.applyChanges(TreeFragment.addTree(base), [
    { fromA: edit.from, toA: edit.to, fromB: edit.from, toB: edit.from + edit.insert.length },
  ]);
  return { tree: getParser().parse(next, fragments), next };
}

function span(tree: Tree): number {
  const reparsed = reparsedSpan(tree);
  expect(reparsed).not.toBeNull();
  return reparsed!.to - reparsed!.from;
}

function expectCold(tree: Tree, text: string) {
  expect(printTree(tree, text)).toBe(printTree(getParser().parse(text), text));
}

function chunksOf(tree: Tree): any[] {
  return (tree.prop(cachedCompilerProp) as any).packet.chunks;
}

describe("restart points inside a block recorded by a cold parse (I-2080)", () => {
  test("the fixture's clause is many times longer than the reparse bound", () => {
    expect(CLAUSE_TO - CLAUSE_FROM).toBeGreaterThan(40 * BOUND);
  });

  test("a first cue inserted deep in a long clause after a cold parse reparses a few lines", () => {
    const base = getParser().parse(TEXT);
    const first = parseEdit(base, TEXT, { from: DEEP, to: DEEP, insert: CUE });
    expect(span(first.tree)).toBeLessThan(BOUND);
    expectCold(first.tree, first.next);
    const typed = first.next.indexOf("What do they say?") + 4;
    const second = parseEdit(first.tree, first.next, { from: typed, to: typed, insert: "x" });
    expect(span(second.tree)).toBeLessThan(BOUND);
    expectCold(second.tree, second.next);
  });

  test("a cue inserted in a choice above the clause rejoins the clause's restart points a few lines on", () => {
    const base = getParser().parse(TEXT);
    const at = TEXT.indexOf("      The catch lands.");
    const first = parseEdit(base, TEXT, { from: at, to: at, insert: CUE });
    expect(span(first.tree)).toBeLessThan(BOUND);
    expectCold(first.tree, first.next);
  });

  test("a cold parse records a restart point at every line start inside the clause", () => {
    const chunks = chunksOf(getParser().parse(TEXT));
    const lineStarts = new Set<number>();
    for (let at = TEXT.indexOf("\n", CLAUSE_FROM) + 1; at > 0 && at < CLAUSE_TO; at = TEXT.indexOf("\n", at) + 1) {
      lineStarts.add(at);
    }
    const restartable = chunks.filter((chunk) => chunk.resume && lineStarts.has(chunk.from));
    expect(restartable.length).toBeGreaterThan(lineStarts.size * 0.9);
  });

  test("the clause's restart points share their frames, share a scope stack within each cue, and keep only what their lines hold", () => {
    const chunks = chunksOf(getParser().parse(TEXT)).filter(
      (chunk) => chunk.from > CLAUSE_FROM && chunk.from < CLAUSE_TO,
    );
    const resumes = chunks.filter((chunk) => chunk.resume).map((chunk) => chunk.resume);
    expect(resumes.length).toBeGreaterThan(3 * CUES);
    expect(new Set(resumes.map((resume) => resume.frames)).size).toBeLessThan(8);
    expect(new Set(resumes.map((resume) => resume.stack)).size).toBeLessThan(CUES + 8);
    for (const chunk of chunks) {
      expect(chunk.compiled.length).toBeLessThanOrEqual(Math.max(32, chunk.nodeCount * 8));
      expect(chunk.stack.entries.length).toBeLessThanOrEqual(48);
    }
  });
});
