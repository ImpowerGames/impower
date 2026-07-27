// Regression nets for the adversarial-review findings on PR #282
// (https://github.com/ImpowerGames/impower/pull/282#issuecomment-5087796022):
//
// 1. EOF edits (backspace/delete/type-over at the document tail) must not
//    reuse stale chunks past the new document end — the no-op continuation
//    fast path must only fire for TRUE no-ops (packet ends exactly at the
//    zero-width edit point AND the fragment covers the whole input).
// 2. Abandoned partial parses mutate the shared cached compiler; parses off
//    older trees must detect that (epoch check) and fall back to scratch
//    instead of producing corrupt trees.
// 3. A leftover `ahead` packet from an abandoned parse must never be
//    spliced into a later tree (cleared on every reuse).
// 4. An impure splice must refuse a truncated tail (finishAfterSplice
//    retires the tokenizer, so the tail must reach region.to).
// 5. Restarts at mid-line pure boundaries must widen their window to the
//    line start so `^`/lookbehind assertions match a from-scratch parse
//    (Whitespace vs TrailingWhitespace divergence).

import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { type Tree, TreeFragment } from "@lezer/common";
import { describe, expect, test } from "vitest";
import { SparkdownDocument } from "../../compiler/classes/SparkdownDocument";
import { getParser } from "../compiler/grammarSnapshot";
import { type Edit, applyEdit, replaceEdit } from "./incremental";

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(ESC + "\\[\\d+(?:;\\d+)*m", "g");
const strip = (s: string) => s.replace(ANSI, "");

let v = 0;
const doc = (text: string) =>
  new SparkdownDocument("file:///h.sd", "sparkdown", ++v, text);

const dump = (tree: Tree, text: string) => strip(printTree(tree, text));

function bigThenBlock(bodyLines: number): string {
  const body: string[] = [];
  for (let i = 1; i <= bodyLines; i++) {
    body.push(`    L${i}: This is dialogue line number ${i} inside the block.`);
  }
  return [
    "scene Main",
    "  choose",
    "    * Option A",
    "    * Option B",
    "  then (greeting)",
    ...body,
    "  end",
    "  done",
    "end",
    "",
  ].join("\n");
}

function fragmentsFor(tree: Tree, edit: Edit) {
  let fragments = TreeFragment.addTree(tree);
  return TreeFragment.applyChanges(fragments, [
    {
      fromA: edit.from,
      toA: edit.to,
      fromB: edit.from,
      toB: edit.from + edit.insert.length,
    },
  ]);
}

function cachedCompiler(tree: Tree): any {
  return Object.values((tree as any).props ?? {}).find((c: any) => c?.packet);
}

/** Incrementally reparse and assert byte-identity + a healthy packet. */
function checkedReparse(
  name: string,
  tree: Tree,
  text: string,
  edit: Edit,
): { tree: Tree; text: string } {
  const parser = getParser();
  const newText = applyEdit(text, edit);
  const incTree = parser.parse(doc(newText) as any, fragmentsFor(tree, edit));
  const scratch = parser.parse(doc(newText) as any);
  expect(dump(incTree, newText), `${name}: incremental != scratch`).toBe(
    dump(scratch, newText),
  );
  const compiler = cachedCompiler(incTree);
  expect(compiler, `${name}: cached compiler`).toBeTruthy();
  expect(
    compiler.packet.last?.to,
    `${name}: packet must end exactly at the document end`,
  ).toBe(newText.length);
  expect(incTree.length, `${name}: tree length`).toBe(newText.length);
  return { tree: incTree, text: newText };
}

// ---------------------------------------------------------------------------
// 1. EOF edit matrix
// ---------------------------------------------------------------------------

describe("hardening — edits at the document tail", () => {
  const base = bigThenBlock(30);

  const CASES: { name: string; edit: (s: string) => Edit }[] = [
    {
      name: "single backspace at EOF",
      edit: (s) => ({ from: s.length - 1, to: s.length, insert: "" }),
    },
    {
      name: "delete the last line",
      edit: (s) => {
        const from = s.lastIndexOf("\n", s.length - 2) + 1;
        return { from, to: s.length, insert: "" };
      },
    },
    {
      name: "delete the last 150 characters",
      edit: (s) => ({ from: s.length - 150, to: s.length, insert: "" }),
    },
    {
      name: "equal-length type-over at EOF",
      edit: (s) => ({ from: s.length - 6, to: s.length, insert: "XXXXX\n" }),
    },
    {
      name: "insert at EOF",
      edit: (s) => ({
        from: s.length,
        to: s.length,
        insert: "A trailing action line.\n",
      }),
    },
  ];

  for (const c of CASES) {
    test(c.name + " stays byte-identical and keeps a healthy packet", () => {
      const parser = getParser();
      const tree = parser.parse(doc(base) as any);
      const r = checkedReparse(c.name, tree, base, c.edit(base));
      // chained follow-up edit off the incremental tree must also hold
      // (a poisoned packet fails HERE even when the first tree looks fine)
      checkedReparse(
        c.name + " (chained mid-doc edit)",
        r.tree,
        r.text,
        replaceEdit(
          r.text,
          "dialogue line number 5",
          "dialogue line number FIVE",
        ),
      );
    });
  }

  test("backspace at EOF after a warm-up edit (in-scope splits minted)", () => {
    const parser = getParser();
    const tree0 = parser.parse(doc(base) as any);
    const warm = checkedReparse(
      "warm-up",
      tree0,
      base,
      replaceEdit(base, "dialogue line number 10", "dialogue line number TEN"),
    );
    const r = checkedReparse("post-warm backspace", warm.tree, warm.text, {
      from: warm.text.length - 1,
      to: warm.text.length,
      insert: "",
    });
    checkedReparse(
      "post-warm backspace (chained)",
      r.tree,
      r.text,
      replaceEdit(r.text, "dialogue line number 20", "dialogue line 20 EDIT"),
    );
  });

  test("fragments-only continuation still reuses the whole packet (no truncation)", () => {
    const parser = getParser();
    const tree = parser.parse(doc(base) as any);
    const fragments = TreeFragment.addTree(tree);
    const tree2 = parser.parse(doc(base) as any, fragments);
    expect(dump(tree2, base)).toBe(dump(parser.parse(doc(base) as any), base));
    expect(cachedCompiler(tree2).packet.last?.to).toBe(base.length);
  });
});

// ---------------------------------------------------------------------------
// 2 + 3. Abandoned and branched parses
// ---------------------------------------------------------------------------

describe("hardening — abandoned and branched parses", () => {
  const base = bigThenBlock(40);

  function startPartial(text: string, tree: Tree, edit: Edit) {
    const parser = getParser() as any;
    const newText = applyEdit(text, edit);
    const partial = parser.startParse(
      doc(newText) as any,
      fragmentsFor(tree, edit),
    );
    return { partial, newText };
  }

  for (const advances of [0, 1, 2, 5]) {
    test(`abandon after ${advances} advance(s), then reparse from the original tree`, () => {
      const parser = getParser();
      const tree = parser.parse(doc(base) as any);
      const edit = replaceEdit(
        base,
        "dialogue line number 20",
        "dialogue line number XX",
      );
      // start an incremental parse and ABANDON it (its constructor/advances
      // already mutated the shared cached compiler)
      const { partial } = startPartial(base, tree, edit);
      for (let i = 0; i < advances; i++) {
        if (partial.advance()) break;
      }
      // a fresh parse from the SAME original tree + fragments must still be
      // byte-identical (the epoch check must refuse the mutated compiler)
      const otherEdit = replaceEdit(
        base,
        "dialogue line number 30",
        "dialogue line number YY",
      );
      const newText = applyEdit(base, otherEdit);
      const incTree = parser.parse(
        doc(newText) as any,
        fragmentsFor(tree, otherEdit),
      );
      expect(dump(incTree, newText)).toBe(
        dump(parser.parse(doc(newText) as any), newText),
      );
      expect(incTree.length).toBe(newText.length);
    });
  }

  test("branched parses: two sequential parses off the same tree both stay identical", () => {
    const parser = getParser();
    const tree = parser.parse(doc(base) as any);
    const editA = replaceEdit(base, "dialogue line number 15", "branch A line");
    const editB = replaceEdit(base, "dialogue line number 25", "branch B line");
    const textA = applyEdit(base, editA);
    const treeA = parser.parse(doc(textA) as any, fragmentsFor(tree, editA));
    expect(dump(treeA, textA)).toBe(dump(parser.parse(doc(textA) as any), textA));
    // branch B parses from the ORIGINAL tree after branch A mutated the compiler
    const textB = applyEdit(base, editB);
    const treeB = parser.parse(doc(textB) as any, fragmentsFor(tree, editB));
    expect(dump(treeB, textB)).toBe(dump(parser.parse(doc(textB) as any), textB));
    // and continuing off branch A still works
    const editA2 = replaceEdit(textA, "branch A line", "branch A line more");
    const textA2 = applyEdit(textA, editA2);
    const treeA2 = parser.parse(doc(textA2) as any, fragmentsFor(treeA, editA2));
    expect(dump(treeA2, textA2)).toBe(
      dump(parser.parse(doc(textA2) as any), textA2),
    );
  });

  test("stale-ahead resurrection sequence: abandon, tail-rewrite, then grow the doc", () => {
    const parser = getParser();
    const tree = parser.parse(doc(base) as any);
    // 1. abandon a mid-doc edit parse (mints an ahead in the cached compiler)
    const { partial } = startPartial(
      base,
      tree,
      replaceEdit(base, "dialogue line number 10", "dialogue line number QQ"),
    );
    partial.advance();
    // 2. complete a parse that rewrites the tail (shrinks the doc)
    const cut = base.indexOf("    L30:");
    const edit2: Edit = { from: cut, to: base.length, insert: "  end\n  done\nend\n" };
    const text2 = applyEdit(base, edit2);
    const tree2 = parser.parse(doc(text2) as any, fragmentsFor(tree, edit2));
    expect(dump(tree2, text2)).toBe(dump(parser.parse(doc(text2) as any), text2));
    // 3. grow the doc back — any resurrected stale-ahead chunks would put
    // phantom nodes past the end or diverge from scratch
    const edit3: Edit = {
      from: text2.length,
      to: text2.length,
      insert: "scene Extra()\n  More content here.\nend\n",
    };
    const text3 = applyEdit(text2, edit3);
    const tree3 = parser.parse(doc(text3) as any, fragmentsFor(tree2, edit3));
    expect(dump(tree3, text3)).toBe(dump(parser.parse(doc(text3) as any), text3));
    expect(cachedCompiler(tree3).packet.last?.to).toBe(text3.length);
  });
});

// ---------------------------------------------------------------------------
// 5. Mid-line pure-boundary restart window semantics
// ---------------------------------------------------------------------------

describe("hardening — mid-line restart window semantics", () => {
  test("trailing whitespace after a top-level `end` stays identical across an incremental restart", () => {
    // The `end` line carries trailing spaces; a pure split point is minted
    // mid-line right after the zero-width loop close, so an unwidened
    // restart window would flip `(?<!^)`-style assertions
    // (Whitespace vs TrailingWhitespace).
    const text =
      "while x do\n  foo()\nend  \nAn action line here.\nAnother action line.\n";
    const parser = getParser();
    const tree = parser.parse(doc(text) as any);
    const edit = replaceEdit(text, "Another action line.", "Another EDITED line.");
    const r = checkedReparse("trailing-ws restart", tree, text, edit);
    // and again, one line closer to the boundary
    checkedReparse(
      "trailing-ws restart 2",
      r.tree,
      r.text,
      replaceEdit(r.text, "An action line here.", "An action line HERE."),
    );
  });
});
