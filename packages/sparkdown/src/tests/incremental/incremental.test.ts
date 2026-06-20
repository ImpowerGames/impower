import { describe, expect, test } from "vitest";
import { editAndReparse, type Edit, replaceEdit } from "./incremental";

// Builds a scene whose `choose ... then ... end` block has a large body, so the
// "reparse the whole block on any in-body edit" cost is visible.
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

// ---- Correctness matrix --------------------------------------------------
// Every incremental reparse must produce a tree byte-identical to a from-scratch
// parse. These cases MUST stay green across the line+stack refactor — they are
// the primary safety net.

const IF_BLOCK = `scene LoseTrust(c: companion)
  if c.trust == 0 then
    {c.name} doesn't trust you at all.
  elseif c.trust == 1 then
    {c.name} barely trusts you.
  else
    & c.trust -= 1
    {c.name} trusts you a little less...
  end
end
`;

const CHOOSE_THEN = `scene main
  choose
    * Hi
    * Hey
  then (greeting)
    She nods.
    He waves back slowly.
  end
  done
end
`;

const FOR_LOOP = `function tally(items)
  total = 0
  for i in items do
    total = total + i
    n += 1
  end
  return total
end
`;

const WHILE_LOOP = `function drain(stack)
  while #stack > 0 do
    x = stack[#stack]
    log(x)
  end
end
`;

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

interface MatrixCase {
  name: string;
  source: string;
  edit: (src: string) => Edit;
}

const insertEdit = (src: string, find: string, insert: string): Edit => {
  const at = src.indexOf(find);
  if (at < 0) throw new Error(`insertEdit: ${JSON.stringify(find)} not found`);
  const pos = at + find.length;
  return { from: pos, to: pos, insert };
};
const deleteLineEdit = (src: string, find: string): Edit => {
  const at = src.indexOf(find);
  if (at < 0) throw new Error(`deleteLineEdit: ${JSON.stringify(find)} not found`);
  const lineStart = src.lastIndexOf("\n", at) + 1;
  const lineEnd = src.indexOf("\n", at) + 1;
  return { from: lineStart, to: lineEnd, insert: "" };
};

const MATRIX: MatrixCase[] = [
  // if/elseif/else — edit body of each arm + the condition
  { name: "if: edit then-body", source: IF_BLOCK, edit: (s) => replaceEdit(s, "doesn't trust you at all", "DOES NOT trust you") },
  { name: "if: edit elseif-body", source: IF_BLOCK, edit: (s) => replaceEdit(s, "barely trusts you", "hardly trusts you at all now") },
  { name: "if: edit else-body", source: IF_BLOCK, edit: (s) => replaceEdit(s, "a little less", "much much less") },
  { name: "if: edit condition", source: IF_BLOCK, edit: (s) => replaceEdit(s, "c.trust == 0", "c.trust <= 0") },
  { name: "if: bare stmt in else", source: IF_BLOCK, edit: (s) => replaceEdit(s, "c.trust -= 1", "c.trust -= 2") },
  // choose/then
  { name: "then: edit body line", source: CHOOSE_THEN, edit: (s) => replaceEdit(s, "She nods.", "She nods slowly.") },
  { name: "then: edit choice", source: CHOOSE_THEN, edit: (s) => replaceEdit(s, "* Hey", "* Heya there") },
  { name: "then: insert into body", source: CHOOSE_THEN, edit: (s) => insertEdit(s, "She nods.", "\n    A pause.") },
  { name: "then: delete body line", source: CHOOSE_THEN, edit: (s) => deleteLineEdit(s, "He waves back") },
  // for / while
  { name: "for: edit body", source: FOR_LOOP, edit: (s) => replaceEdit(s, "total + i", "total + i * 2") },
  { name: "for: edit header", source: FOR_LOOP, edit: (s) => replaceEdit(s, "for i in items", "for i in entries") },
  { name: "while: edit body", source: WHILE_LOOP, edit: (s) => replaceEdit(s, "log(x)", "log(x, x)") },
  // nested
  { name: "nested: edit innermost for-body", source: NESTED, edit: (s) => replaceEdit(s, "log(i)", "log(i, ready)") },
  { name: "nested: edit then-body after nested if", source: NESTED, edit: (s) => replaceEdit(s, "She nods.", "She nods twice.") },
];

describe("incremental reuse — correctness", () => {
  for (const c of MATRIX) {
    test(c.name, () => {
      const r = editAndReparse(c.source, c.edit(c.source));
      expect(
        r.identical,
        `incremental tree diverged from scratch for "${c.name}":\n${r.diff}`,
      ).toBe(true);
    });
  }
});

describe("incremental reuse — boundedness", () => {
  test("edit inside a large then-block: correct + measure reparsed span", () => {
    const text = bigThenBlock(40);
    const target = "This is dialogue line number 20 inside the block.";
    const edit = replaceEdit(text, target, "This is EDITED dialogue line 20.");

    const r = editAndReparse(text, edit);
    expect(r.identical, `tree diverged:\n${r.diff}`).toBe(true);

    const blockFrom = r.newText.indexOf("  then (greeting)");
    const blockTo = r.newText.indexOf("  end", blockFrom) + "  end".length;
    const blockLen = blockTo - blockFrom;
    const editLineStart = r.newText.lastIndexOf("\n", edit.from) + 1;
    const editLineEnd = r.newText.indexOf("\n", edit.from);
    const editLineLen = editLineEnd - editLineStart;
    const span = r.reparsed;
    const spanLen = span ? span.to - span.from : r.newText.length;

    // eslint-disable-next-line no-console
    console.log(
      `[incremental] reparsed=${spanLen} chars; editedLine=${editLineLen}; block=${blockLen}; ` +
        `span/line=${(spanLen / editLineLen).toFixed(1)}x span/block=${(spanLen / blockLen).toFixed(2)}`,
    );
    expect(spanLen).toBeGreaterThan(0);

    // NOTE: pre-refactor this span ≈ the whole block (~58x the edited line).
    // After the line+stack refactor, tighten this to assert boundedness:
    //   expect(spanLen).toBeLessThan(editLineLen * 4);
  });
});
