// SparkdownDocument-driven INCREMENTAL parity net.
//
// productionInputParity guards from-scratch parses on both input types; this
// suite guards the INCREMENTAL path on the production input (SparkdownDocument,
// lineChunks=true): every incremental reparse must be byte-identical to a
// from-scratch parse of the edited text — on the SAME input type AND on string
// input (cross-input identity).
//
// Includes the cases the in-scope split/resume machinery is most exposed to:
// - edits deep inside a large block (restart from a mid-block line boundary
//   via a resume snapshot instead of the block start);
// - DEPTH-CHANGE edits: inserting/deleting `end`, opening a new nested block
//   mid-body — the scope structure after the edit differs from the structure
//   the old chunks were built under;
// - sequential edit bursts (each reparse chains off the previous incremental
//   tree, like real typing).

import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { type Tree, TreeFragment } from "@lezer/common";
import { describe, expect, test } from "vitest";
import { SparkdownDocument } from "../../compiler/classes/SparkdownDocument";
import { getParser } from "../compiler/grammarSnapshot";
import { type Edit, applyEdit, replaceEdit, reparsedSpan } from "./incremental";

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(ESC + "\\[\\d+(?:;\\d+)*m", "g");
const stripAnsi = (s: string) => s.replace(ANSI, "");

let docVersion = 0;
function doc(text: string): SparkdownDocument {
  return new SparkdownDocument(
    "file:///inc.sd",
    "sparkdown",
    ++docVersion,
    text,
  );
}

function dump(tree: Tree, text: string): string {
  return stripAnsi(printTree(tree, text));
}

/** One incremental doc-input reparse; returns trees + the reparsed span. */
function docEditAndReparse(text: string, edit: Edit) {
  const parser = getParser();
  const fullTree = parser.parse(doc(text) as any);

  const newText = applyEdit(text, edit);
  let fragments = TreeFragment.addTree(fullTree);
  fragments = TreeFragment.applyChanges(fragments, [
    {
      fromA: edit.from,
      toA: edit.to,
      fromB: edit.from,
      toB: edit.from + edit.insert.length,
    },
  ]);

  const incTree = parser.parse(doc(newText) as any, fragments);
  return { newText, incTree, span: reparsedSpan(incTree) };
}

/** Asserts the incremental doc tree matches scratch parses on BOTH inputs. */
function expectIdentical(
  name: string,
  newText: string,
  incTree: Tree,
) {
  const parser = getParser();
  const incStr = dump(incTree, newText);
  const scratchDocStr = dump(parser.parse(doc(newText) as any), newText);
  const scratchStr = dump(parser.parse(newText), newText);
  expect(incStr, `${name}: incremental != scratch (doc input)`).toBe(
    scratchDocStr,
  );
  expect(incStr, `${name}: incremental != scratch (string input)`).toBe(
    scratchStr,
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

const NESTED = `scene Branchy
  choose
    * Go
  then (g)
    if ready then
      for i in list do
        log(i)
      end
    end
    She nods.
  end
  done
end
`;

const insertEdit = (src: string, find: string, insert: string): Edit => {
  const at = src.indexOf(find);
  if (at < 0) throw new Error(`insertEdit: ${JSON.stringify(find)} not found`);
  const pos = at + find.length;
  return { from: pos, to: pos, insert };
};

const deleteLineEdit = (src: string, find: string): Edit => {
  const at = src.indexOf(find);
  if (at < 0) {
    throw new Error(`deleteLineEdit: ${JSON.stringify(find)} not found`);
  }
  const lineStart = src.lastIndexOf("\n", at) + 1;
  const lineEnd = src.indexOf("\n", at) + 1;
  return { from: lineStart, to: lineEnd, insert: "" };
};

// ---------------------------------------------------------------------------
// In-block edits on the production input
// ---------------------------------------------------------------------------

describe("doc-input incremental — in-block edits", () => {
  const text = bigThenBlock(40);

  const CASES: { name: string; edit: (s: string) => Edit }[] = [
    {
      name: "edit a middle body line",
      edit: (s) =>
        replaceEdit(
          s,
          "This is dialogue line number 20 inside the block.",
          "This is EDITED dialogue line 20.",
        ),
    },
    {
      name: "edit the first body line",
      edit: (s) =>
        replaceEdit(
          s,
          "This is dialogue line number 1 inside the block.",
          "First line, edited.",
        ),
    },
    {
      name: "edit the last body line",
      edit: (s) =>
        replaceEdit(
          s,
          "This is dialogue line number 40 inside the block.",
          "Last line, edited.",
        ),
    },
    {
      name: "insert a new body line",
      edit: (s) =>
        insertEdit(
          s,
          "This is dialogue line number 20 inside the block.",
          "\n    Freshly inserted line.",
        ),
    },
    {
      name: "delete a body line",
      edit: (s) => deleteLineEdit(s, "dialogue line number 21"),
    },
  ];

  for (const c of CASES) {
    test(c.name, () => {
      const r = docEditAndReparse(text, c.edit(text));
      expectIdentical(c.name, r.newText, r.incTree);
    });
  }

  test("mid-block edit restarts from a mid-block line boundary (boundedness)", () => {
    // A from-scratch parse keeps whole-block chunks (TreeBuffer-fast), so
    // the FIRST edit in a block is a warm-up: it reparses from the block's
    // pure boundary and mints the in-block split points. Perform the
    // warm-up, then measure the SECOND edit — the steady-state typing cost.
    const parser = getParser();
    const fullTree = parser.parse(doc(text) as any);
    const warmupEdit = replaceEdit(
      text,
      "This is dialogue line number 10 inside the block.",
      "This is WARMED dialogue line 10.",
    );
    let fragments = TreeFragment.addTree(fullTree);
    fragments = TreeFragment.applyChanges(fragments, [
      {
        fromA: warmupEdit.from,
        toA: warmupEdit.to,
        fromB: warmupEdit.from,
        toB: warmupEdit.from + warmupEdit.insert.length,
      },
    ]);
    const warmText = applyEdit(text, warmupEdit);
    const warmTree = parser.parse(doc(warmText) as any, fragments);
    expectIdentical("warm-up", warmText, warmTree);

    const edit = replaceEdit(
      warmText,
      "This is dialogue line number 20 inside the block.",
      "This is EDITED dialogue line 20.",
    );
    fragments = TreeFragment.addTree(warmTree);
    fragments = TreeFragment.applyChanges(fragments, [
      {
        fromA: edit.from,
        toA: edit.to,
        fromB: edit.from,
        toB: edit.from + edit.insert.length,
      },
    ]);
    const newText = applyEdit(warmText, edit);
    const incTree = parser.parse(doc(newText) as any, fragments);
    expectIdentical("boundedness", newText, incTree);

    const blockFrom = newText.indexOf("  then (greeting)");
    const blockTo = newText.indexOf("  end", blockFrom) + "  end".length;
    const blockLen = blockTo - blockFrom;
    const span = reparsedSpan(incTree);
    const spanLen = span ? span.to - span.from : newText.length;
    // eslint-disable-next-line no-console
    console.log(
      `[doc-incremental] reparsed=${spanLen} chars; block=${blockLen}; span/block=${(spanLen / blockLen).toFixed(2)}`,
    );
    // The restart must engage INSIDE the block (< the whole block plus its
    // surroundings): restart ~2 lines above the edit, splice back in at
    // the line boundary past it.
    expect(spanLen).toBeLessThan(blockLen);
    // And the restart point must be AFTER the block's start (mid-block).
    expect(span).not.toBeNull();
    expect(span!.from).toBeGreaterThan(blockFrom);
  });
});

// ---------------------------------------------------------------------------
// Depth-change edits: the scope structure itself changes
// ---------------------------------------------------------------------------

describe("doc-input incremental — depth-change edits", () => {
  const big = bigThenBlock(30);

  const CASES: { name: string; source: string; edit: (s: string) => Edit }[] = [
    {
      name: "open a nested if mid-body (deepens everything after)",
      source: big,
      edit: (s) =>
        insertEdit(
          s,
          "This is dialogue line number 10 inside the block.",
          "\n    if ready then",
        ),
    },
    {
      name: "close the block early (insert end mid-body)",
      source: big,
      edit: (s) =>
        insertEdit(
          s,
          "This is dialogue line number 10 inside the block.",
          "\n  end",
        ),
    },
    {
      name: "delete the block's end (scope extends to EOF)",
      source: big,
      edit: (s) => deleteLineEdit(s, "  end"),
    },
    {
      name: "delete a nested end (inner scope swallows outer content)",
      source: NESTED,
      edit: (s) => deleteLineEdit(s, "      end"),
    },
    {
      name: "insert a nested for-loop inside the if",
      source: NESTED,
      edit: (s) =>
        insertEdit(s, "if ready then", "\n      while more do\n        x\n      end"),
    },
    {
      name: "dedent: replace a body line with an end + content",
      source: big,
      edit: (s) =>
        replaceEdit(
          s,
          "    L15: This is dialogue line number 15 inside the block.",
          "  end\n  done2",
        ),
    },
  ];

  for (const c of CASES) {
    test(c.name, () => {
      const r = docEditAndReparse(c.source, c.edit(c.source));
      expectIdentical(c.name, r.newText, r.incTree);
    });
  }
});

// ---------------------------------------------------------------------------
// Sequential edit bursts (chained incremental trees, like real typing)
// ---------------------------------------------------------------------------

describe("doc-input incremental — sequential edits", () => {
  test("a typing burst inside a large block stays byte-identical", () => {
    const parser = getParser();
    let text = bigThenBlock(40);
    let tree = parser.parse(doc(text) as any);

    // Simulate typing a short sentence, one character at a time, at the end
    // of body line 20, then deleting a chunk of it.
    const target = "This is dialogue line number 20 inside the block.";
    let insertAt = text.indexOf(target) + target.length;
    const typed = " And typed!";
    for (let i = 0; i < typed.length; i++) {
      const edit: Edit = { from: insertAt, to: insertAt, insert: typed[i]! };
      const newText = applyEdit(text, edit);
      let fragments = TreeFragment.addTree(tree);
      fragments = TreeFragment.applyChanges(fragments, [
        { fromA: edit.from, toA: edit.to, fromB: edit.from, toB: edit.from + 1 },
      ]);
      tree = parser.parse(doc(newText) as any, fragments);
      text = newText;
      insertAt += 1;
    }
    // then delete " typed!" (7 chars) back off the end
    const delFrom = insertAt - 7;
    let fragments = TreeFragment.addTree(tree);
    fragments = TreeFragment.applyChanges(fragments, [
      { fromA: delFrom, toA: insertAt, fromB: delFrom, toB: delFrom },
    ]);
    text = text.slice(0, delFrom) + text.slice(insertAt);
    tree = parser.parse(doc(text) as any, fragments);

    expectIdentical("typing burst", text, tree);
  });

  test("edits at alternating ends of the document", () => {
    const parser = getParser();
    let text = bigThenBlock(30);
    let tree = parser.parse(doc(text) as any);

    const edits: Edit[] = [
      { from: text.indexOf("Option A") + 8, to: text.indexOf("Option A") + 8, insert: "!" },
      { from: text.length - 1, to: text.length - 1, insert: "# trailing note\n" },
      replaceEdit(text, "dialogue line number 5", "dialogue line FIVE"),
    ];
    for (const edit of edits) {
      const newText = applyEdit(text, edit);
      let fragments = TreeFragment.addTree(tree);
      fragments = TreeFragment.applyChanges(fragments, [
        {
          fromA: edit.from,
          toA: edit.to,
          fromB: edit.from,
          toB: edit.from + edit.insert.length,
        },
      ]);
      tree = parser.parse(doc(newText) as any, fragments);
      text = newText;
      expectIdentical("alternating edit", text, tree);
    }
  });
});
