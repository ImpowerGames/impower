import v8 from "node:v8";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { buildChunksFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import type { CompiledBlock } from "../../compiler/classes/annotators/CompilationAnnotator";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { StatementShape } from "../../compiler/lower/utils/statementShape";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import type { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { NUMBERED_SYNTHETIC_NAME } from "../../program/ProgramSymbols";
import { loweredOutsideRebuilt } from "./memoLowering";

const CHARACTERS = "inmemory:///scripts/characters.sd";

const probe = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("../../compiler/lower/lower", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../compiler/lower/lower")>();
  return {
    ...actual,
    lower: (nodeRef: unknown, ctx: Record<string, unknown>) => {
      ctx["probe"] = probe.value;
      return actual.lower(nodeRef as never, ctx as never);
    },
  };
});

vi.mock("../../compiler/lower/lowerers/lowerAssetLine", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../compiler/lower/lowerers/lowerAssetLine")>();
  const { Text } = await import("../../inkjs/compiler/Parser/ParsedHierarchy/Text");
  return {
    ...actual,
    lowerImageLine: (nodeRef: unknown, ctx: Record<string, unknown>) => {
      const block = actual.lowerImageLine(nodeRef as never, ctx as never);
      const value = ctx["probe"];
      const weave = block.content?.[0];
      if (typeof value === "string" && weave) {
        weave.AddContent(new Text(value));
      }
      return block;
    },
  };
});

vi.resetModules();

const { parsedChildren, ProgramResolver } = await import("../../program/ProgramResolver");
const { describeRoot, MAIN_URI, programCompiler, rootChunks } = await import("./programHarness");
const { programStatements } = await import("./programStatements");

function posAt(text: string, offset: number) {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
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

function session(texts: Record<string, string>) {
  const c = programCompiler(texts);
  let text = texts[MAIN_URI]!;
  let version = 1;
  let program = quietly(() => c.compile().program);
  return {
    compiler: c.compiler as SparkdownCompiler,
    get program(): SparkProgram {
      return program;
    },
    get text() {
      return text;
    },
    get root(): ProgramRoot {
      return program.chunks!;
    },
    get stats() {
      return c.compiler.memoStats(MAIN_URI)!;
    },
    edit(find: string, replace: string, from = 0): SparkProgram {
      return this.editAll([[find, replace]], from);
    },
    editAll(changes: readonly [find: string, replace: string][], from = 0): SparkProgram {
      const contentChanges = [];
      for (const [find, replace] of changes) {
        const offset = text.indexOf(find, from);
        expect(offset, `"${find}" is in the script`).toBeGreaterThanOrEqual(0);
        contentChanges.push({
          range: { start: posAt(text, offset), end: posAt(text, offset + find.length) },
          text: replace,
        });
        text = text.slice(0, offset) + replace + text.slice(offset + find.length);
      }
      version += 1;
      c.compiler.updateDocument({ textDocument: { uri: MAIN_URI, version }, contentChanges });
      program = quietly(() => c.compile().program);
      return program;
    },
    preview(find: string, replace: string): void {
      const offset = text.indexOf(find);
      expect(offset, `"${find}" is in the script`).toBeGreaterThanOrEqual(0);
      quietly(() =>
        c.compiler.previewCompile({
          root: { uri: MAIN_URI },
          textDocument: { uri: MAIN_URI, version },
          contentChanges: [
            {
              range: { start: posAt(text, offset), end: posAt(text, offset + find.length) },
              text: replace,
            },
          ],
        } as never),
      );
    },
  };
}

const cold = (texts: Record<string, string>): SparkProgram =>
  quietly(() => programCompiler(texts).compile().program);

const diagnostics = (program: SparkProgram): string[] =>
  Object.keys(program.diagnostics ?? {})
    .sort()
    .flatMap((uri) =>
      (program.diagnostics![uri] ?? []).map((d: any) => {
        const message = typeof d.message === "string" ? d.message : d.message?.value;
        const r = d.range;
        return `${uri} ${r.start.line}:${r.start.character}-${r.end.line}:${r.end.character} ${d.severity} ${message}`;
      }),
    );

const fixture = (scenes = 2) => {
  const { files } = buildChunksFixture({ scenes, linesPerScene: 30, thenLines: 300 });
  return {
    [MAIN_URI]: files.get("main.sd")!,
    [CHARACTERS]: files.get("scripts/characters.sd")!,
  };
};

const clauseLine = (text: string, back: number): { line: string; from: number } => {
  const lines = text.split("\n");
  const end = lines.lastIndexOf("  end");
  for (let at = end - back; at > 0; at -= 1) {
    const line = lines[at]!;
    if (/^ {6}\S/.test(line) && !/[{&\[]/.test(line)) {
      return { line, from: lines.slice(0, at).join("\n").length };
    }
  }
  throw new Error("No beat in the clause");
};

const warmSession = (scenes = 2) => {
  const s = session(fixture(scenes));
  const { line, from } = clauseLine(s.text, 200);
  s.edit(line, `${line} At first.`, from);
  return s;
};

describe("an edit to one line inside a long `then` clause", () => {
  it("lowers only the statements the parse rebuilt, and keeps every other statement's chunk", () => {
    const s = warmSession();
    const before = new Set(rootChunks(s.root));
    const { line, from } = clauseLine(s.text, 120);
    s.edit(line, `${line} Still.`, from);
    expect(loweredOutside(s)).toEqual([]);
    expect(s.stats.lowered).toBeGreaterThan(0);
    expect(s.stats.served).toBeGreaterThan(80);
    const after = rootChunks(s.root);
    const changed = after.filter((chunk) => !before.has(chunk));
    expect(changed.length).toBe(1);
    expect(describeRoot(s.root)).toEqual(
      describeRoot(cold({ ...fixture(), [MAIN_URI]: s.text }).chunks!),
    );
    expect(diagnostics(s.program)).toEqual(
      diagnostics(cold({ ...fixture(), [MAIN_URI]: s.text })),
    );
  });
});

const compiledBlocks = (s: ReturnType<typeof session>, node: string): CompiledBlock[] => {
  const out: CompiledBlock[] = [];
  const iter = (s.compiler as any).documents.annotations(MAIN_URI).compilations.iter();
  while (iter.value) {
    if (iter.value.type.node === node) {
      out.push(iter.value.type);
    }
    iter.next();
  }
  return out;
};

const parsedObjectsOf = (block: CompiledBlock): WeakRef<ParsedObject>[] => {
  const seen = new Set<ParsedObject>();
  const visit = (obj: ParsedObject) => {
    if (seen.has(obj)) {
      return;
    }
    seen.add(obj);
    parsedChildren(obj).forEach(visit);
  };
  (block.content ?? []).forEach(visit);
  (block.hoistedKnots ?? []).forEach(visit);
  const visitShape = (shape: StatementShape) => {
    shape.objects.forEach(visit);
    for (const body of shape.bodies) {
      body.statements.forEach(visitShape);
    }
  };
  if (block.statement) {
    visitShape(block.statement);
  }
  return [...seen].map((obj) => new WeakRef(obj));
};

const collect = async () => {
  v8.setFlagsFromString("--expose-gc");
  const gc = vm.runInNewContext("gc") as () => void;
  await new Promise((resolve) => setTimeout(resolve, 0));
  gc();
  await new Promise((resolve) => setTimeout(resolve, 0));
  gc();
};

const storyObjects = (story: ParsedObject): ParsedObject[] => {
  const seen = new Set<ParsedObject>();
  const visit = (obj: ParsedObject) => {
    if (seen.has(obj)) {
      return;
    }
    seen.add(obj);
    parsedChildren(obj).forEach(visit);
    const proxy = (obj as { proxyDivert?: ParsedObject }).proxyDivert;
    if (proxy) {
      visit(proxy);
    }
  };
  visit(story);
  return [...seen];
};

const watchingStories = async <T>(
  seen: (story: ParsedObject) => void,
  run: () => Promise<T>,
): Promise<T> => {
  const resolve = ProgramResolver.prototype.resolve;
  ProgramResolver.prototype.resolve = function (this: InstanceType<typeof ProgramResolver>, ...args) {
    seen(args[0] as unknown as ParsedObject);
    return resolve.apply(this, args);
  };
  try {
    return await run();
  } finally {
    ProgramResolver.prototype.resolve = resolve;
  }
};

describe("no parsed object", () => {
  for (const scenes of [1, 2]) {
    it(`of a block's lowering outlives the compile that lowers the block again, with ${scenes} scene(s)`, async () => {
      const s = warmSession(scenes);
      const first = clauseLine(s.text, 160);
      s.edit(first.line, `${first.line} Once.`, first.from);
      const { refs, block } = (() => {
        const [held] = compiledBlocks(s, "LuauSparkdownChooseBlock");
        expect(held?.memoized?.length ?? 0, "statements served from their memos").toBeGreaterThan(50);
        return { refs: parsedObjectsOf(held!), block: new WeakRef(held!) };
      })();
      expect(refs.length).toBeGreaterThan(100);
      const { line, from } = clauseLine(s.text, 80);
      s.edit(line, `${line} Again.`, from);
      expect(compiledBlocks(s, "LuauSparkdownChooseBlock")[0] === block.deref()).toBe(false);
      await collect();
      const alive = refs.map((ref) => ref.deref()).filter((obj) => obj !== undefined);
      expect(alive.map((obj) => obj!.typeName)).toEqual([]);
    });
  }

  it("of an earlier compile is reachable after a compile, but the objects this compile's story holds", async () => {
    const stories: WeakRef<ParsedObject>[] = [];
    const refs: WeakRef<ParsedObject>[] = [];
    const s = await watchingStories(
      (story) => {
        stories.push(new WeakRef(story));
        refs.push(...storyObjects(story).map((obj) => new WeakRef(obj)));
      },
      async () => {
        const s = warmSession(2);
        const first = clauseLine(s.text, 160);
        s.edit(first.line, `${first.line} Once.`, first.from);
        const { line, from } = clauseLine(s.text, 80);
        s.edit(line, `${line} Again.`, from);
        return s;
      },
    );
    expect(stories.length).toBe(4);
    expect(refs.length).toBeGreaterThan(1000);
    const held = new WeakSet(storyObjects(stories.at(-1)!.deref()!));
    await collect();
    const alive = refs
      .map((ref) => ref.deref())
      .filter((obj): obj is ParsedObject => obj !== undefined && !held.has(obj));
    expect(alive.map((obj) => obj.typeName)).toEqual([]);
    expect(s.stats.served).toBeGreaterThan(50);
  });
});

const clauseScript = (clause: readonly string[], top: readonly string[] = []) =>
  [
    ...top,
    "scene MAIN",
    "  Opening line.",
    "  choose",
    "    + [Go on]",
    "      You go on.",
    "    + [Stay]",
    "      You stay.",
    "  then",
    "    Warm line.",
    ...clause.map((line) => (line ? `    ${line}` : "")),
    "  end",
    "end",
    "",
  ].join("\n");

const warmed = (text: string) => {
  const s = session({ [MAIN_URI]: text });
  s.edit("Warm line.", "Warm line!");
  return s;
};

const loweredBeyondRebuilt = (s: ReturnType<typeof session>) => {
  const lineOf = (offset: number) => s.text.slice(0, offset).split("\n").length - 1;
  const rebuilt = s.stats.rebuilt;
  const lines = new Set<number>();
  for (const at of s.stats.loweredAt) {
    if (!rebuilt || at > rebuilt.to || at < rebuilt.from) {
      lines.add(lineOf(at));
    }
  }
  return [...lines].sort((a, b) => a - b).map((line) => s.text.split("\n")[line]!.trim());
};

const loweredOutside = (s: ReturnType<typeof session>) => loweredOutsideRebuilt(s.stats, s.text);

const sameAsCold = (s: ReturnType<typeof session>, texts: Record<string, string> = {}) => {
  const coldProgram = cold({ ...texts, [MAIN_URI]: s.text });
  expect(describeRoot(s.root)).toEqual(describeRoot(coldProgram.chunks!));
  expect(diagnostics(s.program)).toEqual(diagnostics(coldProgram));
};

const FILLER = Array.from({ length: 12 }, (_, i) => `A quiet line, number ${i}.`);

describe("an edit that changes what a later statement of the block lowers to", () => {
  it("of a local declared earlier lowers again the statement that reads it, and no other", () => {
    const s = warmed(
      clauseScript(["Line one.", ...FILLER, "Hello {x}.", ...FILLER], ["store x = 1", ""]),
    );
    const before = new Set(rootChunks(s.root));
    s.edit("    Line one.\n", "    Line one.\n    local x = 2\n");
    expect(loweredBeyondRebuilt(s)).toEqual(["Hello {x}."]);
    expect(rootChunks(s.root).filter((chunk) => !before.has(chunk)).length).toBeLessThanOrEqual(2);
    sameAsCold(s);
  });

  it("of a label added lowers again the statement that reads it, and no other", () => {
    const s = warmed(clauseScript(["Seen {after} times.", ...FILLER, "Line last.", ...FILLER]));
    s.edit("    Line last.\n", "    label after\n    Line last.\n");
    expect(loweredBeyondRebuilt(s)).toEqual(["Seen {after} times."]);
    sameAsCold(s);
  });

  it("of a nested function hoisted lowers again the statement that calls it, and no other", () => {
    const calls = FILLER.map((_, i) => `  print("quiet ${i}")`);
    const s = session({
      [MAIN_URI]: [
        "function host()",
        ...calls,
        "  print(\"warm\")",
        ...calls,
        "  local a = 1",
        ...calls,
        "  inner()",
        ...calls,
        "end",
        "",
        clauseScript(["& host()"]),
      ].join("\n"),
    });
    s.edit('print("warm")', 'print("warm!")');
    s.edit("  local a = 1\n", "  local a = 1\n  function inner() return 2 end\n");
    expect(loweredBeyondRebuilt(s)).toEqual(["inner()"]);
    sameAsCold(s);
  });

  const ABOVE = ["scene FIRST", ...FILLER.map((line) => `  ${line}`), "end", ""];

  it("of a name entering the global callable names lowers again the statement that read it, and no other", () => {
    const s = warmed(
      clauseScript([...FILLER, "& local cb = function() return later() end", ...FILLER], ABOVE),
    );
    s.edit("scene FIRST\n", "function later()\n  return 7\nend\n\nscene FIRST\n");
    expect(loweredBeyondRebuilt(s)).toEqual(["& local cb = function() return later() end"]);
    sameAsCold(s);
  });

  it("of a name entering the define type names lowers again the statement that read it, and no other", () => {
    const s = warmed(clauseScript([...FILLER, "store thing = 1", ...FILLER], ABOVE));
    s.edit(
      "scene FIRST\n",
      "define thing with\n  x = 1\nend\n\ndefine sidekick as thing with\n  x = 2\nend\n\nscene FIRST\n",
    );
    expect(loweredBeyondRebuilt(s)).toEqual(["store thing = 1"]);
    sameAsCold(s);
  });
});

describe("a field added to the lowering context", () => {
  it("lowers again the statement whose lowering read it when its value changes, with no detector added, and no other", () => {
    try {
      probe.value = "one";
      const text = clauseScript([...FILLER, "[[show backdrop alley]]", ...FILLER, "Line last."]);
      const s = warmed(text);
      const before = new Set(rootChunks(s.root));
      probe.value = "two";
      s.edit("Line last.", "Line last, at last.");
      expect(loweredBeyondRebuilt(s)).toEqual(["[[show backdrop alley]]"]);
      expect(rootChunks(s.root).filter((chunk) => !before.has(chunk)).length).toBe(2);
      sameAsCold(s);
      probe.value = "one";
      expect(describeRoot(s.root)).not.toEqual(
        describeRoot(cold({ [MAIN_URI]: s.text }).chunks!),
      );
    } finally {
      probe.value = undefined;
    }
  });
});

describe("a diagnostic a statement served from its memo raised", () => {
  it("at its resolution is reported again at its current line, and goes when it is lowered again without it", () => {
    const s = warmed(clauseScript([...FILLER, "Hello {missing}.", ...FILLER]));
    const line = () => s.text.split("\n").findIndex((l) => l.includes("Hello {"));
    expect(diagnostics(s.program).some((d) => d.includes(` ${line()}:`))).toBe(true);
    s.edit("    Warm line!\n", "    Warm line!\n    One more.\n    Two more.\n");
    expect(loweredBeyondRebuilt(s)).toEqual([]);
    expect(diagnostics(s.program).some((d) => d.includes(` ${line()}:`))).toBe(true);
    sameAsCold(s);
    s.edit("Hello {missing}.", "Hello there.");
    expect(diagnostics(s.program).some((d) => d.includes(` ${line()}:`))).toBe(false);
    sameAsCold(s);
  });

  it("at its lowering is reported again at its current line, and goes when it is lowered again without it", () => {
    const s = warmed(clauseScript([...FILLER, "Call {{1}} now.", ...FILLER]));
    const line = () => s.text.split("\n").findIndex((l) => l.includes("Call {"));
    expect(diagnostics(s.program).some((d) => d.includes(` ${line()}:`))).toBe(true);
    s.edit("    Warm line!\n", "    Warm line!\n    One more.\n    Two more.\n");
    expect(loweredBeyondRebuilt(s)).toEqual([]);
    expect(diagnostics(s.program).some((d) => d.includes(` ${line()}:`))).toBe(true);
    sameAsCold(s);
    s.edit("Call {{1}} now.", "Call now.");
    expect(diagnostics(s.program).some((d) => d.includes(` ${line()}:`))).toBe(false);
    sameAsCold(s);
  });
});

describe("a compile that meets a memo it cannot compile from", () => {
  it("lowers the block again and compiles again, and keeps what its first attempt found about the statements it resolved again", () => {
    const text = [
      "scene MAIN",
      "  Opening line.",
      "  choose",
      "    + [Go on]",
      "      You go on.",
      "    + [Stay]",
      "      You stay.",
      "  then",
      "    Warm line.",
      "    local n = 5",
      ...FILLER.map((line) => `    ${line}`),
      "    Body {n}.",
      ...FILLER.map((line) => `    ${line}`),
      "  end",
      "  Still {n}.",
      "end",
      "",
    ].join("\n");
    const s = warmed(text);
    const after = () =>
      programStatements(s.compiler).find((statement) => statement.syntax.includes("Still {n}."));
    const before = after();
    expect(before?.key).toContain("n:variable");
    const attempts = vi.spyOn(s.compiler as any, "compileStoryOnce");
    s.edit("    local n = 5", "    local m = 5");
    expect(attempts.mock.calls.length, "the compile ran again").toBeGreaterThan(1);
    attempts.mockRestore();
    expect(after()?.key).toContain("n:unresolved");
    expect(after()?.chunk === before!.chunk, "the statement after the block kept its chunk").toBe(
      false,
    );
    sameAsCold(s);
  });

  it("reports what a cold compile reports of a line that reads the global a stale assignment's memo made no auto-global of", () => {
    const s = warmed(
      `${clauseScript(["Line one.", ...FILLER, "& gold = gold + 1", ...FILLER, "Line last."], ["store gold = 0", ""])}\nscene ENDING\n  The end, with {gold} gold.\nend\n`,
    );
    s.edit("Warm line!", "Warm line?");
    expect(s.stats.served).toBeGreaterThan(0);
    const attempts = vi.spyOn(s.compiler as any, "compileStoryOnce");
    s.editAll([
      ["store gold = 0\n", ""],
      ["Line last.", "Line last!"],
    ]);
    expect(attempts.mock.calls.length, "the compile ran again").toBeGreaterThan(1);
    attempts.mockRestore();
    sameAsCold(s);
  });
});

const kindsScript = (clause: readonly string[] = [], top: readonly string[] = []) =>
  [
    clauseScript(
      [
        "Line one.",
        ...clause,
        ...FILLER,
        "& trust = trust + 1",
        "if trust > 2 then",
        "  Big trust {trust}.",
        "end",
        "label later",
        ...FILLER,
        "-> OTHER",
      ],
      ["store trust = 0", "", ...top],
    ),
    "scene OTHER",
    "  Other.",
    "end",
    "",
  ].join("\n");

const coldFacts = (text: string) => {
  const c = programCompiler({ [MAIN_URI]: text });
  quietly(() => c.compile());
  return storyFacts(c.compiler as SparkdownCompiler);
};

const assignmentChunk = (s: ReturnType<typeof session>, name: string) => {
  let found: object | undefined;
  const visit = (shape: StatementShape) => {
    const obj = shape.objects[0] as { variableName?: string } | undefined;
    if (obj?.variableName === name) {
      found = s.compiler.chunkStore!.chunkOf(shape.memo ?? shape);
    }
    for (const body of shape.bodies) {
      body.statements.forEach(visit);
    }
  };
  for (const block of compiledBlocks(s, "LuauSparkdownChooseBlock")) {
    if (block.statement) {
      visit(block.statement);
    }
  }
  return found;
};

const storyFacts = (compiler: SparkdownCompiler) => {
  const story = (compiler as any)._programResolver._story;
  return {
    assigned: [...story.globalAssignmentNames()].sort(),
    globals: [...story.variableDeclarations.keys()].sort(),
  };
};

describe("a statement whose objects another pass reads", () => {
  it("is served when an edit elsewhere in its block lowers the block again, with the statements of an `if` block's body, and keeps its chunk", () => {
    const s = warmed(kindsScript());
    const before = new Set(rootChunks(s.root));
    s.edit("Line one.", "Line one, edited.");
    expect(loweredOutside(s)).toEqual([]);
    expect(s.stats.served).toBeGreaterThanOrEqual(2 * FILLER.length + 5);
    expect(rootChunks(s.root).filter((chunk) => !before.has(chunk)).length).toBe(1);
    sameAsCold(s);
    expect(storyFacts(s.compiler)).toEqual(
      coldFacts(s.text),
    );
  });

  it("an assignment is lowered again when a local declared earlier changes what it assigns, and no other statement is", () => {
    const s = warmed(kindsScript());
    s.edit("    Line one.\n", "    Line one.\n    local trust = 5\n");
    expect(loweredOutside(s)).toEqual(["& trust = trust + 1", "if trust > 2 then"]);
    sameAsCold(s);
  });

  it("an `if` block is lowered again with the statement of its body whose lowering reads otherwise, or when its own lowering does, and no other statement is", () => {
    try {
      probe.value = "one";
      const s = warmed(
        kindsScript().replace("  Big trust {trust}.", "  [[show backdrop alley]]"),
      );
      probe.value = "two";
      s.edit("Line one.", "Line one, edited.");
      expect(loweredOutside(s)).toEqual(["[[show backdrop alley]]", "if trust > 2 then"]);
      sameAsCold(s);
    } finally {
      probe.value = undefined;
    }
    const t = warmed(
      kindsScript([], ["store x = 1", ""]).replace("  Big trust {trust}.", "  Big trust {x}."),
    );
    t.edit("    Line one.\n", "    Line one.\n    local x = 2\n");
    expect(loweredOutside(t)).toEqual(["if trust > 2 then"]);
    sameAsCold(t);
  });

  it("a label is lowered again when a flow of its name is written, and no other statement is", () => {
    const s = warmed(kindsScript());
    s.edit("scene OTHER\n", "scene later\n  Later.\nend\n\nscene OTHER\n");
    s.edit("Line one.", "Line one, edited.");
    expect(loweredOutside(s)).toEqual(["label later"]);
    sameAsCold(s);
  });

  it("a divert is lowered again when a label of its target's name is written in its block, and no other statement is", () => {
    const s = warmed(kindsScript());
    s.edit("    Line one.\n", "    Line one.\n    label OTHER\n");
    expect(loweredOutside(s)).toEqual(["if trust > 2 then", "-> OTHER"]);
    sameAsCold(s);
  });

  it("an assignment that made an auto-global is lowered again when a local of its name is declared before it, while an unrelated one keeps its chunk", () => {
    const s = warmed(kindsScript([...FILLER, "& fresh = 5", ...FILLER, "Count {fresh}."]));
    s.edit("Line one.", "Line one, edited.");
    expect(loweredOutside(s)).toEqual([]);
    expect(storyFacts(s.compiler).globals).toContain("fresh");
    expect(storyFacts(s.compiler)).toEqual(coldFacts(s.text));
    const trust = assignmentChunk(s, "trust");
    expect(trust).toBeDefined();
    s.edit("    Line one, edited.\n", "    Line one, edited.\n    local fresh = 1\n");
    expect(loweredOutside(s)).toContain("& fresh = 5");
    expect(loweredOutside(s)).not.toContain("& trust = trust + 1");
    expect(assignmentChunk(s, "trust")).toBe(trust);
    expect(storyFacts(s.compiler).globals).not.toContain("fresh");
    expect(storyFacts(s.compiler)).toEqual(coldFacts(s.text));
    sameAsCold(s);
  });
});

describe("a local declaration", () => {
  const localScript = (top: readonly string[] = []) =>
    clauseScript(
      ["Line one.", ...FILLER, "local here = 2", ...FILLER, "Here {here}.", ...FILLER, "Line last."],
      top,
    );

  it("is served when an edit elsewhere lowers its block again, and declares its local again for the statements after it", () => {
    const s = warmed(localScript());
    const before = new Set(rootChunks(s.root));
    s.edit("Line last.", "Line last, edited.");
    expect(loweredOutside(s)).toEqual([]);
    expect(rootChunks(s.root).filter((chunk) => !before.has(chunk)).length).toBe(1);
    sameAsCold(s);
    s.edit("Here {here}.", "Here {here}!");
    expect(loweredOutside(s)).toEqual([]);
    expect(s.stats.served).toBeGreaterThan(3 * FILLER.length);
    sameAsCold(s);
  });

  it("is served when a global of its name is declared above it, and no other statement is lowered", () => {
    const s = warmed(localScript(["store other = 1", ""]));
    s.edit("store other = 1", "store here = 1");
    s.edit("Line last.", "Line last, edited.");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
  });

  it("leaves the line that reads it served by the edit after a compile that carried its block while a store of its name was written below it (#1974)", () => {
    const s = warmed(`${localScript()}\nstore other = 1\n`);
    s.edit("store other = 1", "store here = 1");
    expect(loweredOutside(s)).toEqual([]);
    s.edit("Line last.", "Line last, edited.");
    expect(loweredOutside(s)).toEqual(["local here = 2"]);
    expect(diagnostics(s.program).join("\n")).toContain("Duplicate identifier `here`");
    sameAsCold(s);
  });

  it("is served, with the line that reads it, by the edit after a rename the compile made a second attempt at (#1974)", () => {
    const second = [
      "scene SECOND",
      "  Second opening.",
      "  choose",
      "    + [On]",
      "      You go.",
      "    + [Off]",
      "      You stay.",
      "  then",
      "    Warm two.",
      ...FILLER.map((line) => `    ${line}`),
      "    Two {here}.",
      ...FILLER.map((line) => `    ${line}`),
      "    Last two.",
      "  end",
      "end",
      "",
    ].join("\n");
    const s = warmed(`${localScript(["store other = 1", ""])}\n${second}`);
    s.edit("Warm two.", "Warm two!");
    s.edit("Last two.", "Last two!");
    expect(s.stats.served).toBeGreaterThan(0);
    const attempts = vi.spyOn(s.compiler as any, "compileStoryOnce");
    s.edit("store other = 1", "store here = 1");
    expect(attempts.mock.calls.length, "the compile ran again").toBeGreaterThan(1);
    attempts.mockRestore();
    s.edit("Line last.", "Line last, edited.");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
  });

  it("is served, with the line that reads it, by the edit after a rename a preview showed first (#1974)", () => {
    const s = warmed(localScript(["store other = 1", ""]));
    s.preview("store other = 1", "store here = 1");
    s.edit("store other = 1", "store here = 1");
    s.edit("Line last.", "Line last, edited.");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
  });

  it("is served, with the line that reads it, by the edit after an update that renamed its scene as it declared a store of its name (#1974)", () => {
    const s = warmed(localScript(["store other = 1", ""]));
    s.editAll([
      ["store other = 1", "store here = 1"],
      ["scene MAIN", "scene RENAMED"],
    ]);
    s.edit("Line last.", "Line last!");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
  });

  it("is served, with the line that reads it, by the edit after a rename whose compile made no program (#1974)", () => {
    const s = warmed(localScript(["store other = 1", ""]));
    s.edit("store other = 1", "store here = 1\nexternal message(x)");
    expect(s.program.chunks ?? null).toBeNull();
    s.edit("external message(x)\n", "");
    s.edit("Line last.", "Line last!");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
  });

  it("collides again when a store of its name is declared in its own scene, and stops when it goes", () => {
    const s = warmed(localScript());
    s.edit("Line last.", "store here = 1");
    sameAsCold(s);
    expect(diagnostics(s.program).join("\n")).toContain("Duplicate identifier `here`");
    s.edit("store here = 1", "Line last.");
    sameAsCold(s);
    expect(diagnostics(s.program).join("\n")).not.toContain("Duplicate identifier");
  });
});

describe("a local declaration of several names", () => {
  it("is served when an edit elsewhere lowers its block again, and declares its locals again for the statements after it", () => {
    const s = warmed(
      clauseScript(["Line one.", ...FILLER, "local a, b = 1, 2", ...FILLER, "Values {a}, {b}.", ...FILLER, "Line last."]),
    );
    s.edit("Line last.", "Line last, edited.");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
    s.edit("Values {a}, {b}.", "Values {a}, {b}!");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
  });
});

describe("statements that read alike", () => {
  const sameScript = () =>
    clauseScript(["Line one.", ...FILLER, "Same.", ...FILLER, "Same.", ...FILLER, "Line last."]);

  it("each keep their own memo when an edit writes another line like them above them", () => {
    const s = warmed(sameScript());
    const before = new Set(rootChunks(s.root));
    s.edit("    Line one.\n", "    Line one.\n    Same.\n");
    expect(loweredOutside(s)).toEqual([]);
    expect(rootChunks(s.root).filter((chunk) => !before.has(chunk)).length).toBe(1);
    sameAsCold(s);
  });

  it("each keep their own memo when an edit takes away a line like them above them", () => {
    const s = warmed(
      clauseScript(["Line one.", "Same.", ...FILLER, "Same.", ...FILLER, "Same.", ...FILLER, "Line last."]),
    );
    s.edit("    Line one.\n    Same.\n", "    Line one.\n");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
  });
});

describe("a local declared inside an `if` block's body", () => {
  it("keeps the block lowered, so the local stays in the block's scope: a line after the block, lowered anew, reads the global of its name", () => {
    const s = warmed(
      clauseScript(
        ["Line one.", ...FILLER, "if 1 > 0 then", "  local scoped = 1", "  Inside {scoped}.", "end", ...FILLER, "After {scoped}.", ...FILLER, "Line last."],
        ["store scoped = 5", ""],
      ),
    );
    s.edit("Line last.", "Line last, edited.");
    expect(loweredOutside(s)).toContain("if 1 > 0 then");
    expect(loweredOutside(s)).not.toContain("Inside {scoped}.");
    sameAsCold(s);
    s.edit("After {scoped}.", "After {scoped}!");
    sameAsCold(s);
  });
});

describe("local declarations, further shapes", () => {
  it("one that reads a constant is served, and its program is a cold compile's while the constant's initializer breaks, it becomes a variable and it goes", () => {
    const s = warmed(
      clauseScript(
        ["Line one.", ...FILLER, "local here = BASE", ...FILLER, "Here {here}.", ...FILLER, "Line last."],
        ["const BASE = 1", ""],
      ),
    );
    s.edit("Line last.", "Line last, edited.");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
    s.edit("Here {here}.", "Here {here}!");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
    s.edit("const BASE = 1", "const BASE = missing");
    s.edit("Line last, edited.", "Line last, edited again.");
    sameAsCold(s);
    s.edit("const BASE = missing", "store BASE = 1");
    sameAsCold(s);
    s.edit("Line last, edited again.", "Line last, edited once more.");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
    s.edit("store BASE = 1", "store OTHER = 1");
    sameAsCold(s);
    s.edit("Line last, edited once more.", "Line last, edited at last.");
    sameAsCold(s);
  });

  it("several on one line are served, and declare their locals again for the statements after them", () => {
    const s = warmed(
      clauseScript(["Line one.", ...FILLER, "& local a = 1; local b = 2", ...FILLER, "Values {a}, {b}.", ...FILLER, "Line last."]),
    );
    s.edit("Line last.", "Line last, edited.");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
    s.edit("Values {a}, {b}.", "Values {a}, {b}!");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
  });
});

describe("the recording of the lowering context", () => {
  it("writes what a lowering writes as itself, hands it back as itself, and records nothing once it is done", async () => {
    const { recordLowering } = await import("../../compiler/lower/recordingContext");
    const { recordRebind } = await import("../../compiler/lower/expression/bindings");
    const earlier = { rebound: true as const };
    const frame = new Map<string, { rebound: true }>([["foo", earlier]]);
    const ctx = {
      siblingSubFlowNamesStack: [frame],
      declaredLocalsStack: [new Set<string>()],
      read: () => "",
      lineNumber: () => 0,
      characterNumber: () => 0,
    } as never;
    const { ctx: recorded, finish } = recordLowering(ctx, 0, 0);
    recordRebind("foo", recorded);
    const written = frame.get("foo");
    expect(written).not.toBe(earlier);
    expect(written?.rebound).toBe(true);
    const stack = (recorded as unknown as { siblingSubFlowNamesStack: Map<string, unknown>[] })
      .siblingSubFlowNamesStack;
    expect(stack[0]!.get("foo")).toBe(written);
    const recording = finish();
    const reads = recording.reads.length;
    stack[0]!.set("foo", earlier);
    expect(frame.get("foo")).toBe(earlier);
    expect(stack[0]!.get("foo")).toBe(earlier);
    expect(recording.reads.length).toBe(reads);
  });

  it("still records what a lowering reads through an object it wrote back as it found it", async () => {
    const { recordLowering, readsHold } = await import("../../compiler/lower/recordingContext");
    const ctx = {
      probe: { value: "one" },
      read: () => "",
      lineNumber: () => 0,
      characterNumber: () => 0,
    };
    const object = ctx.probe;
    const { ctx: recorded, finish } = recordLowering(ctx as never, 0, 0);
    const lowering = recorded as unknown as typeof ctx;
    const saved = lowering.probe;
    lowering.probe = saved;
    expect(lowering.probe.value).toBe("one");
    const recording = finish();
    expect(recording.unkeyable).toBeNull();
    expect(ctx.probe).toBe(object);
    expect(readsHold(ctx as never, 0, recording.reads)).toBe(true);
    ctx.probe.value = "two";
    expect(readsHold(ctx as never, 0, recording.reads)).toBe(false);
  });
});

const loopsScript = (
  heads: Partial<Record<"while" | "for" | "forIn" | "repeat" | "choice", string>> = {},
  clause: readonly string[] = [],
) =>
  clauseScript(
    [
      "Line one.",
      ...clause,
      ...FILLER,
      heads.while ?? "while trust < 2 do",
      "  & trust = trust + 1",
      "  In the while {trust}.",
      "  if trust > 5 then",
      "    break",
      "  end",
      "end",
      heads.for ?? "for i = 1, 2 do",
      "  In the for {i}.",
      "  if i > 1 then",
      "    continue",
      "  end",
      "end",
      heads.forIn ?? "for k, v in { a = 1 } do",
      "  In the generic for {v}.",
      "end",
      "repeat",
      "  In the repeat.",
      "  & trust = trust - 1",
      heads.repeat ?? "until trust <= 0",
      "choose",
      heads.choice ?? "  + [Left]",
      "    You go left.",
      "  * (right) [Right]",
      "    You go right.",
      "then (inner)",
      "  After the inner choice.",
      "end",
      ...FILLER,
      "Line last.",
    ],
    ["store trust = 0", ""],
  );

describe("a loop or a `choose` block written in a body (#1683)", () => {
  it("is served when an edit elsewhere in its block lowers the block again, with the statements of its bodies, and keeps its chunk", () => {
    const s = warmed(loopsScript());
    const before = new Set(rootChunks(s.root));
    s.edit("Line one.", "Line one, edited.");
    expect(loweredOutside(s)).toEqual([]);
    expect(s.stats.served).toBeGreaterThanOrEqual(2 * FILLER.length + 5);
    expect(rootChunks(s.root).filter((chunk) => !before.has(chunk)).length).toBe(1);
    sameAsCold(s);
    expect(storyFacts(s.compiler)).toEqual(coldFacts(s.text));
  });

  it("is served again by a second edit elsewhere, and keeps the chunk it kept", () => {
    const s = warmed(loopsScript());
    s.edit("Line one.", "Line one, edited.");
    const before = new Set(rootChunks(s.root));
    s.edit("Line last.", "Line last, edited.");
    expect(loweredOutside(s)).toEqual([]);
    expect(rootChunks(s.root).filter((chunk) => !before.has(chunk)).length).toBe(1);
    sameAsCold(s);
  });

  it("is served when an edit above it moves it, and its program is a cold compile's", () => {
    const s = warmed(loopsScript());
    s.edit("    Line one.\n", "    Line one.\n    A line written above them.\n");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
    expect(storyFacts(s.compiler)).toEqual(coldFacts(s.text));
  });
});

const KINDS = {
  while: { head: "while w < 2 do", body: ["  In the while.", "end"] },
  for: { head: "for i = 1, f do", body: ["  In the for {i}.", "end"] },
  "for ... in": { head: "for k, v in g do", body: ["  In the generic for {v}.", "end"] },
  repeat: { head: "repeat", body: ["  In the repeat.", "until r <= 0"] },
  choose: {
    head: "choose",
    body: ["  * if c > 0 [Left]", "    You go left.", "  + [Right]", "    You go right.", "end"],
  },
} as const;

const kindScript = (kind: keyof typeof KINDS) =>
  clauseScript(
    ["Line one.", ...FILLER, KINDS[kind].head, ...KINDS[kind].body, ...FILLER, "Line last."],
    ["store w = 0", "store f = 2", "store g = { a = 1 }", "store r = 0", "store c = 1", ""],
  );

describe("an edit that changes what a loop or a `choose` block written in a body lowers to (#1683)", () => {
  const readers = { while: "w", for: "f", "for ... in": "g", repeat: "r", choose: "c" } as const;
  for (const kind of Object.keys(KINDS) as (keyof typeof KINDS)[]) {
    it(`lowers again the ${kind} whose own lowering reads a local declared above it, and no other statement`, () => {
      const s = warmed(kindScript(kind));
      const before = new Set(rootChunks(s.root));
      s.edit("    Line one.\n", `    Line one.\n    local ${readers[kind]} = 5\n`);
      expect(loweredOutside(s)).toEqual([KINDS[kind].head]);
      expect(rootChunks(s.root).filter((chunk) => !before.has(chunk)).length).toBeLessThanOrEqual(2);
      sameAsCold(s);
      expect(storyFacts(s.compiler)).toEqual(coldFacts(s.text));
    });

    it(`serves the ${kind} again once the local it read goes`, () => {
      const s = warmed(kindScript(kind));
      s.edit("    Line one.\n", `    Line one.\n    local ${readers[kind]} = 5\n`);
      s.edit(`    local ${readers[kind]} = 5\n`, "");
      s.edit("Line last.", "Line last, edited.");
      expect(loweredOutside(s)).toEqual([]);
      sameAsCold(s);
    });
  }

  it("lowers again a loop with the statement of its body whose lowering reads otherwise, and no other statement", () => {
    try {
      probe.value = "one";
      const s = warmed(
        clauseScript(["Line one.", ...FILLER, "while w < 2 do", "  [[show backdrop alley]]", "end", ...FILLER], ["store w = 0", ""]),
      );
      probe.value = "two";
      s.edit("Line one.", "Line one, edited.");
      expect(loweredOutside(s)).toEqual(["[[show backdrop alley]]", "while w < 2 do"]);
      sameAsCold(s);
    } finally {
      probe.value = undefined;
    }
  });
});

describe("a loop or a `choose` block served from its memo, as the rest of the story reads it (#1683)", () => {
  it("declares again the loop's variables and the locals of its body, which stay in its scope", () => {
    const s = warmed(
      clauseScript(
        [
          "Line one.",
          ...FILLER,
          "for i = 1, 2 do",
          "  local x = i",
          "  In the for {x}.",
          "end",
          "for k, v in { a = 1 } do",
          "  In the generic for {k}.",
          "end",
          "Read after the loops {i} {x} {k}.",
          "& i = 3",
          ...FILLER,
        ],
        ["store trust = 0", ""],
      ),
    );
    s.edit("Line one.", "Line one, edited.");
    expect(loweredOutside(s)).toEqual([]);
    sameAsCold(s);
    expect(storyFacts(s.compiler)).toEqual(coldFacts(s.text));
    s.edit("Read after the loops {i} {x} {k}.", "Read after the loops, again, {i} {x} {k}.");
    sameAsCold(s);
    expect(storyFacts(s.compiler)).toEqual(coldFacts(s.text));
  });

  it("names the labels of a `choose` block, which a divert written after it reaches and a line reads the count of", () => {
    const s = warmed(
      clauseScript(
        [
          "Line one.",
          ...FILLER,
          "choose",
          "  * (left) [Left]",
          "    You go left.",
          "  + [Right]",
          "    You go right.",
          "then (inner)",
          "  After the inner choice.",
          "end",
          ...FILLER,
          "Line last.",
        ],
      ),
    );
    s.edit("Line one.", "Line one, edited.");
    expect(loweredOutside(s)).toEqual([]);
    s.edit("Line last.", "Seen {left} and {inner}.\n    -> inner");
    sameAsCold(s);
    s.edit("    Line one, edited.\n", "    Line one, edited.\n    label inner\n");
    const coldProgram = cold({ [MAIN_URI]: s.text });
    expect(diagnostics(s.program)).toEqual(diagnostics(coldProgram));
    expect(diagnostics(s.program).join("\n")).toContain("inner");
    expect(!!s.program.chunks).toBe(!!coldProgram.chunks);
  });

  it("keeps the count symbols of a `choose` block's choices when it is lowered again after it was served", () => {
    const text = clauseScript([
      "Line one.",
      ...FILLER,
      "choose",
      "  * [Left]",
      "    You go left.",
      "  * [Right]",
      "    You go right.",
      "end",
      ...FILLER,
    ]);
    const s = warmed(text);
    const choicesOf = () => {
      const store = s.compiler.chunkStore! as any;
      for (const block of compiledBlocks(s, "LuauSparkdownChooseBlock")) {
        for (const body of block.statement?.bodies ?? []) {
          for (const statement of body.statements) {
            if (statement.node === "LuauSparkdownChooseBlock") {
              const chunk = store.chunkOf(statement.memo ?? statement);
              return store._info.get(chunk)?.choices.map((part: { symbol: number }) => part.symbol);
            }
          }
        }
      }
      return undefined;
    };
    const symbols = choicesOf();
    expect(symbols?.length).toBe(2);
    s.edit("Line one.", "Line one, edited.");
    expect(loweredOutside(s)).toEqual([]);
    expect(choicesOf()).toEqual(symbols);
    s.edit("    You go left.", "    You go left, quickly.");
    expect(choicesOf()).toEqual(symbols);
    sameAsCold(s);
  });
});

describe("the names a loop's lowering makes from its place (#1683)", () => {
  const placedNames = (compiler: SparkdownCompiler): Map<string, string> =>
    new Map(
      [...((compiler as any)._syntheticNamesLastRun as Map<string, string>)].filter(
        ([name]) => name.includes("$") && !NUMBERED_SYNTHETIC_NAME.test(name),
      ),
    );

  const coldCompiler = (text: string): SparkdownCompiler => {
    const c = programCompiler({ [MAIN_URI]: text });
    quietly(() => c.compile());
    return c.compiler as SparkdownCompiler;
  };
  const loweredLines = (s: ReturnType<typeof session>) =>
    s.stats.loweredAt.map((at) => s.text.slice(at, s.text.indexOf("\n", at)).trim());

  it("are numbered for each part of a served loop as a cold compile numbers them, and for a loop lowered after it", () => {
    const s = warmed(
      clauseScript(
        [
          "Line one.",
          ...FILLER,
          "repeat",
          "  break",
          "until true",
          "for i = 1, 2 do",
          "  if i > 1 then",
          "    while trust < 2 do",
          "      & trust = trust + 1",
          "    end",
          "    break",
          "  end",
          "  In the for {i}.",
          "end",
          "for k, v in { a = 1 } do",
          "  if k then",
          "    continue",
          "  end",
          "  for j = 1, 2 do",
          "    In the inner for {j}.",
          "  end",
          "end",
          ...FILLER,
          "while trust < 3 do",
          "  In the last loop.",
          "end",
        ],
        ["store trust = 0", ""],
      ),
    );
    s.edit("while trust < 3 do", "while trust < 4 do");
    expect(loweredOutside(s)).toEqual([]);
    expect(s.stats.served).toBeGreaterThan(2 * FILLER.length);
    const incremental = placedNames(s.compiler);
    const c = programCompiler({ [MAIN_URI]: s.text });
    quietly(() => c.compile());
    const coldNames = placedNames(c.compiler as SparkdownCompiler);
    expect(incremental.size).toBe(coldNames.size);
    expect(incremental.size).toBeGreaterThan(12);
    expect([...incremental].sort()).toEqual([...coldNames].sort());
    sameAsCold(s);
  });

  it("serve a `break` again once its loop, lowered anew by an edit of its head, is served again", () => {
    const s = warmed(
      clauseScript(
        [
          "Line one.",
          ...FILLER,
          "while trust < 2 do",
          "  & trust = trust + 1",
          "  if trust > 5 then",
          "    break",
          "  end",
          "end",
          ...FILLER,
        ],
        ["store trust = 0", ""],
      ),
    );
    s.edit("while trust < 2 do", "while trust < 3 do");
    expect(loweredOutside(s)).toEqual([]);
    expect(loweredLines(s)).toContain("while trust < 3 do");
    expect(loweredLines(s)).not.toContain("if trust > 5 then");
    expect(loweredLines(s)).not.toContain("break");
    sameAsCold(s);
    expect([...placedNames(s.compiler)].sort()).toEqual([...placedNames(coldCompiler(s.text))].sort());
    s.edit("Line one.", "Line one, edited.");
    expect(loweredOutside(s)).toEqual([]);
    expect(loweredLines(s)).not.toContain("while trust < 3 do");
    expect(loweredLines(s)).not.toContain("break");
    sameAsCold(s);
    expect([...placedNames(s.compiler)].sort()).toEqual([...placedNames(coldCompiler(s.text))].sort());
  });
});

describe("a script whose path holds what a name made from a place holds (#1683)", () => {
  it("keeps its loops and `choose` blocks served when an edit above moves them", () => {
    const uri = "inmemory:///scripts/chapter__$123.sd";
    const c = programCompiler({ [uri]: loopsScript() });
    let text = loopsScript();
    let version = 1;
    const edit = (find: string, replace: string) => {
      const offset = text.indexOf(find);
      expect(offset, `"${find}" is in the script`).toBeGreaterThanOrEqual(0);
      version += 1;
      c.compiler.updateDocument({
        textDocument: { uri, version },
        contentChanges: [
          {
            range: { start: posAt(text, offset), end: posAt(text, offset + find.length) },
            text: replace,
          },
        ],
      });
      text = text.slice(0, offset) + replace + text.slice(offset + find.length);
      return quietly(() => c.compile(uri).program);
    };
    quietly(() => c.compile(uri));
    edit("Warm line.", "Warm line!");
    const before = new Set(rootChunks(edit("Line one.", "Line one, edited.").chunks!));
    const program = edit("    Line one, edited.\n", "    Line one, edited.\n    A line written above them.\n");
    const stats = c.compiler.memoStats(uri)!;
    const lines = stats.loweredAt.map((at) => text.slice(at, text.indexOf("\n", at)).trim());
    expect(lines).not.toContain("while trust < 2 do");
    expect(lines).not.toContain("for i = 1, 2 do");
    expect(lines).not.toContain("repeat");
    expect(lines).not.toContain("choose");
    expect(stats.served).toBeGreaterThan(2 * FILLER.length);
    expect(rootChunks(program.chunks!).filter((chunk) => !before.has(chunk)).length).toBeLessThanOrEqual(2);
    const coldProgram = quietly(() => programCompiler({ [uri]: text }).compile(uri).program);
    expect(describeRoot(program.chunks!)).toEqual(describeRoot(coldProgram.chunks!));
    expect(diagnostics(program)).toEqual(diagnostics(coldProgram));
  });
});
