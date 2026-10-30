import { describe, expect, it } from "vitest";
import { buildBeatsFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { unsupportedConstructMessage } from "../../compiler/utils/unsupportedConstructMessage";
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
  type ProgramChunk,
} from "../../program/ProgramChunk";
import {
  describeRoot,
  errorsOf,
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

function session(
  texts: Record<string, string>,
  configure?: (compiler: SparkdownCompiler) => void,
) {
  const c = programCompiler(texts, {
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
    get text() {
      return text;
    },
    get version() {
      return version;
    },
    get store() {
      return c.compiler.chunkStore!;
    },
    compiler: c.compiler,
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

const cold = (texts: Record<string, string>): SparkProgram =>
  quietly(
    () =>
      programCompiler(texts, { seedBuiltinsIntoStory: true })
        .compile().program,
  );

const newChunks = (before: ProgramRoot, after: ProgramRoot) => {
  const held = new Set(rootChunks(before));
  return rootChunks(after).filter((chunk) => !held.has(chunk));
};

const lostChunks = (before: ProgramRoot, after: ProgramRoot) => {
  const held = new Set(rootChunks(after));
  return rootChunks(before).filter((chunk) => !held.has(chunk));
};

const chunkAtLine = (root: ProgramRoot, line: number): ProgramChunk => {
  const at = root.statementAt(MAIN_URI, line);
  expect(at, `a statement holds line ${line}`).toBeDefined();
  return at!.sequence.arrays.chunks[at!.entry]!;
};

const chunkAt = (root: ProgramRoot, text: string, needle: string) => {
  const line = text.split("\n").findIndex((l) => l.includes(needle));
  expect(line, `"${needle}" is in the script`).toBeGreaterThanOrEqual(0);
  return chunkAtLine(root, line);
};

const subtreeSize = (root: ProgramRoot, chunk: ProgramChunk): number => {
  let size = 1;
  for (let k = 0; k < blockCount(chunk); k += 1) {
    for (const inner of root.body(chunk, k)?.arrays.chunks ?? []) {
      size += subtreeSize(root, inner);
    }
  }
  return size;
};

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
    const targets = [40, 700, 1500]
      .map((at) => lines.findIndex((l, i) => i >= at && /^ {4}\S/.test(l)))
      .map((i) => lines[i]!);
    for (const line of targets) {
      const before = s.root;
      const after = s.edit(line, `${line} Still.`)!;
      expect(s.store.emittedLastBuild).toBe(1);
      expect(newChunks(before, after)).toHaveLength(1);
      expect(lostChunks(before, after)).toHaveLength(1);
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

  it("builds no runtime tree", () => {
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
    const s = session({ [MAIN_URI]: text });
    s.edit("Knocked", "Knocked, again,");
    expect(s.program.chunks).toBeDefined();
    const tables = s.compiler.chunkStore!.current!.tables;
    expect(tables).not.toBeNull();
    expect(tables!.structDefinitions).toBeTypeOf("object");
    expect(tables!.constantNames).toBeInstanceOf(Set);
  });
});

describe("the bookkeeping of a build over an edit", () => {
  const scenes = (count: number) =>
    [
      ...Array.from({ length: count }, () => ""),
      "",
      ...Array.from({ length: count }, (_, i) => [
        `scene S${i}`,
        `  First line of S${i}.`,
        "  if true",
        `    Inside S${i}.`,
        "  end",
        `  Last line of S${i}.`,
        "end",
        "",
      ]).flat(),
      "scene start",
      ...Array.from({ length: count }, (_, i) => `  -> S${i} ->`),
      "end",
      "",
    ].join("\n");
  const beats = (lines: number) => {
    const { files } = buildBeatsFixture({ lines });
    return {
      [MAIN_URI]: files.get("main.sd")!,
      [CHARACTERS]: files.get("scripts/characters.sd")!,
    };
  };
  const middleBeat = (text: string) => {
    const lines = text.split("\n");
    return lines.find((l, i) => i >= lines.length / 2 && /^ {4}\S/.test(l))!;
  };
  type Edit = (text: string) => [string, string];
  const counted = (texts: Record<string, string>, edits: readonly Edit[]) => {
    const s = session(texts);
    return edits.map((edit) => {
      const [find, replace] = edit(s.text);
      const before = s.root;
      const after = s.edit(find, replace)!;
      expect(s.program.chunks).toBeDefined();
      expect(newChunks(before, after).length).toBeLessThanOrEqual(2);
      const { order, assembly } = s.store.passesLastBuild;
      return { order, assembly, statements: after.statementOrder().length };
    });
  };
  const middle = (count: number) => Math.floor(count / 2);
  const sceneEdits = (count: number): Edit[] => [
    () => [`  Last line of S${middle(count)}.`, `  Last line of S${middle(count)}, edited.`],
    () => [`    Inside S${middle(count)}.`, `    Inside S${middle(count)}, edited.`],
    () => [`  First line of S${middle(count)}.`, `  First line of S${middle(count)}.\n`],
  ];
  const beatEdits: Edit[] = [
    (text) => [middleBeat(text), `${middleBeat(text)} Still.`],
  ];

  type Sized = [Record<string, string>, readonly Edit[]];
  const sizes: [string, () => [Sized, Sized]][] = [
    [
      "scenes",
      () => [
        [{ [MAIN_URI]: scenes(30) }, sceneEdits(30)],
        [{ [MAIN_URI]: scenes(120) }, sceneEdits(120)],
      ],
    ],
    [
      "a flat scene of beats",
      () => [
        [beats(600), beatEdits],
        [beats(3000), beatEdits],
      ],
    ],
  ];
  it.each(sizes)(
    "of one statement in a program of %s lists and assembles as many entries at either size",
    (_, programs) => {
      const [[smallTexts, smallEdits], [largeTexts, largeEdits]] = programs();
      const smallCounts = counted(smallTexts!, smallEdits!);
      const largeCounts = counted(largeTexts!, largeEdits!);      smallCounts.forEach((counts, i) => {
        const largeCount = largeCounts[i]!;
        expect(largeCount.statements).toBeGreaterThan(3 * counts.statements);
        expect(counts.statements).toBeGreaterThan(100);
        expect(largeCount.order).toBe(counts.order);
        expect(largeCount.assembly).toBe(counts.assembly);
        expect(largeCount.order).toBeLessThan(10);
        expect(largeCount.assembly).toBeLessThan(20);
      });
    },
  );

  const declared = (count: number) =>
    [
      scenes(count),
      ...Array.from({ length: count }, (_, i) => `store v${i} = ${i}`),
      "store handler = function()",
      "  return 1",
      "end",
      "",
    ].join("\n");
  const declarationEdits: [string, (count: number) => Edit][] = [
    [
      "a line inserted in a scene above the declarations",
      (count) => () => [
        `  First line of S${middle(count)}.`,
        `  First line of S${middle(count)}.\n  Inserted.`,
      ],
    ],
    ["the body of a declaration's function", () => () => ["  return 1", "  return 2"]],
  ];
  it.each(declarationEdits)(
    "of %s lists and assembles as many entries at either size",
    (_, edit) => {
      const [smallCounts] = counted({ [MAIN_URI]: declared(30) }, [edit(30)]);
      const [largeCounts] = counted({ [MAIN_URI]: declared(120) }, [edit(120)]);
      expect(largeCounts!.order).toBe(smallCounts!.order);
      expect(largeCounts!.assembly).toBe(smallCounts!.assembly);
      expect(largeCounts!.order).toBeLessThan(10);
      expect(largeCounts!.assembly).toBeLessThan(10);
    },
  );

  it("builds the same root without the changed blocks, listing every old statement", () => {
    const texts = { [MAIN_URI]: scenes(12) };
    const withChanges = session(texts);
    const without = session(texts);
    const forget = () => {
      (without.compiler as unknown as { _chunkStoreBlocks?: Set<object> })._chunkStoreBlocks =
        undefined;
    };
    for (const edit of [
      ...sceneEdits(12),
      (): [string, string] => ["scene S3\n", "scene S3\n  Inserted.\n"],
      (): [string, string] => ["  Last line of S9.\n", ""],
      (): [string, string] => ["  if true\n    Inside S7.", "  if false\n    Inside S7."],
    ]) {
      const [find, replace] = edit(withChanges.text);
      const kept = withChanges.edit(find, replace)!;
      forget();
      const old = without.root.statementOrder().length;
      const listed = without.edit(find, replace)!;
      expect(withChanges.store.emittedLastBuild).toBe(without.store.emittedLastBuild);
      expect(describeRoot(kept)).toEqual(describeRoot(listed));
      expect(storyBeats(new ProgramStory(kept) as never)).toEqual(
        storyBeats(new ProgramStory(listed) as never),
      );
      expect(without.store.passesLastBuild.order).toBe(old);
      expect(withChanges.store.passesLastBuild.order).toBeLessThan(old / 4);
    }
  });
});

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
  const engineAt = (root: ProgramRoot, script: string) => {
    const story = new ProgramStory(root);
    const choose = story.ChoosePathString.bind(story);
    story.ChoosePathString = (path: string, ...rest: [boolean?, unknown[]?]) => {
      const line = script.split("\n").findIndex((l) => l.trim() === path);
      const address = line < 0 ? undefined : root.addressAt(MAIN_URI, line);
      if (address === undefined) {
        choose(path, ...rest);
      } else {
        story.ChooseAddress(address);
      }
    };
    return story;
  };

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
    expect(s.store.passesLastBuild.identity).toBeLessThanOrEqual(4);
  });

  it("a loop written above renumbers the names of the loops below it, and their statements are read again nowhere", () => {
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
    expect(s.store.emittedLastBuild).toBe(2);
    const rewritten = chunkAt(after, s.text, "local pair");
    expect(rewritten).not.toBe(writer);
    const now = exportedSymbols(rewritten);
    expect(now).toHaveLength(3);
    expect(now.slice(1)).toEqual(symbols);
    expect(chunkAt(after, s.text, "return 1")).toBe(bodies[0]);
    expect(chunkAt(after, s.text, "return 2")).toBe(bodies[1]);
    expect(chunkAt(after, s.text, "Other line.")).toBe(other);
    expect(chunkAt(after, s.text, "Got {pair")).toBe(reader);
    expect(describeRoot(after)).toEqual(describeRoot(cold({ [MAIN_URI]: s.text }).chunks!));
  });

  it("a function written in a scene above leaves the functions of the scenes below it, and their statements are read again nowhere", () => {
    const scene = (name: string, closures: boolean) => [
      `scene ${name}`,
      `  The room ${name} is quiet.`,
      ...(closures
        ? [
            "  local keep = function() return 1 end",
            `  Kept {keep()} in ${name}.`,
            "  local add = function(n) return n + 1 end",
            `  Added {add(2)} in ${name}.`,
          ]
        : []),
      ...Array.from({ length: 12 }, (_, i) => `  Line ${i} of ${name}.`),
      "end",
      "",
    ];
    const below = ["SECOND", "THIRD", "FOURTH", "FIFTH"];
    const text = [...scene("FIRST", false), ...below.flatMap((name) => scene(name, true))].join(
      "\n",
    );
    const s = session({ [MAIN_URI]: text });
    const plain = session({ [MAIN_URI]: text });
    const closures = (root: ProgramRoot, script: string) =>
      below.flatMap((name) => [
        chunkAt(root, script, `Kept {keep()} in ${name}.`),
        chunkAt(root, script, `Added {add(2)} in ${name}.`),
      ]);
    const kept = closures(s.root, text);
    const insert = (n: number) => `  local extra${n} = function() return ${n} end\n`;
    for (const n of [1, 2]) {
      const at = s.text.indexOf("  Line 11 of FIRST.") + "  Line 11 of FIRST.".length + 1;
      const preview = quietly(() =>
        s.compiler.previewCompile({
          textDocument: { uri: MAIN_URI, version: s.version },
          contentChanges: [
            { range: { start: posAt(s.text, at), end: posAt(s.text, at) }, text: insert(n) },
          ],
          root: { uri: MAIN_URI },
        } as never),
      );
      expect(preview.outdated, `preview ${n} compiled`).toBeUndefined();
      expect(preview.program, `preview ${n} compiled`).toBeTruthy();
      const after = s.edit("  Line 11 of FIRST.\n", `  Line 11 of FIRST.\n${insert(n)}`)!;
      plain.edit("  Line 11 of FIRST.\n", `  Line 11 of FIRST.\n${insert(n)}`);
      expect(closures(after, s.text).every((chunk, i) => chunk === kept[i])).toBe(true);
      const passes = s.store.passesLastBuild;
      expect(passes.identity).toBeLessThanOrEqual(5);
      expect(passes.facts).toBeLessThanOrEqual(10);
      expect(passes.identity).toBe(plain.store.passesLastBuild.identity);
      expect(passes.facts).toBe(plain.store.passesLastBuild.facts);
      expect(describeRoot(after)).toEqual(describeRoot(cold({ [MAIN_URI]: s.text }).chunks!));
    }
  });
});

describe("a fact a chunk read", () => {
  it("emits again the chunk that read it when it changes, and nothing else, with no detector added", () => {
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
      s.edit("Plain line.", "Plain line, once.");
      expect(chunkAt(s.root, s.text, "-> TARGET")).toBe(reader);
      mood = "stormy";
      const edited = chunkAt(s.root, s.text, "Plain line, once.");
      const others = rootChunks(s.root).filter((chunk) => chunk !== reader && chunk !== edited);
      const after = s.edit("Plain line, once.", "Plain line, twice.")!;
      expect(s.store.emittedLastBuild).toBe(2);
      expect(chunkAt(after, s.text, "-> TARGET")).not.toBe(reader);
      const kept = new Set(rootChunks(after));
      expect(others.every((chunk) => kept.has(chunk))).toBe(true);
      expect(others.length).toBeGreaterThan(20);
      expect(s.store.passesLastBuild.facts).toBeLessThanOrEqual(6);
    } finally {
      Divert.prototype.EmitJump = emitJump;
    }
  });
});

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
    expect(reported.some((m) => /line 1\b/.test(m))).toBe(true);
    expect(collisionLines(s.program)).toContain(text.split("\n").indexOf("scene MAIN"));
    expect(messages(s.program)).toEqual(messages(cold({ [MAIN_URI]: s.text })));
    expect(s.store.passesLastBuild.identity).toBeLessThanOrEqual(4);
    s.edit(duplicate, "");
    expect(messages(s.program).filter((m) => m.includes("Duplicate identifier"))).toEqual([]);
  });
});

describe("a construct the program cannot compile, written and removed by edits", () => {
  it("is reported at its line, and its removal builds the cold compile's root, however often it goes back and forth", () => {
    const scene = (name: string, next: string) => [
      `scene ${name}`,
      "  label knock",
      `  Knocked {knock} times in ${name}.`,
      "  choose",
      `    * [Once in ${name}]`,
      "      Once.",
      `    + [Again in ${name}]`,
      "      Again.",
      "  then",
      `    The door of ${name} closes.`,
      "    if knock > 1 then",
      "      Twice.",
      "    end",
      "  end",
      `  -> ${next}`,
      "end",
      "",
    ];
    const text = [
      "",
      "",
      ...scene("FIRST", "SECOND"),
      ...scene("SECOND", "THIRD"),
      ...scene("THIRD", "FIRST"),
      "scene start",
      "  -> FIRST",
      "end",
      "",
    ].join("\n");
    const FALL = "\n  Rolled {LIST_RANDOM(knock)}.";
    const s = session({ [MAIN_URI]: text });
    expect(s.program.chunks).toBeDefined();
    const steps: [string, string][] = [
      ["  Knocked {knock} times in SECOND.", `  Knocked {knock} times in SECOND.${FALL}`],
      [FALL, ""],
      ["    The door of THIRD closes.", `    The door of THIRD closes.${FALL}`],
      ["    Once.", "    Once, and only once."],
      [FALL, ""],
      ["  Knocked {knock} times in FIRST.", `  Knocked {knock} times in FIRST.${FALL}`],
    ];
    const outcomes: string[] = [];
    for (const [find, replace] of steps) {
      s.edit(find, replace);
      if (!s.program.chunks) {
        const line = s.text.split("\n").findIndex((l) => l.includes("LIST_RANDOM"));
        expect(errorsOf(s.program)).toContainEqual([line, unsupportedConstructMessage("list")]);
        outcomes.push("error");
      } else {
        expect(describeRoot(s.root)).toEqual(describeRoot(cold({ [MAIN_URI]: s.text }).chunks!));
        outcomes.push("chunks");
      }
    }
    expect(outcomes).toEqual(["error", "chunks", "error", "error", "chunks", "error"]);
  });

  it("builds the root a cold compile builds after a preview whose compile reseeded the table", () => {
    const text = [
      "scene MAIN",
      "  label top",
      "  if true then",
      "    Inside {top}.",
      "  end",
      "  local f = function(n) return n + 1 end",
      "  Got {f(1)}.",
      "end",
      "",
    ].join("\n");
    const s = session({ [MAIN_URI]: text });
    const table = s.store.table;
    const generation = table.generation;
    const grown = table.strings.length * 2 + 600;
    for (let i = 0; i < grown; i += 1) {
      table.strings.push(`unused ${i}`);
    }
    const at = text.indexOf("    Inside {top}.");
    const previewed = text.slice(0, at) + "    Previewed.\n" + text.slice(at);
    const preview = quietly(() =>
      s.compiler.previewCompile({
        textDocument: { uri: MAIN_URI, version: 1 },
        contentChanges: [{ range: { start: posAt(text, at), end: posAt(text, at) }, text: "    Previewed.\n" }],
        root: { uri: MAIN_URI },
      } as never),
    );
    expect(table.generation).toBe(generation + 1);
    expect(preview.program?.chunks == null).toBe(false);
    expect(describeRoot(preview.program!.chunks!)).toEqual(
      describeRoot(cold({ [MAIN_URI]: previewed }).chunks!),
    );
    const after = s.edit("  Got {f(1)}.", "  Got {f(2)}.")!;
    expect(describeRoot(after)).toEqual(describeRoot(cold({ [MAIN_URI]: s.text }).chunks!));
    s.edit("  Got {f(2)}.", "  Got {f(3)}.");
    expect(s.store.emittedLastBuild).toBe(1);
    expect(describeRoot(s.root)).toEqual(describeRoot(cold({ [MAIN_URI]: s.text }).chunks!));
  });

  it("reads a label's count above an assignment below that makes the name a global", () => {
    const text = [
      "scene start",
      "  label knock",
      "  Count {knock}.",
      "  & knock = 5",
      "  done",
      "end",
      "",
    ].join("\n");
    const unused = ["scene UNUSED", "  Rolled {LIST_RANDOM(knock)}.", "end", ""].join("\n");
    const { program } = quietly(() =>
      programCompiler({ [MAIN_URI]: text }, { seedBuiltinsIntoStory: true }).compile(),
    );
    expect(program.chunks).toBeDefined();
    expect(storyBeats(new ProgramStory(program.chunks!)).beats.map((b) => b.text.trim())).toEqual([
      "Count 1.",
    ]);
    const listed = quietly(() =>
      programCompiler({ [MAIN_URI]: `${text}\n${unused}` }, { seedBuiltinsIntoStory: true }).compile(),
    ).program;
    expect(listed.chunks).toBeUndefined();
    expect(errorsOf(listed)).toContainEqual([8, unsupportedConstructMessage("list")]);
  });
});

function messages(program: SparkProgram): string[] {
  return Object.values(program.diagnostics ?? {}).flatMap((list) =>
    list.map(messageText),
  );
}

const exportedSymbols = (chunk: ProgramChunk): number[] =>
  Array.from({ length: exportCount(chunk) }, (_, r) => exportSymbol(chunk, r));

const messageText = (d: { message: unknown }): string =>
  typeof d.message === "string" ? d.message : String((d.message as { value?: string })?.value ?? "");

function collisionLines(program: SparkProgram): number[] {
  return (program.diagnostics?.[MAIN_URI] ?? [])
    .filter((d) => messageText(d).includes("Duplicate identifier"))
    .map((d) => d.range.start.line);
}

function texts(story: ProgramStory): string[];
function texts(beats: ReturnType<typeof storyBeats>): string[];
function texts(from: ProgramStory | ReturnType<typeof storyBeats>): string[] {
  const beats = from instanceof ProgramStory ? storyBeats(from as never, "MAIN") : from;
  return beats.beats.map((b) => b.text.trim());
}
