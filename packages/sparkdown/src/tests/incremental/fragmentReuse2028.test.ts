import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { type Tree, TreeFragment } from "@lezer/common";
import { describe, expect, test } from "vitest";
import { getParser } from "../compiler/grammarSnapshot";
import { applyEdit, type Edit, reparsedSpan } from "./incremental";

const SCENES = 40;
const CUES = 20;

function scene(n: number): string {
  const cues = Array.from(
    { length: CUES },
    (_, i) => `    SPEAKER_${n}_${i}:\n      (aside ${i})\n      Line ${n} number ${i}.\n`,
  ).join("\n");
  return [
    `scene room_${n}`,
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
}

const MIDDLE = SCENES / 2;
const TEXT = Array.from({ length: SCENES }, (_, n) => scene(n)).join("\n");
const SCENE_LENGTH = scene(MIDDLE).length;
const BOUND = 2 * SCENE_LENGTH;
const DEEP = TEXT.indexOf(`    SPEAKER_${MIDDLE}_${CUES / 2}:`);
const TYPED = TEXT.indexOf(`Line ${MIDDLE} number ${CUES / 2}.`) + 4;
const CUE = "    CHARACTER:\n      What do they say?\n\n";

function parseEdit(base: Tree, text: string, edit: Edit) {
  const next = applyEdit(text, edit);
  const fragments = TreeFragment.applyChanges(TreeFragment.addTree(base), [
    { fromA: edit.from, toA: edit.to, fromB: edit.from, toB: edit.from + edit.insert.length },
  ]);
  const tree = getParser().parse(next, fragments);
  return { tree, next };
}

function span(tree: Tree): number {
  const reparsed = reparsedSpan(tree);
  expect(reparsed).not.toBeNull();
  return reparsed!.to - reparsed!.from;
}

function reuses(tree: Tree, base: Tree): boolean {
  return tree.prop(cachedCompilerProp) === base.prop(cachedCompilerProp);
}

function expectCold(tree: Tree, text: string) {
  expect(printTree(tree, text)).toBe(printTree(getParser().parse(text), text));
}

describe("incremental fragment reuse (#2028)", () => {
  test("the fixture's edited block is a small part of the document", () => {
    expect(BOUND * 8).toBeLessThan(TEXT.length);
  });

  test("a second state parsed from the same base reuses fragments", () => {
    const base = getParser().parse(TEXT);
    parseEdit(base, TEXT, { from: DEEP, to: DEEP, insert: CUE });
    const second = parseEdit(base, TEXT, { from: TYPED, to: TYPED, insert: "x" });
    expect(reuses(second.tree, base), "the second state reuses the base's compiler").toBe(true);
    expect(span(second.tree)).toBeLessThan(BOUND);
    expectCold(second.tree, second.next);
  });

  test("the base's next parse after a discarded state reuses fragments and stays editable", () => {
    const base = getParser().parse(TEXT);
    parseEdit(base, TEXT, { from: TYPED, to: TYPED, insert: "discarded" });
    const adopted = parseEdit(base, TEXT, { from: DEEP, to: DEEP, insert: CUE });
    expect(reuses(adopted.tree, base), "the next parse reuses the base's compiler").toBe(true);
    expect(span(adopted.tree)).toBeLessThan(BOUND);
    expectCold(adopted.tree, adopted.next);
    const shifted = TYPED + CUE.length;
    const typed = parseEdit(adopted.tree, adopted.next, { from: shifted, to: shifted, insert: "y" });
    expect(span(typed.tree)).toBeLessThan(BOUND);
    expectCold(typed.tree, typed.next);
  });

  test("a sibling parsed while an earlier parse from the same base is unfinished leaves both trees intact", () => {
    const base = getParser().parse(TEXT);
    const firstText = applyEdit(TEXT, { from: DEEP, to: DEEP, insert: CUE });
    const first = getParser().startParse(
      firstText,
      TreeFragment.applyChanges(TreeFragment.addTree(base), [
        { fromA: DEEP, toA: DEEP, fromB: DEEP, toB: DEEP + CUE.length },
      ]),
    );
    expect(first.advance()).toBeNull();
    const second = parseEdit(base, TEXT, { from: TYPED, to: TYPED, insert: "x" });
    expectCold(second.tree, second.next);
    let firstTree: Tree | null = null;
    while (!firstTree) {
      firstTree = first.advance();
    }
    expectCold(firstTree, firstText);
  });

  test("a state two generations back is no longer reusable and parses cold", () => {
    const base = getParser().parse(TEXT);
    const child = parseEdit(base, TEXT, { from: DEEP, to: DEEP, insert: CUE });
    const shifted = TYPED + CUE.length;
    parseEdit(child.tree, child.next, { from: shifted, to: shifted, insert: "y" });
    const stale = parseEdit(base, TEXT, { from: TYPED, to: TYPED, insert: "z" });
    expect(reuses(stale.tree, base), "the stale base parses with a new compiler").toBe(false);
    expectCold(stale.tree, stale.next);
  });
});
