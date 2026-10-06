// The whole-program passes of a compile with statement chunks on are
// proportional to the edit (#701; docs/engine/binary-program.md, sections 1
// and 2): a statement the incremental parse carried keeps its chunk with
// nothing read again unless a symbol it read a fact about changed or the
// statement watch reports that a value it recorded resolves otherwise, a
// sequence is built again only where it holds an edited statement, and the
// root's tables are written over the previous root's where chunks were added,
// moved or dropped. These tests count what each pass of the chunk store
// visited (`ChunkStore.passesLastBuild`), compare chunks by identity, and run
// the stories the roots hold.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { buildBeatsFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { Container } from "../../inkjs/engine/Container";
import type { Story } from "../../inkjs/engine/Story";
import { Divert } from "../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { ChunkStore, type FlowSource } from "../../program/ChunkStore";
import type { ProgramEmitter } from "../../program/ProgramEmitter";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import {
  B_SEQUENCE,
  blockCount,
  blockField,
  exportCount,
  exportSymbol,
  type StatementChunk,
} from "../../program/StatementChunk";
import {
  describeRoot,
  MAIN_URI,
  programCompiler,
  rootChunks,
  storyBeats,
} from "./programHarness";

const CHARACTERS = "inmemory:///scripts/characters.sd";

function posAt(text: string, offset: number) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

const quietly = <T>(run: () => T): T => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

/** A compiler over `texts` with statement chunks on, and an editor of its
 *  main script that compiles after each edit. */
function session(
  texts: Record<string, string>,
  configure?: (compiler: SparkdownCompiler) => void,
) {
  const c = programCompiler(texts, {
    programChunks: true,
    seedBuiltinsIntoStory: true,
  });
  configure?.(c.compiler);
  let text = texts[MAIN_URI]!;
  let version = 1;
  let compiled = quietly(() => c.compile());
  let program = compiled.program;
  return {
    get root() {
      return program.chunks!;
    },
    get program() {
      return program;
    },
    get story() {
      return compiled.story;
    },
    get text() {
      return text;
    },
    get store() {
      return c.compiler.chunkStore!;
    },
    compiler: c.compiler,
    /** Replaces the first `find` with `replace` as one minimal edit. */
    edit(find: string, replace: string): ProgramRoot | undefined {
      const offset = text.indexOf(find);
      expect(offset, `"${find}" is in the script`).toBeGreaterThanOrEqual(0);
      version += 1;
      c.compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version },
        contentChanges: [
          {
            range: {
              start: posAt(text, offset),
              end: posAt(text, offset + find.length),
            },
            text: replace,
          },
        ],
      });
      text = text.slice(0, offset) + replace + text.slice(offset + find.length);
      compiled = quietly(() => c.compile());
      program = compiled.program;
      return program.chunks;
    },
  };
}

/** A cold compile of `texts` with statement chunks on. */
const cold = (texts: Record<string, string>): SparkProgram =>
  quietly(
    () =>
      programCompiler(texts, { programChunks: true, seedBuiltinsIntoStory: true })
        .compile().program,
  );

/** The chunks of `after` that `before` does not hold. */
const newChunks = (before: ProgramRoot, after: ProgramRoot) => {
  const held = new Set(rootChunks(before));
  return rootChunks(after).filter((chunk) => !held.has(chunk));
};

/** The chunks of `before` that `after` does not hold. */
const lostChunks = (before: ProgramRoot, after: ProgramRoot) => {
  const held = new Set(rootChunks(after));
  return rootChunks(before).filter((chunk) => !held.has(chunk));
};

/** The innermost statement chunk that line `line` (counting from 0) of the
 *  main script falls in. */
const chunkAtLine = (root: ProgramRoot, line: number): StatementChunk => {
  const at = root.statementAt(MAIN_URI, line);
  expect(at, `a statement holds line ${line}`).toBeDefined();
  return at!.sequence.arrays.chunks[at!.entry]!;
};

/** The innermost statement chunk of the first line of `text` that holds
 *  `needle`. */
const chunkAt = (root: ProgramRoot, text: string, needle: string) => {
  const line = text.split("\n").findIndex((l) => l.includes(needle));
  expect(line, `"${needle}" is in the script`).toBeGreaterThanOrEqual(0);
  return chunkAtLine(root, line);
};

/** How many statements a chunk's subtree holds: the chunk and the
 *  statements of its bodies, at any depth. */
const subtreeSize = (root: ProgramRoot, chunk: StatementChunk): number => {
  let size = 1;
  for (let k = 0; k < blockCount(chunk); k += 1) {
    for (const inner of root.body(chunk, k)?.arrays.chunks ?? []) {
      size += subtreeSize(root, inner);
    }
  }
  return size;
};

// The beats fixture's scene, 2,000 lines of display beats, ending in a
// `choose` block whose `then` clause holds the scene's last lines.
const flatScene = () => {
  const { files } = buildBeatsFixture({ lines: 2000 });
  const main = files.get("main.sd")!;
  const end = main.lastIndexOf("\nend\n");
  const clause = Array.from(
    { length: 40 },
    (_, i) => `    The clause runs on, line ${i}.`,
  );
  return {
    [MAIN_URI]:
      main.slice(0, end) +
      [
        "",
        "  choose",
        "    + [Go on]",
        "      You go on.",
        "    + [Stay]",
        "      You stay.",
        "  then",
        ...clause,
        "  end",
      ].join("\n") +
      main.slice(end),
    [CHARACTERS]: files.get("scripts/characters.sd")!,
  };
};

describe("an edit inside one beat", () => {
  it("of a flat 2,000-line scene emits one chunk and runs no pass over another", () => {
    const s = session(flatScene());
    const lines = s.text.split("\n");
    expect(s.root.flowNamed("MAIN")!.arrays.chunks.length).toBeGreaterThan(500);
    // Lines of dialogue and action well inside the flat part of the scene.
    const targets = [40, 700, 1500]
      .map((at) => lines.findIndex((l, i) => i >= at && /^ {4}\S/.test(l)))
      .map((i) => lines[i]!);
    for (const line of targets) {
      const before = s.root;
      const after = s.edit(line, `${line} Still.`)!;
      expect(s.store.emittedLastBuild).toBe(1);
      expect(newChunks(before, after)).toHaveLength(1);
      expect(lostChunks(before, after)).toHaveLength(1);
      // Every pass visited the edited statement and its new chunk alone.
      const passes = s.store.passesLastBuild;
      expect(passes.emitted).toBe(1);
      expect(passes.identity).toBeLessThanOrEqual(2);
      expect(passes.facts).toBeLessThanOrEqual(6);
      expect(passes.anonymous).toBeLessThanOrEqual(2);
      expect(passes.placement).toBe(1);
      expect(passes.definitions).toBeLessThanOrEqual(2);
      expect(passes.chunkTable).toBeLessThanOrEqual(2);
    }
  });

  it("of the `then` clause at its bottom emits one chunk and runs no pass outside the block", () => {
    const s = session(flatScene());
    const before = s.root;
    const choose = chunkAt(before, s.text, "  choose");
    const block = subtreeSize(before, choose);
    const total = rootChunks(before).length;
    expect(total).toBeGreaterThan(10 * block);
    const after = s.edit("The clause runs on, line 27.", "The clause runs on, line 27, slowly.")!;
    expect(s.store.emittedLastBuild).toBe(1);
    expect(newChunks(before, after)).toHaveLength(1);
    expect(lostChunks(before, after)).toHaveLength(1);
    // The `choose` statement keeps its chunk, and the statements of its
    // bodies, which the incremental parse lowered again with it (#656),
    // keep theirs: the passes read them, and nothing outside the block.
    expect(chunkAt(after, s.text, "  choose")).toBe(choose);
    const passes = s.store.passesLastBuild;
    expect(passes.emitted).toBe(1);
    expect(passes.identity).toBeLessThanOrEqual(block);
    expect(passes.facts).toBeLessThanOrEqual(2 * block + 4);
    expect(passes.anonymous).toBeLessThanOrEqual(block);
    expect(passes.placement).toBe(1);
    expect(passes.definitions).toBeLessThanOrEqual(2);
    expect(passes.chunkTable).toBeLessThanOrEqual(2);
  });

  it("leaves the runtime tree unflattened and its containers uncounted", () => {
    // A read count of a label and a once-only choice: the current engine's
    // resolution sets their containers' count flags, and flattening inlines
    // every unnamed container. A program that runs from its chunks needs
    // neither, so neither pass runs for it unless it falls back.
    const text = [
      "scene MAIN",
      "  label knock",
      "  Knocked {knock} times.",
      "  choose",
      "    * [Once]",
      "      Once.",
      "  end",
      "end",
      "",
    ].join("\n");
    const containers = (story: Story) => {
      let unnamed = 0;
      let knock: Container | undefined;
      const walk = (c: Container) => {
        if (!c.hasValidName) {
          unnamed += 1;
        }
        if (c.name === "knock") {
          knock = c;
        }
        for (const child of [...c.content, ...(c.namedOnlyContent?.values() ?? [])]) {
          if (child instanceof Container) {
            walk(child);
          }
        }
      };
      walk(story.mainContentContainer);
      return { unnamed, knock };
    };
    const s = session({ [MAIN_URI]: text });
    s.edit("Knocked", "Knocked, again,");
    expect(s.program.fallback).toBeUndefined();
    const chunked = containers(s.story);
    const current = containers(
      quietly(() => programCompiler({ [MAIN_URI]: text.replace("Knocked", "Knocked, again,") }).compile())
        .story,
    );
    expect(current.knock?.visitsShouldBeCounted).toBe(true);
    expect(chunked.knock?.visitsShouldBeCounted).toBe(false);
    expect(chunked.unnamed).toBeGreaterThan(current.unnamed);
  });
});

// The worked example of the design of record (section "A statement inserted
// in the middle of a long `then` clause"), at the size of a test: one line
// inserted above an `if` inside a `then` clause, and one below it.
describe("a position inside an unchanged block below an edit", () => {
  const text = [
    "scene MAIN",
    "  Start.",
    "  choose",
    "    + [Go]",
    "      Went.",
    "  then",
    "    Before the block.",
    "    if true then",
    "      Inside, first.",
    "      Inside, second.",
    "      Inside, third.",
    "    end",
    "    After the block.",
    "    Last of the clause.",
    "  end",
    "  The scene runs on.",
    "end",
    "",
  ].join("\n");
  const ABOVE = ["    Before the block.", "    Before the block.\n    Inserted above."];
  const BELOW = ["    After the block.", "    Inserted below.\n    After the block."];
  const edited = text.replace(ABOVE[0]!, ABOVE[1]!).replace(BELOW[0]!, BELOW[1]!);
  const beatTexts = (beats: ReturnType<typeof storyBeats>) => beats.beats.map((b) => b.text.trim());
  // An engine on `root` that places a path at the line of `script` that
  // holds `line`, as a game's path locations place a line of the editor
  // (`Game.setStartFrom`), which enters the blocks that hold it.
  const engineAt = (root: ProgramRoot, script: string) =>
    new ProgramStory(root, {
      locate: (path) => {
        const line = script.split("\n").findIndex((l) => l.trim() === path);
        return line < 0 ? undefined : { uri: MAIN_URI, line, column: 0 };
      },
    });

  it("is reached through the new root, whose `if` chunk, block rows and their chunks are the old ones", () => {
    const s = session({ [MAIN_URI]: text });
    const before = s.root;
    const owner = chunkAt(before, text, "    if true then");
    const rows = Array.from({ length: blockCount(owner) }, (_, k) => before.body(owner, k)!);
    const inside = rows.flatMap((row) => [...row.arrays.chunks]);
    expect(inside.length).toBe(3);
    s.edit(ABOVE[0]!, ABOVE[1]!);
    const after = s.edit(BELOW[0]!, BELOW[1]!)!;
    expect(s.text).toBe(edited);
    expect(chunkAt(after, s.text, "    if true then") === owner).toBe(true);
    rows.forEach((row, k) => {
      const now = after.sequence(blockField(owner, k, B_SEQUENCE));
      expect(now === row, `block ${k}'s row`).toBe(true);
      expect(after.body(owner, k) === row).toBe(true);
    });
    expect(
      rows
        .flatMap((row) => [...after.sequence(row.id)!.arrays.chunks])
        .every((chunk, i) => chunk === inside[i]),
    ).toBe(true);
    // The body's lines are the edited script's, derived from where its
    // owner now stands.
    expect(after.firstLineOf(rows[0]!)).toBe(edited.split("\n").indexOf("      Inside, first."));
    expect(describeRoot(after)).toEqual(describeRoot(cold({ [MAIN_URI]: edited }).chunks!));
  });

  it("runs on into the clause as edited after a jump into the block", () => {
    const s = session({ [MAIN_URI]: text });
    s.edit(ABOVE[0]!, ABOVE[1]!);
    s.edit(BELOW[0]!, BELOW[1]!);
    const ran = beatTexts(storyBeats(engineAt(s.root, edited) as never, "Inside, second."));
    const coldRan = beatTexts(
      storyBeats(engineAt(cold({ [MAIN_URI]: edited }).chunks!, edited) as never, "Inside, second."),
    );
    expect(ran).toEqual(coldRan);
    expect(ran).toEqual([
      "Inside, second.",
      "Inside, third.",
      "Inserted below.",
      "After the block.",
      "Last of the clause.",
      "The scene runs on.",
    ]);
  });

  it("runs on into the clause as edited from an image restored inside it", () => {
    const s = session({ [MAIN_URI]: text });
    const old = engineAt(s.root, text);
    old.ChoosePathString("Inside, second.");
    // One line inside the block, then the image, taken on the old root.
    expect(old.Continue()).toContain("Inside, second.");
    const image = old.state.toJson();
    s.edit(ABOVE[0]!, ABOVE[1]!);
    s.edit(BELOW[0]!, BELOW[1]!);
    const resumed = new ProgramStory(s.root);
    resumed.state.LoadJson(image);
    const ran = beatTexts(storyBeats(resumed as never));
    const coldStory = engineAt(cold({ [MAIN_URI]: edited }).chunks!, edited);
    coldStory.ChoosePathString("Inside, second.");
    coldStory.Continue();
    expect(ran).toEqual(beatTexts(storyBeats(coldStory as never)));
    expect(ran).toEqual([
      "Inside, third.",
      "Inserted below.",
      "After the block.",
      "Last of the clause.",
      "The scene runs on.",
    ]);
  });
});

// The hazards #306 catalogued, at statement granularity.
describe("a hazard of reuse", () => {
  it("a callee's signature changing emits its callers again and nothing else", () => {
    const text = [
      "store n = 1",
      "scene MAIN",
      "  & n = bump(n)",
      "  Plain line one.",
      "  if n > 0 then",
      "    & n = bump(n)",
      "    Plain line two.",
      "  end",
      "  local held = bump",
      "  Plain line three.",
      "end",
      "",
      "function bump(x)",
      "  return x + 1",
      "end",
      "",
    ].join("\n");
    const s = session({ [MAIN_URI]: text });
    const before = s.root;
    const held = chunkAt(before, text, "local held = bump");
    const plain = ["Plain line one.", "Plain line two.", "Plain line three."].map((l) =>
      chunkAt(before, text, l),
    );
    const after = s.edit("function bump(x)", "function bump(x, ...)")!;
    // The definition and the two calls; the function held as a value reads
    // only what the program defines the name as.
    expect(s.store.emittedLastBuild).toBe(3);
    expect(newChunks(before, after)).toHaveLength(3);
    expect(chunkAt(after, s.text, "local held = bump")).toBe(held);
    plain.forEach((chunk, i) => expect(chunkAt(after, s.text, ["Plain line one.", "Plain line two.", "Plain line three."][i]!)).toBe(chunk));
    expect(describeRoot(after)).toEqual(describeRoot(cold({ [MAIN_URI]: s.text }).chunks!));
  });

  it("a function declared at the top level keeps its body's id when its header is edited", () => {
    const text = [
      "scene MAIN",
      "  Got {bump(1)}.",
      "end",
      "",
      "function bump(x)",
      "  local y = x + 1",
      "  return y",
      "end",
      "",
    ].join("\n");
    const s = session({ [MAIN_URI]: text });
    const before = s.root;
    const definition = before.flowNamed("bump")!.arrays.chunks[0]!;
    const body = blockField(definition, 0, B_SEQUENCE);
    const statements = [...before.sequence(body)!.arrays.chunks];
    const after = s.edit("function bump(x)", "function bump(x, z)")!;
    const edited = after.flowNamed("bump")!.arrays.chunks[0]!;
    expect(edited).not.toBe(definition);
    expect(blockField(edited, 0, B_SEQUENCE)).toBe(body);
    expect(s.store.handedOnLastBuild).toEqual([
      { sequenceId: body, part: "function", how: "aligned" },
    ]);
    // The body's statements read the parameters they did, and keep their
    // chunks; the call reads the parameters, and is emitted again.
    expect([...after.sequence(body)!.arrays.chunks]).toEqual(statements);
    expect(describeRoot(after)).toEqual(describeRoot(cold({ [MAIN_URI]: s.text }).chunks!));
  });

  it("a reference whose target moved emits nothing again", () => {
    const text = [
      "scene MAIN",
      "  if true then",
      "    -> TARGET",
      "  end",
      "end",
      "",
      "scene TARGET",
      "  Arrived.",
      "end",
      "",
    ].join("\n");
    const s = session({ [MAIN_URI]: text });
    const before = s.root;
    const jump = chunkAt(before, text, "-> TARGET");
    const after = s.edit("scene TARGET\n  Arrived.", "scene TARGET\n  First.\n  Arrived.")!;
    expect(s.store.emittedLastBuild).toBe(1);
    expect(chunkAt(after, s.text, "-> TARGET")).toBe(jump);
    expect(texts(new ProgramStory(after))).toEqual(["First.", "Arrived."]);
  });

  it("a reference whose target disappeared emits nothing again and reports the diagnostic", () => {
    const text = [
      "scene MAIN",
      "  if true then",
      "    -> TARGET",
      "  end",
      "  Stay.",
      "end",
      "",
      "scene TARGET",
      "  Arrived.",
      "end",
      "",
    ].join("\n");
    const s = session({ [MAIN_URI]: text });
    const before = s.root;
    const jump = chunkAt(before, text, "-> TARGET");
    expect(messages(s.program).filter((m) => /target not found/.test(m))).toEqual([]);
    const after = s.edit("scene TARGET\n  Arrived.\nend\n", "")!;
    expect(s.store.emittedLastBuild).toBe(0);
    expect(chunkAt(after, s.text, "-> TARGET")).toBe(jump);
    expect(messages(s.program).some((m) => /target not found/.test(m) && m.includes("TARGET"))).toBe(true);
    expect(messages(s.program)).toEqual(messages(cold({ [MAIN_URI]: s.text })));
  });

  it("a diagnostic raised for a statement is reported again from its kept chunk", () => {
    const text = [
      "scene MAIN",
      "  if true then",
      "    Reads {missing_name}.",
      "  end",
      "  Another line.",
      "end",
      "",
    ].join("\n");
    const s = session({ [MAIN_URI]: text });
    const before = s.root;
    const reader = chunkAt(before, text, "Reads {missing_name}.");
    const warned = messages(s.program).filter((m) => m.includes("missing_name"));
    expect(warned.length).toBeGreaterThan(0);
    s.edit("Another line.", "Another line, edited.");
    expect(s.store.emittedLastBuild).toBe(1);
    expect(chunkAt(s.root, s.text, "Reads {missing_name}.")).toBe(reader);
    expect(messages(s.program).filter((m) => m.includes("missing_name"))).toEqual(warned);
  });

  it("a constant's value changing runs the declarations again, and its readers read the new value", () => {
    // A constant is a global the declaration sequence initializes, and a
    // statement that reads it reads the global (`GetVar`), so its code does
    // not hold the value and its chunk is kept.
    const text = ["const LIMIT = 3", "scene MAIN", "  if true then", "    Limit {LIMIT}.", "  end", "end", ""].join("\n");
    const s = session({ [MAIN_URI]: text });
    const before = s.root;
    const reader = chunkAt(before, text, "Limit {LIMIT}.");
    const runs = s.store.initializerRuns;
    const after = s.edit("const LIMIT = 3", "const LIMIT = 4")!;
    expect(s.store.emittedLastBuild).toBe(1);
    expect(s.store.initializerRuns).toBe(runs + 1);
    expect(chunkAt(after, s.text, "Limit {LIMIT}.")).toBe(reader);
    expect(texts(new ProgramStory(after))).toEqual(["Limit 4."]);
  });

  for (const declaration of ["store missing_name = 2", "const missing_name = 2"]) {
    it(`a name entering and leaving (\`${declaration}\`) emits its readers again and nothing else`, () => {
      const text = [
        "scene MAIN",
        "  if true then",
        "    Reads {missing_name}.",
        "  end",
        "  Other line.",
        "end",
        "",
      ].join("\n");
      const s = session({ [MAIN_URI]: text });
      const before = s.root;
      const other = chunkAt(before, text, "Other line.");
      const entered = s.edit("scene MAIN", `${declaration}\nscene MAIN`)!;
      // The declaration's chunk and the reader's.
      expect(s.store.emittedLastBuild).toBe(2);
      expect(newChunks(before, entered)).toHaveLength(2);
      expect(chunkAt(entered, s.text, "Other line.")).toBe(other);
      expect(texts(new ProgramStory(entered))).toEqual(["Reads 2.", "Other line."]);
      expect(describeRoot(entered)).toEqual(describeRoot(cold({ [MAIN_URI]: s.text }).chunks!));
      const left = s.edit(`${declaration}\n`, "")!;
      expect(s.store.emittedLastBuild).toBe(1);
      expect(chunkAt(left, s.text, "Other line.")).toBe(other);
      expect(describeRoot(left)).toEqual(describeRoot(cold({ [MAIN_URI]: s.text }).chunks!));
    });
  }

  it("a name another statement starts to declare changes how a carried statement reads it", () => {
    // `knock` reads the label's count until a `local knock` is written in
    // the scene, after which it reads the local. The reading statement's
    // block is carried: only the statement watch, which reads the resolver's
    // answer again, finds that its chunk no longer holds.
    const text = [
      "scene MAIN",
      "  label knock",
      "  if true then",
      "    Count {knock}.",
      "  end",
      ...Array.from({ length: 40 }, (_, i) => `  A line of the scene, ${i}.`),
      "  Last line.",
      "end",
      "",
    ].join("\n");
    const s = session({ [MAIN_URI]: text });
    const before = s.root;
    const reader = chunkAt(before, text, "Count {knock}.");
    expect(describeRoot(before).some((l) => l.includes("GetCount"))).toBe(true);
    const after = s.edit("  Last line.", "  Last line.\n  local knock = 5")!;
    expect(chunkAt(after, s.text, "Count {knock}.")).not.toBe(reader);
    expect(describeRoot(after).some((l) => l.includes("GetCount"))).toBe(false);
    expect(describeRoot(after)).toEqual(describeRoot(cold({ [MAIN_URI]: s.text }).chunks!));
    // Most of the scene's statements were carried, and read nothing again.
    expect(s.store.passesLastBuild.identity).toBeLessThanOrEqual(4);
  });

  it("a loop written above renumbers the names of the loops below it, and their statements are read again nowhere", () => {
    // The compiler names a loop's own labels by document order, so a loop
    // written in an earlier scene renames those of every loop after it. No
    // chunk names them: the writer emits a loop's jumps inside its chunk.
    const scene = (name: string, loops: boolean) => [
      `scene ${name}`,
      `  The room ${name} is quiet.`,
      ...(loops
        ? [
            "  store_count = 0",
            "  while store_count < 3 do",
            `    Pass {store_count} of ${name}.`,
            "    store_count = store_count + 1",
            "    if store_count > 9 then",
            "      break",
            "    end",
            "  end",
            "  for i = 1, 2 do",
            `    Step {i} of ${name}.`,
            "  end",
          ]
        : []),
      ...Array.from({ length: 12 }, (_, i) => `  Line ${i} of ${name}.`),
      "end",
      "",
    ];
    const text = [
      ...scene("FIRST", false),
      ...scene("SECOND", true),
      ...scene("THIRD", true),
    ].join("\n");
    const s = session({ [MAIN_URI]: text });
    const loops = ["SECOND", "THIRD"].flatMap((name) => [
      chunkAt(s.root, text, `Pass {store_count} of ${name}.`),
      chunkAt(s.root, text, `Step {i} of ${name}.`),
    ]);
    const owners = (root: ProgramRoot, script: string) =>
      ["SECOND", "THIRD"].map((name) => {
        const lines = script.split("\n");
        const at = lines.indexOf(`scene ${name}`);
        const line = lines.findIndex((l, i) => i > at && l === "  while store_count < 3 do");
        return chunkAtLine(root, line);
      });
    const loopOwners = owners(s.root, text);
    const LOOP = "  for j = 1, 2 do\n    Inner {j}.\n  end\n";
    // A preview of the loop, then the loop itself.
    const at = text.indexOf("  Line 11 of FIRST.") + "  Line 11 of FIRST.".length + 1;
    quietly(() =>
      s.compiler.previewCompile({
        textDocument: { uri: MAIN_URI, version: 1 },
        contentChanges: [
          { range: { start: posAt(text, at), end: posAt(text, at) }, text: LOOP },
        ],
        root: { uri: MAIN_URI },
      } as never),
    );
    const after = s.edit("  Line 11 of FIRST.\nend", `  Line 11 of FIRST.\n${LOOP}end`)!;
    expect(owners(after, s.text).every((chunk, i) => chunk === loopOwners[i])).toBe(true);
    expect(
      ["SECOND", "THIRD"]
        .flatMap((name) => [
          chunkAt(after, s.text, `Pass {store_count} of ${name}.`),
          chunkAt(after, s.text, `Step {i} of ${name}.`),
        ])
        .every((chunk, i) => chunk === loops[i]),
    ).toBe(true);
    // The new loop and the statements of its body, and nothing of the
    // scenes below it.
    const passes = s.store.passesLastBuild;
    expect(passes.identity).toBeLessThanOrEqual(3);
    expect(passes.facts).toBeLessThanOrEqual(6);
    expect(describeRoot(after)).toEqual(describeRoot(cold({ [MAIN_URI]: s.text }).chunks!));
  });

  it("a function written inside a statement above another keeps the other's symbol", () => {
    const text = [
      "scene MAIN",
      "  if true then",
      "    local pair = {",
      "      function()",
      "        return 1",
      "      end,",
      "      function()",
      "        return 2",
      "      end,",
      "    }",
      "    Got {pair[1]()} {pair[2]()}.",
      "  end",
      "  Other line.",
      "end",
      "",
    ].join("\n");
    const s = session({ [MAIN_URI]: text });
    const before = s.root;
    const writer = chunkAt(before, text, "local pair");
    const symbols = exportedSymbols(writer);
    expect(symbols).toHaveLength(2);
    const bodies = [chunkAt(before, text, "return 1"), chunkAt(before, text, "return 2")];
    const other = chunkAt(before, text, "Other line.");
    const reader = chunkAt(before, text, "Got {pair");
    const after = s.edit(
      "    local pair = {\n",
      "    local pair = {\n      function()\n        return 0\n      end,\n",
    )!;
    // The statement and the body of the function written above the others.
    expect(s.store.emittedLastBuild).toBe(2);
    const rewritten = chunkAt(after, s.text, "local pair");
    expect(rewritten).not.toBe(writer);
    // The functions below it keep their symbols, and their bodies' chunks.
    const now = exportedSymbols(rewritten);
    expect(now).toHaveLength(3);
    expect(now.slice(1)).toEqual(symbols);
    expect(chunkAt(after, s.text, "return 1")).toBe(bodies[0]);
    expect(chunkAt(after, s.text, "return 2")).toBe(bodies[1]);
    expect(chunkAt(after, s.text, "Other line.")).toBe(other);
    expect(chunkAt(after, s.text, "Got {pair")).toBe(reader);
    expect(describeRoot(after)).toEqual(describeRoot(cold({ [MAIN_URI]: s.text }).chunks!));
  });
});

// The facts a chunk's reference table records are what its emission read
// from the symbol table (`ProgramEmitter.fact`), recorded by the reader: no
// list of a chunk's dependencies is kept anywhere.
describe("a fact a chunk read", () => {
  it("emits again the chunk that read it when it changes, and nothing else, with no detector added", () => {
    // A fact a definition holds that no emit path reads today: the store's
    // definition of a scene gains it here, and one emit path, a jump to the
    // scene named `TARGET`, reads it, as an emit path that comes to depend
    // on a new fact would.
    let mood = "calm";
    class MoodStore extends ChunkStore {
      protected override definitionFacts(flow: FlowSource) {
        const facts = super.definitionFacts(flow);
        return flow.name === "TARGET" ? { ...facts, mood } : facts;
      }
    }
    const emitJump = Divert.prototype.EmitJump;
    Divert.prototype.EmitJump = function (this: Divert, emitter: ProgramEmitter, flags?: number) {
      if (this.writtenTargetName === "TARGET") {
        const symbol = emitter.targetSymbol(this.targetContent, this.writtenTargetName);
        emitter.fact(symbol, "mood");
      }
      emitJump.call(this, emitter, flags);
    };
    try {
      const text = [
        "scene MAIN",
        "  if true then",
        "    -> TARGET",
        "  end",
        "  -> ELSEWHERE",
        ...Array.from({ length: 20 }, (_, i) => `  & total = add(total, ${i})`),
        "end",
        "",
        "store total = 0",
        "function add(a, b)",
        "  return a + b",
        "end",
        "",
        "scene TARGET",
        "  Arrived.",
        "end",
        "",
        "scene ELSEWHERE",
        "  Elsewhere.",
        "end",
        "",
        "scene LAST",
        "  Plain line.",
        "end",
        "",
      ].join("\n");
      const s = session({ [MAIN_URI]: text }, (compiler) => {
        const table = (compiler as unknown as { _binaryTable: ChunkStore["table"] })._binaryTable;
        (compiler as unknown as { _chunkStore: ChunkStore })._chunkStore = new MoodStore(table);
      });
      expect(s.store).toBeInstanceOf(MoodStore);
      const before = s.root;
      const reader = chunkAt(before, text, "-> TARGET");
      // The same program, compiled again after an edit that changes nothing
      // the reader reads: the fact reads the same, and the reader is kept.
      s.edit("Plain line.", "Plain line, once.");
      expect(chunkAt(s.root, s.text, "-> TARGET")).toBe(reader);
      // The fact changes between compiles, with an edit elsewhere.
      mood = "stormy";
      const edited = chunkAt(s.root, s.text, "Plain line, once.");
      const others = rootChunks(s.root).filter((chunk) => chunk !== reader && chunk !== edited);
      const after = s.edit("Plain line, once.", "Plain line, twice.")!;
      expect(s.store.emittedLastBuild).toBe(2);
      expect(chunkAt(after, s.text, "-> TARGET")).not.toBe(reader);
      const kept = new Set(rootChunks(after));
      expect(others.every((chunk) => kept.has(chunk))).toBe(true);
      // Only the reader read it: the facts of the reader, and of the edited
      // statement, were read again, and not those of the twenty calls that
      // read a fact about another function.
      expect(others.length).toBeGreaterThan(20);
      expect(s.store.passesLastBuild.facts).toBeLessThanOrEqual(6);
    } finally {
      Divert.prototype.EmitJump = emitJump;
    }
  });
});

// A naming collision is found through the index of the program's
// declarations by name, and is reported with both declarations' places.
describe("a naming collision", () => {
  it("is reported with the place of the declaration it collides with, and cleared when the declaration goes", () => {
    const text = [
      "define raffles as character with",
      '  name = "Raffles"',
      "end",
      "",
      "scene MAIN",
      "  if true then",
      "    Plain line one.",
      "  end",
      "  Plain line two.",
      "end",
      "",
    ].join("\n");
    const duplicate = 'define raffles as character with\n  name = "Again"\nend\n\n';
    const s = session({ [MAIN_URI]: text });
    expect(messages(s.program).filter((m) => m.includes("Duplicate identifier"))).toEqual([]);
    s.edit("scene MAIN", `${duplicate}scene MAIN`);
    const reported = messages(s.program).filter((m) => m.includes("Duplicate identifier `raffles`"));
    expect(reported.length).toBeGreaterThan(0);
    // The message names where the first declaration stands, and the
    // diagnostic stands on the second.
    expect(reported.some((m) => /line 1\b/.test(m))).toBe(true);
    expect(collisionLines(s.program)).toContain(text.split("\n").indexOf("scene MAIN"));
    expect(messages(s.program)).toEqual(messages(cold({ [MAIN_URI]: s.text })));
    // The program's other chunks kept theirs: only the new declaration
    // statement was read.
    expect(s.store.passesLastBuild.identity).toBeLessThanOrEqual(4);
    s.edit(duplicate, "");
    expect(messages(s.program).filter((m) => m.includes("Duplicate identifier"))).toEqual([]);
  });
});

/** The messages of a program's diagnostics, by script, in order. */
function messages(program: SparkProgram): string[] {
  return Object.values(program.diagnostics ?? {}).flatMap((list) =>
    list.map(messageText),
  );
}

/** The symbols a chunk exports, in its export table's order. */
const exportedSymbols = (chunk: StatementChunk): number[] =>
  Array.from({ length: exportCount(chunk) }, (_, r) => exportSymbol(chunk, r));

/** A diagnostic's message as text. */
const messageText = (d: { message: unknown }): string =>
  typeof d.message === "string" ? d.message : String((d.message as { value?: string })?.value ?? "");

/** The lines of the main script a duplicate identifier is reported on. */
function collisionLines(program: SparkProgram): number[] {
  return (program.diagnostics?.[MAIN_URI] ?? [])
    .filter((d) => messageText(d).includes("Duplicate identifier"))
    .map((d) => d.range.start.line);
}

/** The text of each beat a story's program engine shows from its start. */
function texts(story: ProgramStory): string[];
function texts(beats: ReturnType<typeof storyBeats>): string[];
function texts(from: ProgramStory | ReturnType<typeof storyBeats>): string[] {
  const beats = from instanceof ProgramStory ? storyBeats(from as never, "MAIN") : from;
  return beats.beats.map((b) => b.text.trim());
}
