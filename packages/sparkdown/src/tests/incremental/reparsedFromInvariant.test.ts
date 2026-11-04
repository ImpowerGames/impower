import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { type ChangedRange, TreeFragment } from "@lezer/common";
import { describe, expect, it } from "vitest";
import { getParser } from "../compiler/grammarSnapshot";
import { coupledScreenplay } from "../compiler/fixtures/coupledScreenplay";

interface Change {
  from: number;
  to: number;
  insert: string;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INSERTS = ["x", " ", "\n", "\n\n", "scene A\n", "end\n", "@ Bob\n", "Hi there.\n", "{", "}", "(", ")", "\"", "--", "# t", "~ x = 1\n", "> A\n", "\t"];

function reparse(text: string, changes: Change[]) {
  const parser = getParser();
  const base = parser.parse(text);
  const ordered = [...changes].sort((a, b) => a.from - b.from);
  let newText = "";
  let cursor = 0;
  let shift = 0;
  const ranges: ChangedRange[] = [];
  for (const c of ordered) {
    newText += text.slice(cursor, c.from) + c.insert;
    cursor = c.to;
    ranges.push({
      fromA: c.from,
      toA: c.to,
      fromB: c.from + shift,
      toB: c.from + shift + c.insert.length,
    });
    shift += c.insert.length - (c.to - c.from);
  }
  newText += text.slice(cursor);
  const fragments = TreeFragment.applyChanges(TreeFragment.addTree(base), ranges);
  const tree = parser.parse(newText, fragments);
  const compiler: any = tree.prop(cachedCompilerProp as any);
  return {
    reparsedFrom: compiler?.reparsedFrom as number | null | undefined,
    firstChanged: ranges[0]!.fromB,
  };
}

function randomChange(rand: () => number, text: string): Change {
  const kind = Math.floor(rand() * 4);
  const pos = Math.floor(rand() * (text.length + 1));
  const insert = INSERTS[Math.floor(rand() * INSERTS.length)]!;
  if (kind === 0) return { from: pos, to: pos, insert };
  const to = Math.min(text.length, pos + 1 + Math.floor(rand() * 20));
  if (kind === 1) return { from: pos, to, insert: "" };
  if (kind === 2) return { from: pos, to, insert: text.slice(pos, to - 1) + insert };
  return { from: text.length, to: text.length, insert };
}

describe("an incremental parse restarts at or before the first changed character", () => {
  const text = coupledScreenplay();

  it("holds over fuzzed single-change edits", () => {
    const rand = mulberry32(1811);
    const failures: string[] = [];
    for (let i = 0; i < 300; i++) {
      const change = randomChange(rand, text);
      const { reparsedFrom, firstChanged } = reparse(text, [change]);
      if (reparsedFrom != null && reparsedFrom > firstChanged) {
        failures.push(`${JSON.stringify(change)} -> reparsedFrom ${reparsedFrom} > ${firstChanged}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("holds over fuzzed multi-range transactions", () => {
    const rand = mulberry32(366);
    const failures: string[] = [];
    for (let i = 0; i < 200; i++) {
      const count = 2 + Math.floor(rand() * 3);
      const changes: Change[] = [];
      let floor = 0;
      for (let k = 0; k < count && floor < text.length; k++) {
        const from = floor + Math.floor(rand() * ((text.length - floor) / (count - k)));
        const to = Math.min(text.length, from + Math.floor(rand() * 8));
        changes.push({ from, to, insert: INSERTS[Math.floor(rand() * INSERTS.length)]! });
        floor = to + 1;
      }
      const { reparsedFrom, firstChanged } = reparse(text, changes);
      if (reparsedFrom != null && reparsedFrom > firstChanged) {
        failures.push(`${JSON.stringify(changes)} -> reparsedFrom ${reparsedFrom} > ${firstChanged}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it.each([
    ["appends a scene at the end", [{ from: text.length, to: text.length, insert: "\nscene Z\nHi.\nend\n" }]],
    ["deletes the document tail", [{ from: text.length - 10, to: text.length, insert: "" }]],
    ["edits the start and the end together", [{ from: 0, to: 0, insert: "x" }, { from: text.length, to: text.length, insert: "\nend\n" }]],
    ["edits two distant middle points", [{ from: 40, to: 45, insert: "" }, { from: Math.floor(text.length / 2), to: Math.floor(text.length / 2), insert: "\n@ Bob\n" }]],
  ])("holds when a transaction %s", (_name, changes) => {
    const { reparsedFrom, firstChanged } = reparse(text, changes as Change[]);
    expect(reparsedFrom ?? 0).toBeLessThanOrEqual(firstChanged);
  });
});
