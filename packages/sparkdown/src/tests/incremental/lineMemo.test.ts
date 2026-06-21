import {
  LineMemo,
  rebaseTokens,
  toRelTokens,
} from "@impower/textmate-grammar-tree/src/tree/classes/LineMemo";
import type { GrammarToken } from "@impower/textmate-grammar-tree/src/core/types/GrammarToken";
import { describe, expect, test } from "vitest";

describe("LineMemo helpers", () => {
  test("toRelTokens/rebaseTokens round-trip at same pos preserves positions", () => {
    const pos = 100;
    const tokens: GrammarToken[] = [
      [5, 100, 103, [4], undefined],
      [6, 103, 107, undefined, [4]],
    ];
    const rel = toRelTokens(tokens, pos);
    expect(rel.map((t) => [t[1], t[2]])).toEqual([
      [0, 3],
      [3, 7],
    ]);
    const back = rebaseTokens(rel, pos);
    expect(back).toEqual(tokens);
  });

  test("rebase at a shifted pos moves positions by the delta", () => {
    const rel = toRelTokens([[5, 50, 53]] as GrammarToken[], 50);
    const back = rebaseTokens(rel, 80);
    expect([back[0]![1], back[0]![2]]).toEqual([80, 83]);
  });

  test("open/close arrays are cloned, not shared", () => {
    const open = [4];
    const tokens: GrammarToken[] = [[5, 0, 3, open, undefined]];
    const rel = toRelTokens(tokens, 0);
    // mutating the source must not affect the stored rel token
    open.push(99);
    expect(rel[0]![3]).toEqual([4]);
    // and a rebased copy must be independent of the stored rel token
    const a = rebaseTokens(rel, 0);
    const b = rebaseTokens(rel, 0);
    (a[0]![3] as number[]).push(7);
    expect(b[0]![3]).toEqual([4]);
    expect(rel[0]![3]).toEqual([4]);
  });
});

describe("LineMemo store", () => {
  const entry = (matchLength: number) => ({
    entryStack: [],
    matchLength,
    tokens: [],
    exitStack: [],
  });

  test("get/set keyed on (entryHash, lineText)", () => {
    const m = new LineMemo();
    m.set(1, "hello\n", entry(6));
    expect(m.get(1, "hello\n")?.matchLength).toBe(6);
    // different hash or text → miss
    expect(m.get(2, "hello\n")).toBeUndefined();
    expect(m.get(1, "hella\n")).toBeUndefined();
  });

  test("hash/text separator avoids cross-key collisions", () => {
    const m = new LineMemo();
    // keys "1" + SEP + "0x" vs "10" + SEP + "x" must not collide
    m.set(1, "0x", entry(1));
    m.set(10, "x", entry(2));
    expect(m.get(1, "0x")?.matchLength).toBe(1);
    expect(m.get(10, "x")?.matchLength).toBe(2);
  });

  test("bounded memo evicts oldest", () => {
    const m = new LineMemo(2);
    m.set(1, "a", entry(1));
    m.set(2, "b", entry(2));
    m.set(3, "c", entry(3)); // evicts (1,"a")
    expect(m.get(1, "a")).toBeUndefined();
    expect(m.get(2, "b")?.matchLength).toBe(2);
    expect(m.get(3, "c")?.matchLength).toBe(3);
    expect(m.size).toBe(2);
  });
});
