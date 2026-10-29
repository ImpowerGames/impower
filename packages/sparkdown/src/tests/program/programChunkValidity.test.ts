import { describe, expect, it } from "vitest";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { pairCells, pairInOrder } from "../../program/ChunkStore";
import {
  describeRoot,
  MAIN_URI,
  programCompiler,
  rootChunks,
} from "./programHarness";
import {
  programStatements,
  uniqueKeys,
  untouchedChunks,
} from "./programStatements";

function quiet<T>(fn: () => T): T {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

function posAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines.at(-1)!.length };
}

const diagnosticsOf = (program: SparkProgram): string[] =>
  Object.values(program.diagnostics ?? {})
    .flat()
    .map((d) => {
      const { start, end } = d.range;
      const message = typeof d.message === "string" ? d.message : d.message.value;
      return `${d.severity} ${start.line}:${start.character}-${end.line}:${end.character} ${message}`;
    })
    .sort();

const surface = (
  c: ReturnType<typeof programCompiler>,
  program: SparkProgram,
) => ({
  tree: c.compiler.documents.tree(MAIN_URI)!.toString(),
  chunks: program.chunks ? describeRoot(program.chunks) : null,
  diagnostics: diagnosticsOf(program),
});

function editOnce(before: string, at: number, remove: number, insert: string) {
  return quiet(() => {
    const c = programCompiler({ [MAIN_URI]: before }, { programChunks: true } as never);
    c.compile();
    const store = c.compiler.chunkStore!;
    const statementsBefore = programStatements(c.compiler);
    const keysBefore = uniqueKeys(statementsBefore);
    const chunkBefore = new Map(statementsBefore.map((s) => [s.key, s.chunk]));
    const held = new Set(store.current ? rootChunks(store.current) : []);
    c.compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [
        {
          range: { start: posAt(before, at), end: posAt(before, at + remove) },
          text: insert,
        },
      ],
    });
    const after = before.slice(0, at) + insert + before.slice(at + remove);
    const incremental = c.compile().program;
    const untouched = untouchedChunks(c.compiler, at, at + insert.length, keysBefore);
    const reemitted = untouched.filter((chunk) => !held.has(chunk)).length;
    const own = new Set(untouched);
    const moved = programStatements(c.compiler)
      .filter((s) => own.has(s.chunk) && chunkBefore.get(s.key) !== s.chunk)
      .map((s) => s.syntax);
    const cold = programCompiler({ [MAIN_URI]: after }, { programChunks: true } as never);
    const coldProgram = cold.compile().program;
    return {
      incremental: surface(c, incremental),
      cold: surface(cold, coldProgram),
      reemitted,
      moved,
    };
  });
}

const offsetOf = (text: string, line: number, character: number) =>
  text.split("\n").slice(0, line).reduce((n, l) => n + l.length + 1, 0) +
  character;

describe("a label inserted between choices an `if` gates (#1632)", () => {
  const GATED = [
    "store has_key = true",
    "store gold = 0",
    "",
    "scene S",
    "  choose",
    "    if has_key then",
    "      * Unlock",
    "        The lock gives.",
    "      * Pry",
    "        It cracks.",
    "    end",
    "    * Take a coin",
    "      You take it.",
    "  end",
    "end",
    "",
  ].join("\n");

  it("is refused as a cold compile refuses it, with choices that have bodies", () => {
    const { incremental, cold } = editOnce(
      GATED,
      offsetOf(GATED, 8, 0),
      0,
      "      label dup\n",
    );
    expect(cold.chunks).toBeNull();
    expect(incremental).toEqual(cold);
  });

  it("is refused as a cold compile refuses it, in the fuzz's reduction", () => {
    const before =
      "  choose\n    if has_key then\n      * Unlock door 0\n    Anoth\n    * if gold < 9 [Take a coin] and pocket it";
    const { incremental, cold } = editOnce(
      before,
      offsetOf(before, 3, 1),
      0,
      "\n  label dup\n",
    );
    expect(cold.chunks).toBeNull();
    expect(incremental).toEqual(cold);
  });

  it("is refused as a cold compile refuses it, with bodiless choices", () => {
    const bodiless = GATED.replace("        The lock gives.\n", "").replace(
      "        It cracks.\n",
      "",
    );
    const { incremental, cold } = editOnce(
      bodiless,
      offsetOf(bodiless, 7, 0),
      0,
      "      label dup\n",
    );
    expect(cold.chunks).toBeNull();
    expect(incremental).toEqual(cold);
  });

  const preambles: [string, string, string][] = [
    [
      "a `do` block's body",
      "scene S\n  choose\n    do\n      * A\n        Body.\n      * B\n    end\n  end\nend\n",
      "      * B\n",
    ],
    [
      "a nested `if`",
      "store k = true\nscene S\n  choose\n    if k then\n      if k then\n        * A\n          Body.\n        * B\n      end\n    end\n  end\nend\n",
      "        * B\n",
    ],
    [
      "an `else` branch",
      "store k = true\nscene S\n  choose\n    if k then\n      * A\n        Body.\n    else\n      * B\n        Other.\n      * C\n    end\n  end\nend\n",
      "      * C\n",
    ],
  ];

  it.each(preambles)("is refused as a cold compile refuses it, in %s", (_, before, choice) => {
    const indent = choice.slice(0, choice.indexOf("*"));
    const { incremental, cold } = editOnce(
      before,
      before.indexOf(choice),
      0,
      `${indent}label dup\n`,
    );
    expect(cold.chunks).toBeNull();
    expect(incremental).toEqual(cold);
  });

  it("builds the program a cold compile builds once the label is removed", () => {
    const labelled = GATED.replace("      * Pry", "      label dup\n      * Pry");
    const at = labelled.indexOf("      label dup\n");
    const { incremental, cold } = editOnce(labelled, at, "      label dup\n".length, "");
    expect(cold.chunks).not.toBeNull();
    expect(incremental).toEqual(cold);
  });
});

describe("a choose block whose choice label interpolates a variable outside brackets (#1611)", () => {
  const SEED10 = [
    "store gold = 0",
    "store passes = 0",
    "scene A",
    "  The door 0 is shut, {passes} passes.",
    "  choose",
    "      * {gold}or 1",
    "  end",
    "end",
    "",
  ].join("\n");

  const cases: [string, string, number, string][] = [
    ["an edit inside an earlier line's interpolation (seed 10)", SEED10, SEED10.indexOf("{passes}") + 3, "x"],
    ["a line inserted after an earlier line (seed 2)", SEED10, SEED10.indexOf("{passes}") + "{passes}".length, "\n  Another line."],
    ["the same edit above a choice with no interpolation", SEED10.replace("* {gold}or 1", "* Two"), SEED10.indexOf("{passes}") + 3, "x"],
  ];

  it.each(cases)("keeps its chunk after %s, as a cold compile builds it", (_, before, at, insert) => {
    const { incremental, cold, reemitted } = editOnce(before, at, 0, insert);
    expect(incremental).toEqual(cold);
    expect(reemitted).toBe(0);
  });
});

describe("a call whose arguments continue on the next line (#1614)", () => {
  it("is not kept for a statement that no longer calls its result", () => {
    const before = "    function reset\n  add(2)\n()";
    const { incremental, cold } = editOnce(before, offsetOf(before, 2, 0), 1, "  add(2");
    expect(cold.chunks).not.toBeNull();
    expect(incremental.chunks).toEqual(cold.chunks);
    expect(incremental).toEqual(cold);
  });

  it("is not kept for a statement that now calls its result", () => {
    const before = "function reset()\n  add(2)\n  add(2)\nend\n";
    const at = before.lastIndexOf("  add(2)");
    const { incremental, cold } = editOnce(before, at, "  add(2)".length, "  ()");
    expect(cold.chunks).not.toBeNull();
    expect(incremental.chunks).toEqual(cold.chunks);
    expect(incremental).toEqual(cold);
  });
});

describe("statements that read the same as each other (twins)", () => {
  const FN = "do\n  function inner()\n  end\nend\n";
  const OTHER = "do\n  function other()\n  end\nend\n";
  const SCENE = "do\n\nscene FN_0\nend\n";
  const TAIL = "  Made {make(0)()} total return {total} twice {twic";

  const EDIT = "  & add(2)\n";
  const LONGER = EDIT + "\n".repeat(5);
  const cases: [string, string, string][] = [
    ["the first of two `do` blocks (#1623)", SCENE + FN + TAIL, EDIT],
    ["the first of two `do` blocks, adding lines", SCENE + FN + TAIL, LONGER],
    ["the second of two `do` blocks", FN + SCENE + TAIL, EDIT],
    ["the first of three `do` blocks", SCENE + FN + OTHER + TAIL, EDIT],
    ["the first of three `do` blocks, adding lines", SCENE + FN + OTHER + TAIL, LONGER],
    ["the second of three `do` blocks", FN + SCENE + OTHER + TAIL, EDIT],
    ["the third of three `do` blocks", FN + OTHER + SCENE + TAIL, EDIT],
  ];

  it.each(cases)("keep their own chunks after an edit to %s", (_, before, insert) => {
    const at = before.indexOf("\nscene ");
    const { incremental, cold, reemitted, moved } = editOnce(before, at, "\nscene ".length, insert);
    expect(cold.chunks).not.toBeNull();
    expect(incremental).toEqual(cold);
    expect(moved).toEqual([]);
    expect(reemitted).toBe(0);
  });

  it("keep their own chunks after an edit to the first of 257 `do` blocks", () => {
    const many = Array.from({ length: 256 }, (_, i) => `do\n  function inner${i}()\n  end\nend\n`);
    const before = SCENE + many.join("") + TAIL;
    const at = before.indexOf("\nscene ");
    const { incremental, cold, reemitted, moved } = editOnce(before, at, "\nscene ".length, EDIT);
    expect(cold.chunks).not.toBeNull();
    expect(incremental).toEqual(cold);
    expect(moved).toEqual([]);
    expect(reemitted).toBe(0);
  });

  it("are paired in tables that grow with the fewer of them and their chunks", () => {
    const lines = Array.from({ length: 10000 }, (_, i) => i);
    const limit = pairCells(10000, 1);
    const sizes: number[] = [];
    const Real = globalThis.Int32Array;
    globalThis.Int32Array = class extends Real {
      constructor(length: number) {
        if (length > limit) {
          throw new RangeError(`a pairing table of ${length} entries, over ${limit}`);
        }
        super(length);
        sizes.push(length);
      }
    } as Int32ArrayConstructor;
    try {
      expect(pairInOrder(10000, 1, (s) => Math.abs(lines[s]! - 5000))).toEqual([[5000, 0]]);
      expect(pairInOrder(1, 10000, (_, l) => Math.abs(lines[l]! - 5000))).toEqual([[0, 5000]]);
    } finally {
      globalThis.Int32Array = Real;
    }
    expect(sizes.length).toBe(2);
  });

  it("keep their own chunks when an edit makes them labels of different branches (#1611)", () => {
    const before = [
      "  Chained .. chain|one|two|three {cycle|1|2}  shuffle queue | Lucky. | Plain. end",
      "  branch after",
      "    label mid",
      "scene FLOW_2{cycle|1|2}",
      "  Chained .. chain|one|two|three .. here.",
      "  branch after",
      "    label mid",
    ].join("\n");
    const { incremental, cold, reemitted, moved } = editOnce(before, 2, "Chained .. ch".length, "Chaine ");
    expect(cold.chunks).not.toBeNull();
    expect(incremental).toEqual(cold);
    expect(moved).toEqual([]);
    expect(reemitted).toBe(0);
  });
});

describe("a carried `do` block whose enclosing flow changed (#1627)", () => {
  it("is emitted again when an unclosed function moves it out of its scene", () => {
    const before = [
      "scene FN_0",
      "function helper()",
      "  return 7",
      "end",
      "do",
      "  function inner()",
      "essage}.",
      "end",
      "",
      "do",
      "  function inner()",
    ].join("\n");
    const at = offsetOf(before, 2, 10);
    const { incremental, cold } = editOnce(before, at, offsetOf(before, 3, 1) - at, "end\n");
    expect(cold.chunks).not.toBeNull();
    expect(incremental).toEqual(cold);
  });

  it("is emitted again when a scene header breaks the block above it", () => {
    const before = "do\n  & add(2)\nFN_0\nend\ndo\n  function inner()\n  end\nend\n";
    const { incremental, cold } = editOnce(before, 3, "  & add(2)\n".length, "\nscene ");
    expect(cold.chunks).not.toBeNull();
    expect(incremental).toEqual(cold);
  });

  it("is emitted again when a scene header is inserted above it", () => {
    const before = "do\n  function inner()\n  end\nend\n";
    const { incremental, cold } = editOnce(before, 0, 0, "scene S\n");
    expect(cold.chunks).not.toBeNull();
    expect(incremental).toEqual(cold);
  });

  it("keeps its chunk when its enclosing flow does not change", () => {
    const before = "scene S\n  Hello.\ndo\n  function inner()\n  end\nend\n";
    const { incremental, cold, reemitted, moved } = editOnce(
      before,
      before.indexOf("Hello"),
      "Hello".length,
      "Howdy",
    );
    expect(cold.chunks).not.toBeNull();
    expect(incremental).toEqual(cold);
    expect(moved).toEqual([]);
    expect(reemitted).toBe(0);
  });
});

describe("a `do` block holding `function inner()` inserted above twins (#1933)", () => {
  it("leaves the untouched later `do` block its chunk", () => {
    const before = [
      "  Sorted {sortDescendi",
      "do",
      "  function inner()",
      "    return 2",
      "return   end",
      "end",
      "",
      "do",
      "  local make = function(n) return function() return n * 3 e",
      "end",
    ].join("\n");
    const insert = "\ndo\n  function inner()\n    return 2\n  end\nend\n";
    const { incremental, cold, reemitted, moved } = editOnce(before, 16, 0, insert);
    expect(cold.chunks).not.toBeNull();
    expect(incremental).toEqual(cold);
    expect(moved).toEqual([]);
    expect(reemitted).toBe(0);
  });

  it("leaves its chunk to the function that defines its name", () => {
    const before = [
      "scene FN_1",
      "  Sorted {sortDe",
      "do",
      "  function inner()",
      "    return 2",
      "  end",
      "  Plain li)n * 4 end e({make(2)()} total {total",
      "do",
      "  function inner()",
      "    return 2",
      "  end",
    ].join("\n");
    const at = before.indexOf(" {total");
    const { incremental, cold, reemitted, moved } = editOnce(before, at, " {tota".length, "\n  Plain line.\n");
    expect(cold.chunks).not.toBeNull();
    expect(incremental).toEqual(cold);
    expect(moved).toEqual([]);
    expect(reemitted).toBe(0);
  });
});

describe("a name two definitions share (#1934)", () => {
  const CLASH = "a label named as another";
  const after = (text: string, line: string) => text.indexOf(line) + line.length;
  const expectSameClash = ({ incremental, cold }: ReturnType<typeof editOnce>) => {
    expect(cold.diagnostics.some((d) => d.includes(CLASH))).toBe(true);
    expect(incremental.diagnostics).toEqual(cold.diagnostics);
  };
  const expectSameDuplicate = ({ incremental, cold }: ReturnType<typeof editOnce>) => {
    expect(cold.diagnostics).toHaveLength(1);
    expect(incremental.diagnostics).toEqual(cold.diagnostics);
  };

  it("is reported where a cold compile reports it when a branch is inserted after a label", () => {
    const before = "scene S\n  label extra\n  B\n  Line.\nend\n";
    expectSameClash(editOnce(before, after(before, "  B"), 0, "\n  branch extra\n    Extra.\n  end"));
  });

  it("is reported where a cold compile reports it when a label is inserted after a branch", () => {
    const before = "scene S\n  B\n  branch extra\n    Extra.\n  end\n  Line.\nend\n";
    expectSameDuplicate(editOnce(before, after(before, "  Line."), 0, "\n  label extra"));
  });

  it("is reported where a cold compile reports it when a label is inserted before a label", () => {
    const before = "scene S\n  B\n  label extra\n  Line.\nend\n";
    expectSameDuplicate(editOnce(before, after(before, "  B"), 0, "\n  label extra"));
  });

  it("is reported where a cold compile reports it when a label is inserted after a label", () => {
    const before = "scene S\n  label extra\n  B\n  Line.\nend\n";
    expectSameDuplicate(editOnce(before, after(before, "  Line."), 0, "\n  label extra"));
  });
});
