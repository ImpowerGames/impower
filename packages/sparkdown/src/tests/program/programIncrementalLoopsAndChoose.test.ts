// The cumulative oracle over loops and `choose` blocks in long bodies, served
// from their memos (#1683).
//
// The helpers are in ./incrementalOracleHarness; the oracle's shape is set
// out there. Each top-level describe of the former programIncrementalOracles
// test file runs from a file of its own (#1932).
import { describe, expect, it } from "vitest";
import { coldSurface, cumulativeRun, quiet } from "./incrementalOracleHarness";

// The long screenplay's shape, whose bodies hold a loop of each form, with a
// `break` or a `continue` and a local in some, and `choose` blocks with a
// named choice and a labelled `then` clause, among the beats, in choice
// bodies and in the `then` clause (#1683).
function loopsAndChooseScreenplay(): string {
  const loops = (pad: string, i: number): string[] => {
    switch (Math.floor(i / 5) % 4) {
      case 0:
        return [`${pad}while heat > ${i * 100} do`, `${pad}  & heat = heat - 1`, `${pad}  if heat < 0 then`, `${pad}    break`, `${pad}  end`, `${pad}end`];
      case 1:
        return [`${pad}for i = 1, ${i} do`, `${pad}  Count {i} of ${i}.`, `${pad}  if i > 1 then`, `${pad}    continue`, `${pad}  end`, `${pad}end`];
      case 2:
        return [`${pad}for k, v in { a = ${i} } do`, `${pad}  local seen = v`, `${pad}  Seen {k} {seen}.`, `${pad}end`];
      default:
        return [`${pad}repeat`, `${pad}  & heat = heat + ${i}`, `${pad}until heat > ${i}`];
    }
  };
  const beats = (pad: string, n: number, tag: string) =>
    Array.from({ length: n }, (_, i) => {
      const id = `${tag.split(" ").join("_")}_${i}`;
      switch (i % 5) {
        case 0:
          return `${pad}HERO: Line ${i} of ${tag}, said aloud.`;
        case 1:
          return loops(pad, i).join("\n");
        case 2:
          return `${pad}Seen {heat} times in ${tag}, beat ${i}.`;
        case 3:
          return [
            `${pad}choose`,
            `${pad}  * (pick_${id}) [Pick ${i}]`,
            `${pad}    Picked ${i} in ${tag}.`,
            `${pad}  + [Pass ${i}]`,
            `${pad}    Passed ${i}.`,
            `${pad}then (after_${id})`,
            `${pad}  After ${i}, picked {pick_${id}}.`,
            `${pad}end`,
          ].join("\n");
        default:
          return `${pad}A quiet beat ${i} of ${tag}.`;
      }
    });
  return [
    "store trust = 0",
    "store heat = 0",
    "",
    "define hero as character with",
    '  name = "Hero"',
    "end",
    "",
    "scene LOOPS",
    "  The scene begins.",
    "  choose",
    "    + [Go on]",
    "      You go on.",
    ...beats("      ", 20, "the first choice"),
    "    + [Stay]",
    "      You stay.",
    ...beats("      ", 10, "the second choice"),
    "  then",
    ...beats("    ", 60, "the clause"),
    "  end",
    "  -> ENDING",
    "end",
    "",
    "scene ENDING",
    "  Done with {heat}.",
    "  done",
    "end",
    "",
  ].join("\n");
}

// Whole lines the edits inside bodies insert into the loops screenplay: a
// line of dialogue, a line of action, a local, an assignment, an `end`, the
// heads of a loop of each form and of a `choose` block, a choice, a `then`,
// a `break` and an `until`.
const LOOP_LINES = [
  "HERO: A new line of dialogue.",
  "A new line of action.",
  "local heat = 5",
  "& heat = heat + 1",
  "end",
  "while heat < 2 do",
  "for i = 1, 2 do",
  "for k, v in { b = 2 } do",
  "repeat",
  "until heat > 0",
  "break",
  "choose",
  "* [A late choice]",
  "then",
];

describe("the oracles over loops and `choose` blocks in long bodies, served from their memos (#1683)", () => {
  it("incremental == cold across many cumulative edits on ONE compiler, half inside the long bodies", () => {
    quiet(() => {
      const text = loopsAndChooseScreenplay();
      expect(coldSurface(text).chunks).not.toBeNull();
      const inserts = ["x", "\n", " ", "1", "}", "{", "{heat}", "// c", "->", "end", ")", "", "HERO:", "-> ENDING", "then", " += 1", "do", "until", "break"];
      const EDIT_COUNT = 80;
      const { failures, chunked, nested, served } = cumulativeRun(text, 0x1683a, EDIT_COUNT, inserts, LOOP_LINES, [], true);
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
      expect(chunked, "compiles that built chunks").toBeGreaterThan(EDIT_COUNT / 3);
      expect(nested, "edits inside bodies").toBeGreaterThan(EDIT_COUNT / 4);
      // Most edits inside a body leave the rest of its statements, its loops
      // and its `choose` blocks among them, to their memos.
      expect(served, "statements served from their memos").toBeGreaterThan(EDIT_COUNT * 10);
    });
  }, 600_000);
});
