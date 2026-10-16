// The cumulative oracle over long block bodies, served from their memos
// (#656).
//
// The helpers are in ./incrementalOracleHarness; the oracle's shape is set
// out there. Each top-level describe of the former programIncrementalOracles
// test file runs from a file of its own (#1932).
import { describe, expect, it } from "vitest";
import { coldSurface, cumulativeRun, quiet } from "./incrementalOracleHarness";

// A screenplay whose blocks have bodies long enough that an edit inside one
// rebuilds a few of its statements and the parse keeps the rest, so that the
// compile serves them from their memos (#656): a `choose` block whose choice
// bodies and `then` clause hold beats, interpolations, portraits, calls,
// `if` blocks and a label, and a function whose body holds calls, a local
// and an `if`.
function longBodiesScreenplay(): string {
  const beats = (pad: string, n: number, tag: string) =>
    Array.from({ length: n }, (_, i) => {
      switch (i % 7) {
        case 0:
          return `${pad}HERO: Line ${i} of ${tag}, said aloud.`;
        case 1:
          return `${pad}The action of ${tag} goes on, beat ${i}.`;
        case 2:
          return `${pad}Seen {trust} times in ${tag}, beat ${i}.`;
        case 3:
          return `${pad}[[show backdrop alley_${i}]]`;
        case 4:
          return `${pad}& heat = heat + ${i}`;
        case 5:
          return [`${pad}if trust > ${i} then`, `${pad}  HERO: Trusted ${i} in ${tag}.`, `${pad}end`].join("\n");
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
    "scene OPENING",
    "  An opening line.",
    "  -> LONG",
    "end",
    "",
    "scene LONG",
    "  The long scene begins.",
    "  choose",
    "    + [Go on]",
    "      You go on.",
    ...beats("      ", 24, "the first choice"),
    "    + [Stay]",
    "      You stay.",
    ...beats("      ", 12, "the second choice"),
    "  then",
    ...beats("    ", 50, "the clause"),
    "    label middle",
    ...beats("    ", 50, "the rest"),
    "  end",
    "  -> ENDING",
    "end",
    "",
    "function tally()",
    ...Array.from({ length: 20 }, (_, i) => `  print("tally ${i}")`),
    "  local n = 1",
    ...Array.from({ length: 20 }, (_, i) => `  print("more ${i}")`),
    "  if n > 0 then",
    '    print("positive")',
    "  end",
    "  return n",
    "end",
    "",
    "scene ENDING",
    "  Done with {tally()}.",
    "  done",
    "end",
    "",
  ].join("\n");
}

// Whole lines the edits inside bodies insert into the long screenplay.
const LONG_LINES = [
  "HERO: A new line of dialogue.",
  "A new line of action.",
  "local trust = 5",
  "& trust = trust + 1",
  "-> ENDING",
  "end",
  "then",
  "if trust > 1 then",
  "Seen {heat} more.",
  "[[show backdrop alley]]",
  "label extra",
  'print("new")',
];

describe("the oracles over long block bodies, served from their memos", () => {
  it("incremental == cold across many cumulative edits on ONE compiler, half inside the long bodies", () => {
    quiet(() => {
      const text = longBodiesScreenplay();
      expect(coldSurface(text).chunks).not.toBeNull();
      const inserts = ["x", "\n", " ", "1", "}", "{", "{trust}", "// c", "->", "end", ")", "", "HERO:", "-> ENDING", "then", " += 1", "[[", "label late"];
      const EDIT_COUNT = 80;
      const { failures, chunked, nested, served } = cumulativeRun(text, 0x656a1, EDIT_COUNT, inserts, LONG_LINES, [], true);
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
      expect(chunked, "compiles that built chunks").toBeGreaterThan(EDIT_COUNT / 3);
      expect(nested, "edits inside bodies").toBeGreaterThan(EDIT_COUNT / 4);
      // Most edits inside a body leave the rest of its statements to their
      // memos.
      expect(served, "statements served from their memos").toBeGreaterThan(EDIT_COUNT * 10);
    });
  }, 600_000);
});
