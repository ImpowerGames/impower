import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { type Tree, TreeFragment } from "@lezer/common";
import { describe, expect, test } from "vitest";
import { getParser } from "../compiler/grammarSnapshot";
import { applyEdit, type Edit, reparsedSpan } from "./incremental";

const CLAUSE_CUES = 300;

function script(): string {
  const cues = Array.from(
    { length: CLAUSE_CUES },
    (_, i) => `    SPEAKER_${i}:\n      (aside ${i})\n      Line number ${i}.\n`,
  ).join("\n");
  return [
    "scene opening",
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
    "    -> closing",
    "  end",
    "end",
    "",
    "scene closing",
    "  The end.",
    "end",
    "",
  ].join("\n");
}

const TEXT = script();
const DEEP = TEXT.indexOf(`    SPEAKER_${CLAUSE_CUES / 2}:`);
const TYPED = TEXT.indexOf(`Line number ${CLAUSE_CUES / 2}.`) + 4;
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

function expectCold(tree: Tree, text: string) {
  expect(printTree(tree, text)).toBe(printTree(getParser().parse(text), text));
}

describe("incremental fragment reuse (#2028)", () => {
  test("a first multi-line insertion deep in a long clause reparses only near the edit", () => {
    const base = getParser().parse(TEXT);
    const { tree, next } = parseEdit(base, TEXT, { from: DEEP, to: DEEP, insert: CUE });
    expect(tree.prop(cachedCompilerProp)).toBe(base.prop(cachedCompilerProp));
    expect(span(tree)).toBeLessThan(400);
    expectCold(tree, next);
  });

  test("a second state parsed from the same base reuses fragments", () => {
    const base = getParser().parse(TEXT);
    parseEdit(base, TEXT, { from: DEEP, to: DEEP, insert: CUE });
    const second = parseEdit(base, TEXT, { from: TYPED, to: TYPED, insert: "x" });
    expect(second.tree.prop(cachedCompilerProp)).toBe(base.prop(cachedCompilerProp));
    expect(span(second.tree)).toBeLessThan(400);
    expectCold(second.tree, second.next);
  });

  test("the base's next parse after a discarded state reuses fragments and stays editable", () => {
    const base = getParser().parse(TEXT);
    parseEdit(base, TEXT, { from: TYPED, to: TYPED, insert: "discarded" });
    const adopted = parseEdit(base, TEXT, { from: DEEP, to: DEEP, insert: CUE });
    expect(adopted.tree.prop(cachedCompilerProp)).toBe(base.prop(cachedCompilerProp));
    expect(span(adopted.tree)).toBeLessThan(400);
    expectCold(adopted.tree, adopted.next);
    const shifted = TYPED + CUE.length;
    const typed = parseEdit(adopted.tree, adopted.next, { from: shifted, to: shifted, insert: "y" });
    expect(span(typed.tree)).toBeLessThan(400);
    expectCold(typed.tree, typed.next);
  });

  test("a sibling parsed while an earlier parse from the same base is unfinished leaves both trees intact", () => {
    const base = getParser().parse(TEXT);
    const firstEdit: Edit = { from: DEEP, to: DEEP, insert: CUE };
    const firstText = applyEdit(TEXT, firstEdit);
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
    expect(stale.tree.prop(cachedCompilerProp)).not.toBe(base.prop(cachedCompilerProp));
    expectCold(stale.tree, stale.next);
  });
});
