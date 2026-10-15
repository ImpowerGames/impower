// What a statement's chunk depends on is part of what the chunk store
// compares before it keeps the chunk for the statement (#1893, unit U2): a
// statement kept by its syntax, its lowering reads and its values must read
// the same as a cold compile of the edited text in everything its code was
// written from. Each case compiles a script, applies one edit, compiles
// again and compares the tree, the program's chunks by content and the
// diagnostics with a cold compile of the edited text; the cases where the
// chunks were equal but an untouched statement's chunk was emitted again
// also count those (#1611).
import { describe, expect, it } from "vitest";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
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

/** Every diagnostic as `<severity> <range> <message>`, sorted. */
const diagnosticsOf = (program: SparkProgram): string[] =>
  Object.values(program.diagnostics ?? {})
    .flat()
    .map((d) => {
      const { start, end } = d.range;
      const message = typeof d.message === "string" ? d.message : d.message.value;
      return `${d.severity} ${start.line}:${start.character}-${end.line}:${end.character} ${message}`;
    })
    .sort();

/** What a compile is compared by: its tree, its chunks by content (none
 *  when it built none) and its diagnostics. */
const surface = (
  c: ReturnType<typeof programCompiler>,
  program: SparkProgram,
) => ({
  tree: c.compiler.documents.tree(MAIN_URI)!.toString(),
  chunks: program.chunks ? describeRoot(program.chunks) : null,
  diagnostics: diagnosticsOf(program),
});

/** Compiles `before`, replaces `remove` characters at `at` with `insert`,
 *  compiles again, and compiles the edited text cold. */
function editOnce(before: string, at: number, remove: number, insert: string) {
  return quiet(() => {
    const c = programCompiler({ [MAIN_URI]: before }, { programChunks: true } as never);
    c.compile();
    const store = c.compiler.chunkStore!;
    const keysBefore = uniqueKeys(programStatements(c.compiler));
    // A compile that refuses a construct leaves no root.
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
    const cold = programCompiler({ [MAIN_URI]: after }, { programChunks: true } as never);
    const coldProgram = cold.compile().program;
    // The chunks of the statements away from the edit that the compile
    // emitted again.
    const reemitted = untouchedChunks(
      c.compiler,
      at,
      at + insert.length,
      keysBefore,
    ).filter((chunk) => !held.has(chunk)).length;
    return {
      incremental: surface(c, incremental),
      cold: surface(cold, coldProgram),
      reemitted,
    };
  });
}

/** The offset of an LSP position in `text`. */
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

  // The other bodies whose choices the block's preamble raises as its own.
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
    // `add(2)` followed by a line holding `()` is read as `add(2)()`; the
    // edit makes that line a statement of its own, `& add(2)`, so the
    // statement above it calls `add` once and no longer calls its result.
    const before = "    function reset\n  & add(2)\n()";
    const { incremental, cold } = editOnce(before, offsetOf(before, 2, 0), 1, "  & add(2");
    expect(cold.chunks).not.toBeNull();
    expect(incremental.chunks).toEqual(cold.chunks);
    expect(incremental).toEqual(cold);
  });

  it("is not kept for a statement that now calls its result", () => {
    // The reverse: the line after the last `& add(2)` becomes `()`, which the
    // statement above now reads as calling the result of `add(2)`.
    const before = "function reset()\n  & add(2)\n  & add(2)\nend\n";
    const at = before.lastIndexOf("  & add(2)");
    const { incremental, cold } = editOnce(before, at, "  & add(2)".length, "  ()");
    expect(cold.chunks).not.toBeNull();
    expect(incremental.chunks).toEqual(cold.chunks);
    expect(incremental).toEqual(cold);
  });
});
