// An incremental compile after an edit below a block in the same scene (#668).
//
// An incremental compile has to be the program a cold compile of the edited
// text produces: the bytecode carries the edited line, and every path location
// names the line a cold compile gives it. The edit sits above or below a
// `choose … then … end` or an `if … else … end`, the two blocks a scene's
// closing lines usually follow, or a `choose` block nested in an `if` or in
// another block's preamble, or inside those nested blocks. It also sits above,
// below or inside a loop written in the scene: `while`, numeric `for`,
// `repeat`, `do`, a loop nested in a loop, and a loop whose body displays.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { programContent, programListing } from "../programListing";

const URI = "inmemory:///main.sd";

const BLOCKS: Record<string, string[]> = {
  "no block": [],
  "an if block": [
    "  if key then",
    "    The door is unlocked.",
    "  else",
    "    The door is locked.",
    "  end",
  ],
  "a choose block": [
    "  choose",
    "  + [Press on]",
    "    You press on.",
    "  + [Hold back]",
    "    You hold back.",
    "  then",
    "    The way opens.",
    "  end",
  ],
  "a choose block inside an if block": [
    "  if key then",
    "    choose",
    "      * [Unlock it]",
    "        The lock gives.",
    "      * [Leave it]",
    "        You step back.",
    "    end",
    "    The key is warm.",
    "  end",
  ],
  "a choose block in another block's preamble": [
    "  choose",
    "    if key then",
    "      choose",
    "        * [Inner choice]",
    "      end",
    "    end",
    "    * [Outer choice]",
    "      You choose the outer way.",
    "  end",
  ],
};

// Loops written in the scene's body. Each is its own top-level chunk, and its
// gathers are named from its document offset, so an edit above it renames
// them. `inside` is an edit to a line of the loop's body.
const LOOPS: Record<string, { lines: string[]; inside: [string, string] }> = {
  "a while loop": {
    lines: ["  while trust < 2 do", "    trust = trust + 1", "  end"],
    inside: ["trust = trust + 1", "trust = trust + 2"],
  },
  "a numeric for loop": {
    lines: ["  for i = 1, 3 do", "    trust = trust + i", "  end"],
    inside: ["trust = trust + i", "trust = trust + i * 2"],
  },
  "a repeat loop": {
    lines: ["  repeat", "    trust = trust + 1", "  until trust >= 3"],
    inside: ["trust = trust + 1", "trust = trust + 2"],
  },
  "a do block": {
    lines: ["  do", "    trust = trust + 5", "  end"],
    inside: ["trust = trust + 5", "trust = trust + 6"],
  },
  "a loop nested in a loop": {
    lines: [
      "  while trust < 2 do",
      "    trust = trust + 1",
      "    for i = 1, 3 do",
      "      key = not key",
      "    end",
      "  end",
    ],
    inside: ["key = not key", "key = true"],
  },
  "a loop whose body holds a display line": {
    lines: [
      "  while trust < 3 do",
      "    trust = trust + 1",
      "    Step {trust}.",
      "  end",
    ],
    inside: ["Step {trust}.", "Step {trust}, again."],
  },
};

for (const [name, loop] of Object.entries(LOOPS)) BLOCKS[name] = loop.lines;

function screenplay(block: string[]): string {
  const L: string[] = [];
  L.push("store trust = 0");
  L.push("store key = false");
  L.push("");
  L.push("-> act_one");
  L.push("");
  L.push("scene act_one");
  for (let i = 0; i < 4; i++) L.push(`  Beat ${i} before.`);
  L.push(...block);
  for (let i = 0; i < 4; i++) L.push(`  Beat ${i} after.`);
  L.push("end");
  return L.join("\n");
}

// The program's chunks by content, which hold its line tables, in place of
// the current engine's compiled JSON and path-location table.
const pick = (p: any) => ({
  chunks: p.chunks ? programContent(p.chunks) : undefined,
  dataLocations: p.dataLocations,
  functionLocations: p.functionLocations,
  sceneLocations: p.sceneLocations,
  diagnostics: p.diagnostics,
});

function stable(value: unknown): string {
  const walk = (v: any): any => {
    if (v && typeof v === "object") {
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

function quiet<T>(fn: () => T): T {
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

function compilerFor(text: string, version = 1) {
  const c = new SparkdownCompiler();
  c.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text, version, languageId: "sparkdown" },
    ],
  } as never);
  return c;
}

const compileOf = (c: SparkdownCompiler) =>
  quiet(() => c.compile({ textDocument: { uri: URI } })).program;

/** The message of every error-severity diagnostic, in every file. */
const errorsOf = (p: any): string[] =>
  Object.values(p.diagnostics ?? {}).flatMap((list) =>
    (list as any[])
      .filter((d) => d.severity === 1)
      .map((d) => (typeof d.message === "string" ? d.message : d.message?.value)),
  );

const posAt =(text: string, offset: number) => {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
};

/** A minimal-range change turning the first `find` in `text` into `replace`. */
function change(text: string, find: string, replace: string) {
  const offset = text.indexOf(find);
  expect(offset, `"${find}" is in the text`).toBeGreaterThanOrEqual(0);
  return {
    contentChanges: [
      {
        range: { start: posAt(text, offset), end: posAt(text, offset + find.length) },
        text: replace,
      },
    ],
    after: text.slice(0, offset) + replace + text.slice(offset + find.length),
  };
}

describe("an incremental compile of an edit in a scene", () => {
  for (const [blockName, block] of Object.entries(BLOCKS)) {
    for (const side of ["before", "after"]) {
      it(`is the cold compile of the edited text (${side} ${blockName})`, () => {
        const base = screenplay(block);
        const c = compilerFor(base);
        compileOf(c);
        const { contentChanges, after } = change(
          base,
          `Beat 1 ${side}.`,
          `Beat 1 ${side}, changed.`,
        );

        c.updateDocument({
          textDocument: { uri: URI, version: 2 },
          contentChanges,
        } as never);
        const incremental = compileOf(c);

        expect(c.documents.get(URI)!.getText()).toBe(after);
        expect(programListing(incremental.chunks)).toContain(
          `Str ${JSON.stringify(`Beat 1 ${side}, changed.`)}`,
        );
        expect(stable(pick(incremental))).toBe(
          stable(pick(compileOf(compilerFor(after)))),
        );
      });
    }
  }

  for (const [loopName, loop] of Object.entries(LOOPS)) {
    it(`is the cold compile of the edited text (inside ${loopName})`, () => {
      const base = screenplay(loop.lines);
      const c = compilerFor(base);
      // The loop compiles, so the comparison is between two working programs.
      expect(errorsOf(compileOf(c))).toEqual([]);
      const { contentChanges, after } = change(base, ...loop.inside);

      c.updateDocument({
        textDocument: { uri: URI, version: 2 },
        contentChanges,
      } as never);

      expect(stable(pick(compileOf(c)))).toBe(
        stable(pick(compileOf(compilerFor(after)))),
      );
    });

    // The edit sits in another scene above, so the loop's scene is carried
    // unchanged into the incremental compile while its offset moves.
    it(`is the cold compile when lines added to a scene above move ${loopName}`, () => {
      let text = screenplay(loop.lines).replace(
        "scene act_one",
        "scene prologue\n  Opening beat.\nend\n\nscene act_one",
      );
      const c = compilerFor(text);
      compileOf(c);
      const edits = [
        ["Opening beat.", "Opening beat.\n  Second opening beat.\n  Third opening beat."],
        ["Second opening beat.", "Second opening beat, changed."],
        loop.inside,
      ] as const;
      let version = 1;
      for (const [find, replace] of edits) {
        const { contentChanges, after } = change(text, find, replace);
        text = after;
        version += 1;

        c.updateDocument({
          textDocument: { uri: URI, version },
          contentChanges,
        } as never);

        expect(stable(pick(compileOf(c))), `after "${replace}"`).toBe(
          stable(pick(compileOf(compilerFor(text)))),
        );
      }
    });

    it(`is the cold compile after lines added above ${loopName}, then an edit inside it`, () => {
      let text = screenplay(loop.lines);
      const c = compilerFor(text);
      compileOf(c);
      const edits = [
        ["Beat 1 before.", "Beat 1 before.\n  An added beat.\n  Another added beat."],
        loop.inside,
        ["Beat 1 after.", "Beat 1 after, changed."],
      ] as const;
      let version = 1;
      for (const [find, replace] of edits) {
        const { contentChanges, after } = change(text, find, replace);
        text = after;
        version += 1;

        c.updateDocument({
          textDocument: { uri: URI, version },
          contentChanges,
        } as never);

        expect(stable(pick(compileOf(c))), `after "${replace}"`).toBe(
          stable(pick(compileOf(compilerFor(text)))),
        );
      }
    });
  }

  it("is the cold compile when lines added above move a scene with a choose block", () => {
    const base = screenplay(BLOCKS["a choose block"]!).replace(
      "scene act_one",
      "scene prologue\n  Opening beat.\nend\n\nscene act_one",
    );
    const c = compilerFor(base);
    compileOf(c);
    const { contentChanges, after } = change(
      base,
      "Opening beat.",
      "Opening beat.\n  Second opening beat.\n  Third opening beat.",
    );

    c.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges,
    } as never);

    expect(stable(pick(compileOf(c)))).toBe(
      stable(pick(compileOf(compilerFor(after)))),
    );
  });

  it("is the cold compile when a moved scene with a choose block is reused and then regenerated", () => {
    // The edit gives `earlier` an anonymous function, which renames the one in
    // `main`: `main` is reused as it stood, restamped at its new lines, and
    // then regenerated from those stamps.
    const choose = BLOCKS["a choose block"]!;
    const base = [
      "-> earlier",
      "scene earlier",
      ...choose,
      "& local g = 1",
      "end",
      "",
      "scene main",
      "  Before text.",
      ...choose,
      "& local f = function(x) return x + 1 end",
      "  After text.",
      "  Final text.",
      "end",
      "",
      "scene later",
      "  Later text.",
      "end",
    ].join("\n");
    const c = compilerFor(base);
    compileOf(c);
    const { contentChanges, after } = change(
      base,
      "local g = 1",
      "local g = function(x) return x + 2 end\n  Added text.",
    );

    c.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges,
    } as never);

    expect(stable(pick(compileOf(c)))).toBe(
      stable(pick(compileOf(compilerFor(after)))),
    );

    const next = change(after, "Final text.", "Final text, changed.");
    c.updateDocument({
      textDocument: { uri: URI, version: 3 },
      contentChanges: next.contentChanges,
    } as never);

    expect(stable(pick(compileOf(c))), "the next edit below the choose").toBe(
      stable(pick(compileOf(compilerFor(next.after)))),
    );
  });

  it("is the cold compile after each of several edits in and around nested choose blocks", () => {
    let text = screenplay([
      ...BLOCKS["a choose block inside an if block"]!,
      "  Beat between.",
      ...BLOCKS["a choose block in another block's preamble"]!,
    ]);
    const c = compilerFor(text);
    compileOf(c);
    const edits = [
      ["The lock gives.", "The lock gives, slowly."],
      ["The key is warm.", "The key is warm.\n    It hums."],
      ["Beat between.", "Beat between, changed."],
      ["[Inner choice]", "[Inner choice, renamed]"],
      ["You choose the outer way.", "You take the outer way."],
      ["Beat 1 after.", "Beat 1 after, changed."],
    ] as const;
    let version = 1;
    for (const [find, replace] of edits) {
      const { contentChanges, after } = change(text, find, replace);
      text = after;
      version += 1;

      c.updateDocument({
        textDocument: { uri: URI, version },
        contentChanges,
      } as never);

      expect(stable(pick(compileOf(c))), `after "${replace}"`).toBe(
        stable(pick(compileOf(compilerFor(text)))),
      );
    }
  });

  it("is the cold compile after each of several edits below a choose block", () => {
    let text = screenplay([
      ...BLOCKS["a choose block"]!,
      "  Beat between.",
      ...BLOCKS["an if block"]!,
    ]);
    const c = compilerFor(text);
    compileOf(c);
    const edits = [
      ["Beat 1 after.", "Beat 1 after, changed."],
      ["Beat between.", "Beat between, changed."],
      ["Beat 1 after, changed.", "Beat 1 after, changed twice.\n  And a new beat."],
      ["The door is locked.", "The door stays locked."],
    ] as const;
    let version = 1;
    for (const [find, replace] of edits) {
      const { contentChanges, after } = change(text, find, replace);
      text = after;
      version += 1;

      c.updateDocument({
        textDocument: { uri: URI, version },
        contentChanges,
      } as never);

      expect(stable(pick(compileOf(c))), `after "${replace}"`).toBe(
        stable(pick(compileOf(compilerFor(text)))),
      );
    }
  });
});
