import { afterEach, describe, expect, it } from "vitest";
import { shuffleDraws } from "../../runtime/evaluation";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { OP_NAMES, Op } from "../../program/ProgramInstructions";
import type { ProgramRoot } from "../../program/ProgramRoot";
import {
  SymbolKind,
  countIdOf,
  isAnonymousSymbol,
} from "../../program/ProgramSymbols";
import { ProgramStory } from "../../program/ProgramStory";
import {
  HEADER_WORDS,
  blockCount,
  chunkId,
  type ProgramChunk,
} from "../../program/ProgramChunk";
import { flowScreenplay } from "./flowScreenplay";
import {
  compileScript,
  describeRoot,
  MAIN_URI,
  programCompiler,
  rootChunks,
  storyBeats,
} from "./programHarness";

const injectDraws = () => {
  let s = 0x696;
  shuffleDraws.next = () => (s = (s * 1103515245 + 12345) & 0x7fffffff);
};

afterEach(() => {
  shuffleDraws.next = null;
});

const silence = <T>(run: () => T): T => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

const programBeats = (text: string, from?: string) =>
  silence(() => {
    const { program } = compileScript(text);
    expect(program.chunks).toBeDefined();
    injectDraws();
    const actual = storyBeats(new ProgramStory(program.chunks!), from);
    return { actual, root: program.chunks! };
  });

const texts = (run: { beats: { text: string }[] }) =>
  run.beats.map((beat) => beat.text.trim());

const opsOf = (root: ProgramRoot): Set<string> => {
  const reader = new BinaryProgramReader(root);
  const out = new Set<string>();
  for (const chunk of rootChunks(root)) {
    for (const { op } of reader.instructions(chunk)) {
      out.add(OP_NAMES[op]!);
    }
  }
  return out;
};

const chunksWith = (root: ProgramRoot, op: number, arg?: number): ProgramChunk[] => {
  const reader = new BinaryProgramReader(root);
  return rootChunks(root).filter((chunk) =>
    [...reader.instructions(chunk)].some(
      (i) => i.op === op && (arg === undefined || i.arg === arg),
    ),
  );
};

const symbolOf = (root: ProgramRoot, name: string): number => {
  const id = root.table.symbolIds.get(name);
  expect(id, name).toBeDefined();
  return id!;
};

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

const session = (text: string) => {
  const c = programCompiler({ [MAIN_URI]: text });
  let current = text;
  let version = 1;
  const first = silence(() => c.compile().program);
  return {
    compiler: c.compiler,
    first,
    edit(before: string, after: string) {
      const at = current.indexOf(before);
      expect(at, before).toBeGreaterThanOrEqual(0);
      version += 1;
      c.compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version },
        contentChanges: [
          {
            range: { start: posAt(current, at), end: posAt(current, at + before.length) },
            text: after,
          },
        ],
      });
      current = current.slice(0, at) + after + current.slice(at + before.length);
      return silence(() => c.compile().program);
    },
    get text() {
      return current;
    },
  };
};

describe("flows on the program engine", () => {
  it("runs a divert into the middle of a scene from another scene, counting the scene it enters", () => {
    const { actual, root } = programBeats(
      [
        "scene start",
        "  In A {start}.",
        "  -> B.mid",
        "end",
        "scene B",
        "  B's start, not shown.",
        "  label mid",
        "  B's middle {B} {mid} {start}.",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    expect(texts(actual)).toEqual(["In A 1.", "B's middle 1 1 1."]);
    expect(opsOf(root)).toContain("JumpSym");
    expect(opsOf(root)).toContain("Visit");
    expect(opsOf(root)).toContain("GetCount");
  });

  it("runs a divert to the target a variable holds", () => {
    const { actual, root } = programBeats(
      [
        "store target = -> there",
        "scene start",
        "  Here.",
        "  -> target",
        "end",
        "scene there",
        "  There {there}.",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    expect(texts(actual)).toEqual(["Here.", "There 1."]);
    expect(opsOf(root)).toContain("JumpVar");
    expect(opsOf(root)).toContain("Sym");
  });

  it("runs a tunnel that returns, and one that returns onward to a named target", () => {
    const { actual, root } = programBeats(
      [
        "scene start",
        "  Start.",
        "  -> back ->",
        "  Returned {back}.",
        "  -> A ->",
        "  Never shown.",
        "  done",
        "end",
        "scene back",
        "  In back.",
        "  ->->",
        "end",
        "scene A",
        "  In A.",
        "  ->-> B",
        "end",
        "scene B",
        "  In B {A} {B}.",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    expect(texts(actual)).toEqual(["Start.", "In back.", "Returned 1.", "In A.", "In B 1 1."]);
    expect(opsOf(root)).toContain("TunnelReturn");
    expect(chunksWith(root, Op.Call).length).toBeGreaterThan(0);
  });

  it("runs a thread that forks inside a scene, and resumes the scene when the thread is done", () => {
    const { actual, root } = programBeats(
      [
        "scene start",
        "  Before.",
        "  <- side",
        "  After {side}.",
        "  <- side",
        "  Again {side}.",
        "  done",
        "end",
        "scene side",
        "  In side.",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    expect(texts(actual)).toEqual(["Before.", "In side.", "After 1.", "In side.", "Again 2."]);
    expect(opsOf(root)).toContain("Thread");
    const story = new ProgramStory(root);
    expect(story.Continue()).toBe("Before.\n");
    expect(story.Continue()).toBe("In side.\n");
    const saved = story.state.toJson();
    const loaded = new ProgramStory(root);
    loaded.state.LoadJson(saved);
    expect(texts(storyBeats(loaded))).toEqual(["After 1.", "In side.", "Again 2."]);
  });

  it("returns the first line of two with a thread between them before the assignment after it", () => {
    const text = [
      "store x = 0",
      "scene start",
      "  First line.",
      "  & x = 1",
      "  <- side",
      "  Second line {x}.",
      "  done",
      "end",
      "scene side",
      "  done",
      "end",
      "",
    ].join("\n");
    silence(() => {
      const { program } = compileScript(text);
      expect(program.chunks).toBeDefined();
      const engine = new ProgramStory(program.chunks!);
      expect(engine.Continue()).toBe("First line.\n");
      expect(engine.variablesState.$("x")).toBe(0);
      expect(engine.Continue()).toBe("Second line 1.\n");
      expect(engine.variablesState.$("x")).toBe(1);
    });
  });

  it("runs every kind of alternator, inline, glued, on one line and as a block", () => {
    const kinds = ["queue", "cycle", "chain", "shuffle queue", "shuffle cycle", "shuffle chain", "shuffle"];
    const lines = ["scene start", "  label again", "  & i = i + 1"];
    kinds.forEach((kind, k) => {
      lines.push(`  Inline ${k} {${kind}|"A"|"B"|"C"}.`);
      lines.push(`  Glued ${k} .. ${kind}|A|B|C .. after.`);
      lines.push(`  ${kind} | One ${k}. | Two ${k}. | Three ${k}. end`);
      lines.push(`  ${kind}`, `    | First ${k}.`, `    | Second ${k}.`, "  end");
    });
    lines.push("  Tagged .. queue|red # red|blue # blue .. sequence.");
    lines.push("  if i < 5 then", "    -> again", "  end", "  done", "end", "store i = 0", "");
    const { actual, root } = programBeats(lines.join("\n"));
    expect(actual.errors).toEqual([]);
    const shown = texts(actual);
    const forms = (k: number) => ({
      inline: shown.filter((t) => t.startsWith(`Inline ${k} `)),
      glued: shown.filter((t) => t.startsWith(`Glued ${k} `)),
      line: shown.filter((t) => new RegExp(`^(One|Two|Three) ${k}\\.$`).test(t)),
      block: shown.filter((t) => new RegExp(`^(First|Second) ${k}\\.$`).test(t)),
    });
    expect(forms(0)).toEqual({
      inline: ["Inline 0 A.", "Inline 0 B.", "Inline 0 C.", "Inline 0 .", "Inline 0 ."],
      glued: ["Glued 0 A after.", "Glued 0 B after.", "Glued 0 C after.", "Glued 0 after.", "Glued 0 after."],
      line: ["One 0.", "Two 0.", "Three 0."],
      block: ["First 0.", "Second 0."],
    });
    expect(forms(1)).toEqual({
      inline: ["Inline 1 A.", "Inline 1 B.", "Inline 1 C.", "Inline 1 A.", "Inline 1 B."],
      glued: ["Glued 1 A after.", "Glued 1 B after.", "Glued 1 C after.", "Glued 1 A after.", "Glued 1 B after."],
      line: ["One 1.", "Two 1.", "Three 1.", "One 1.", "Two 1."],
      block: ["First 1.", "Second 1.", "First 1.", "Second 1.", "First 1."],
    });
    expect(forms(2)).toEqual({
      inline: ["Inline 2 A.", "Inline 2 B.", "Inline 2 C.", "Inline 2 C.", "Inline 2 C."],
      glued: ["Glued 2 A after.", "Glued 2 B after.", "Glued 2 C after.", "Glued 2 C after.", "Glued 2 C after."],
      line: ["One 2.", "Two 2.", "Three 2.", "Three 2.", "Three 2."],
      block: ["First 2.", "Second 2.", "Second 2.", "Second 2.", "Second 2."],
    });
    const arms = {
      inline: ["A", "B", "C"].map((arm) => (k: number) => `Inline ${k} ${arm}.`),
      glued: ["A", "B", "C"].map((arm) => (k: number) => `Glued ${k} ${arm} after.`),
      line: ["One", "Two", "Three"].map((arm) => (k: number) => `${arm} ${k}.`),
      block: ["First", "Second"].map((arm) => (k: number) => `${arm} ${k}.`),
    };
    const drawsArms = (k: number, form: keyof typeof arms, passes: number, drawn = passes) => {
      const out = forms(k)[form];
      expect(out, `${form} ${k}`).toHaveLength(passes);
      for (const text of out.slice(0, drawn)) {
        expect(arms[form].map((arm) => arm(k)), `${form} ${k}`).toContain(text);
      }
      return out;
    };
    for (const form of ["inline", "glued"] as const) {
      drawsArms(3, form, 5, 3);
    }
    expect(forms(3).inline.slice(3)).toEqual(["Inline 3 .", "Inline 3 ."]);
    expect(forms(3).glued.slice(3)).toEqual(["Glued 3 after.", "Glued 3 after."]);
    drawsArms(3, "line", 3);
    drawsArms(3, "block", 2);
    for (const form of ["inline", "glued", "line", "block"] as const) {
      drawsArms(4, form, 5);
    }
    for (const form of ["inline", "glued", "line", "block"] as const) {
      const out = drawsArms(5, form, 5);
      const last = form === "block" ? 1 : 2;
      expect(out.slice(last + 1), `${form} 5`).toEqual(out.slice(last + 1).map(() => out[last]));
    }
    for (const form of ["inline", "line", "block"] as const) {
      drawsArms(6, form, 5);
    }
    expect(shown.filter((t) => t.startsWith("Tagged"))).toEqual([
      "Tagged red sequence.",
      "Tagged blue sequence.",
      "Tagged sequence.",
      "Tagged sequence.",
      "Tagged sequence.",
    ]);
    expect(actual.beats.filter((beat) => beat.tags.length).map((beat) => beat.tags)).toEqual([
      ["red"],
      ["blue"],
    ]);
    for (const op of ["Visit", "VisitIndex", "ShuffleIndex", "Tag"]) {
      expect(opsOf(root), op).toContain(op);
    }
  });

  it("picks different arms of a shuffle without the injected draws only as its seed says", () => {
    const text = [
      "scene start",
      "  label again",
      "  & i = i + 1",
      '  {shuffle|"A"|"B"|"C"|"D"|"E"}',
      "  if i < 8 then",
      "    -> again",
      "  end",
      "  done",
      "end",
      "store i = 0",
      "",
    ].join("\n");
    silence(() => {
      const { program } = compileScript(text);
      const run = () => {
        const story = new ProgramStory(program.chunks!);
        story.state.storySeed = 3;
        return texts(storyBeats(story));
      };
      expect(run()).toEqual(run());
    });
  });

  describe("counts", () => {
    for (const label of ["alpha", "beta"]) {
      it(`count the scene's labels when the bottom line reads {start.${label}}`, () => {
        const { actual } = programBeats(
          [
            "scene start",
            "  label alpha",
            "  & n = n + 1",
            "  label beta",
            "  if n < 3 then",
            "    -> alpha",
            "  end",
            "  if n < 4 then",
            "    & n = n + 1",
            "    -> beta",
            "  end",
            `  Counted {start.${label}}.`,
            "  done",
            "end",
            "store n = 0",
            "",
          ].join("\n"),
        );
          expect(texts(actual)).toEqual([`Counted ${label === "alpha" ? 3 : 4}.`]);
      });
    }

    it("count a flow entered by a jump into its middle", () => {
      const { actual } = programBeats(
        [
          "scene start",
          "  -> inside.middle",
          "end",
          "scene inside",
          "  Not shown.",
          "  label middle",
          "  Inside {inside}, middle {middle}.",
          "  done",
          "end",
          "",
        ].join("\n"),
      );
      expect(texts(actual)).toEqual(["Inside 1, middle 1."]);
    });

    it("do not count a flow again for a jump from inside it to its own first statement", () => {
      const { actual } = programBeats(
        [
          "scene start",
          "  & k = k + 1",
          "  Pass {k}: {start}.",
          "  if k < 3 then",
          "    -> start",
          "  end",
          "  done",
          "end",
          "store k = 0",
          "",
        ].join("\n"),
      );
      expect(texts(actual)).toEqual(["Pass 1: 1.", "Pass 2: 1.", "Pass 3: 1."]);
    });

    it("count a label passed once by falling through and once by a jump", () => {
      const { actual } = programBeats(
        [
          "scene start",
          "  label here",
          "  Here {here}.",
          "  if not again then",
          "    & again = true",
          "    -> here",
          "  end",
          "  done",
          "end",
          "store again = false",
          "",
        ].join("\n"),
      );
      expect(texts(actual)).toEqual(["Here 1.", "Here 2."]);
    });

    it("count a branch and its scene, a scene that starts with a branch, and turns since, read through the language", () => {
      const { actual, root } = programBeats(
        [
          "store spot = -> hall.lobby",
          "scene start",
          "  -> hall.lobby ->",
          "  -> hall.lobby ->",
          "  -> hall ->",
          "  Lobby {hall.lobby}, hall {hall}, turns {count.turns(-> hall.lobby)}, read {READ_COUNT(spot)} {count.visits(-> hall)} {count.visited(-> hall.lobby)}.",
          "  done",
          "end",
          "",
          "scene hall",
          "  branch lobby",
          "    In the lobby.",
          "    ->->",
          "  end",
          "end",
          "",
        ].join("\n"),
      );
      expect(texts(actual)).toEqual([
        "In the lobby.",
        "In the lobby.",
        "In the lobby.",
        "Lobby 3, hall 3, turns 0, read 3 3 true.",
      ]);
      expect(opsOf(root)).toContain("CountOf");
    });

    it("include the visits made before a reference to them existed, and a reference added in another flow emits no chunk of the counted flow", () => {
      const text = [
        "scene start",
        "  label visit",
        "  & k = k + 1",
        "  if k < 3 then",
        "    -> visit",
        "  end",
        "  -> reader",
        "end",
        "scene reader",
        "  Reader.",
        "  done",
        "end",
        "store k = 0",
        "",
      ].join("\n");
      const s = session(text);
      const first = s.first.chunks!;
      const game = new ProgramStory(first);
      expect(game.Continue()).toBe("Reader.\n");
      const saved = game.state.toJson();
      const flowChunks = (root: ProgramRoot) => {
        const flow = root.flowNamed("start")!;
        const out: ProgramChunk[] = [];
        const walk = (chunks: readonly ProgramChunk[]) => {
          for (const chunk of chunks) {
            out.push(chunk);
            for (let k = 0; k < blockCount(chunk); k += 1) {
              walk(root.body(chunk, k)?.arrays.chunks ?? []);
            }
          }
        };
        walk(flow.arrays.chunks);
        return out;
      };
      const edited = s.edit("  Reader.", "  Reader {start.visit}.");
      expect(edited.chunks).toBeDefined();
      const after = edited.chunks!;
      const before = flowChunks(first);
      expect(before.length).toBeGreaterThan(3);
      flowChunks(after).forEach((chunk, i) => expect(chunk).toBe(before[i]));
      const resumed = new ProgramStory(after);
      resumed.state.LoadJson(saved);
      expect(resumed.state.VisitCount(countIdOf(after.table, symbolOf(after, "start.visit")))).toBe(3);
      resumed.ChoosePathString("reader");
      expect(resumed.Continue()).toBe("Reader 3.\n");
    });
  });

  it("rebuilds the block stack and the scopes of a jump that lands inside blocks, and runs on to the end of each of them", () => {
    const { program } = silence(() =>
      compileScript(
        [
        "scene start",
        "  Outer.",
        "  -> inner.target",
        "end",
        "scene inner",
        "  Not shown.",
        "  if true then",
        "    Not shown either.",
        "    while i < 3 do",
        "      & i = i + 1",
        "      if i == 2 then",
        "        label target",
        "        Target {i} {target}.",
        "      end",
        "      Body end {i}.",
        "    end",
        "    After the loop {i}.",
        "  end",
        "  After the if.",
        "  done",
        "end",
        "store i = 0",
        "",
        ].join("\n"),
        {},
      ),
    );
    expect(program.chunks).toBeDefined();
    const root = program.chunks!;
    expect(texts(storyBeats(new ProgramStory(root)))).toEqual([
      "Outer.",
      "Target 0 1.",
      "Body end 0.",
      "Body end 1.",
      "Target 2 2.",
      "Body end 2.",
      "Body end 3.",
      "After the loop 3.",
      "After the if.",
    ]);
    const story = new ProgramStory(root);
    expect(story.Continue()).toBe("Outer.\n");
    expect(story.Continue()).toBe("Target 0 1.\n");
    expect(story.state.blockStack).toHaveLength(3);
    expect(story.state.frame!.temporaryScopes).toHaveLength(5);
    const target = symbolOf(root, "inner.target");
    const at = root.place(target)!;
    let depth = 0;
    for (let row = at.sequence; row.owner >= 0; depth += 1) {
      row = root.position(row.owner)!.sequence;
    }
    expect(depth).toBe(3);
  });

  it("runs a jump to a target the program does not define as a runtime error, at the jump's line", () => {
    const text = ["scene start", "  Before.", "  -> nowhere", "end", ""].join("\n");
    const { program } = silence(() => compileScript(text));
    expect(program.chunks).toBeDefined();
    const messages = Object.values(program.diagnostics ?? {})
      .flat()
      .map((d: any) => d.message?.value ?? d.message);
    expect(messages).toContain("target not found: `-> nowhere`");
    const run = storyBeats(new ProgramStory(program.chunks!));
    expect(texts(run)).toEqual(["Before."]);
    expect(run.errors).toEqual(["1: RUNTIME ERROR: 'main' line 3: Divert target not found."]);
  });

  it("keeps the referring chunk before its target disappears, while it is gone and after it returns", () => {
    const target = "scene other\n  Other.\n  done\nend\n";
    const text = ["scene start", "  Before.", "  -> other", "end", target].join("\n");
    const s = session(text);
    const symbol = symbolOf(s.first.chunks!, "other");
    const referring = chunksWith(s.first.chunks!, Op.JumpSym, symbol);
    expect(referring).toHaveLength(1);
    const gone = s.edit(target, "");
    expect(gone.chunks).toBeDefined();
    expect(chunksWith(gone.chunks!, Op.JumpSym, symbol)[0]).toBe(referring[0]);
    expect(gone.chunks!.definition(symbol)).toBeUndefined();
    expect(storyBeats(new ProgramStory(gone.chunks!)).errors).toEqual([
      "1: RUNTIME ERROR: 'main' line 3: Divert target not found.",
    ]);
    const back = s.edit("  -> other\nend\n", `  -> other\nend\n${target}`);
    expect(chunksWith(back.chunks!, Op.JumpSym, symbol)[0]).toBe(referring[0]);
    expect(texts(storyBeats(new ProgramStory(back.chunks!)))).toEqual(["Before.", "Other."]);
  });

  it("keeps the locals of the blocks a jump stays in", () => {
    const { actual } = programBeats(
      [
        "scene start",
        "  if true then",
        "    local x = 7",
        "    -> here",
        "    label here",
        "    Value {x}.",
        "  end",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    expect(texts(actual)).toEqual(["Value 7."]);
  });

  it("counts an onward return to the caller's own flow from the caller", () => {
    const { actual } = programBeats(
      [
        "scene start",
        "  -> side ->",
        "  label after",
        "  Visits {start}.",
        "  done",
        "end",
        "scene side",
        "  ->-> start.after",
        "end",
        "",
      ].join("\n"),
    );
    expect(texts(actual)).toEqual(["Visits 1."]);
  });

  it("restores the visits and turns a state's JSON holds", () => {
    const { program } = silence(() =>
      compileScript(
        [
          "scene start",
          "  label top",
          "  & n = n + 1",
          "  Pass {n}, {top}.",
          "  if n < 2 then",
          "    -> top",
          "  end",
          "  done",
          "end",
          "store n = 0",
          "",
        ].join("\n"),
        {},
      ),
    );
    const root = program.chunks!;
    const story = new ProgramStory(root);
    expect(story.Continue()).toBe("Pass 1, 1.\n");
    expect(story.Continue()).toBe("Pass 2, 2.\n");
    expect(story.state.GetVisitCountEntries()).toContainEqual(["start.top", 2]);
    const loaded = new ProgramStory(root);
    loaded.state.LoadJson(story.state.toJson());
    const top = countIdOf(root.table, symbolOf(root, "start.top"));
    expect(loaded.state.VisitCount(top)).toBe(2);
    expect(loaded.state.TurnsSince(top)).toBe(story.state.TurnsSince(top));
  });

  it("counts the labels written right before the label a jump lands on", () => {
    const { actual } = programBeats(
      [
        "scene start",
        "  -> main.beta",
        "end",
        "scene main",
        "  label alpha",
        "  label beta",
        "  Counts {alpha} {beta}.",
        "  label gamma",
        "  label delta",
        "  & n = n + 1",
        "  Then {alpha} {beta} {gamma} {delta}.",
        "  if n < 2 then",
        "    -> delta",
        "  end",
        "  done",
        "end",
        "store n = 0",
        "",
      ].join("\n"),
    );
    expect(texts(actual)).toEqual(["Counts 1 1.", "Then 1 1 1 1.", "Then 1 1 2 2."]);
  });

  it("counts the label above across declarations that run no code", () => {
    const { actual } = programBeats(
      [
        "scene start",
        "  -> main.beta",
        "end",
        "scene main",
        "  if true then",
        "    label alpha",
        "    const X = 1",
        "    store z = 4",
        "    label beta",
        "    Counts {alpha} {beta}.",
        "  end",
        "  label gamma",
        "  const Y = 2",
        "  label delta",
        "  local y = 3",
        "  label epsilon",
        "  & n = n + 1",
        "  Then {gamma} {delta} {epsilon}.",
        "  if n < 2 then",
        "    -> epsilon",
        "  end",
        "  if n < 3 then",
        "    -> delta",
        "  end",
        "  done",
        "end",
        "store n = 0",
        "",
      ].join("\n"),
    );
    expect(texts(actual)).toEqual([
      "Counts 1 1.",
      "Then 1 1 1.",
      "Then 1 1 2.",
      "Then 2 2 3.",
    ]);
  });

  it("counts the first branch a host's evaluation of its scene runs", () => {
    const text = [
      "scene hall",
      "  branch lobby",
      "    Lobby {hall.lobby} {hall}.",
      "    ->->",
      "  end",
      "end",
      "",
    ].join("\n");
    silence(() => {
      const { program } = compileScript(text);
      expect(program.chunks).toBeDefined();
      const actual = new ProgramStory(program.chunks!).EvaluateFunction("hall", [], true);
      expect(actual.output).toBe("Lobby 1 0.\n");
    });
  });

  it("runs no declaration again for an edit that adds a label", () => {
    const s = session(
      ["store x = 1", "scene start", "  Line {x}.", "  done", "end", ""].join("\n"),
    );
    const store = s.compiler.chunkStore!;
    const before = store.initializerRuns;
    const edited = s.edit("  Line {x}.", "  label extra\n  Line {x}.");
    expect(edited.chunks).toBeDefined();
    expect(chunksWith(edited.chunks!, Op.Visit)).toHaveLength(1);
    expect(store.initializerRuns).toBe(before);
  });

  it("keeps an authored label named like a loop's own as a label of its flow through a rename", () => {
    const text = [
      "scene start",
      "  -> A",
      "end",
      "scene A",
      "  label __while_user_loop",
      "  & n = n + 1",
      "  Pass {n}.",
      "  if n < 2 then",
      "    -> __while_user_loop",
      "  end",
      "  done",
      "end",
      "store n = 0",
      "",
    ].join("\n");
    const s = session(text);
    expect(texts(storyBeats(new ProgramStory(s.first.chunks!)))).toEqual(["Pass 1.", "Pass 2."]);
    const coldOf = () =>
      silence(() =>
        programCompiler({ [MAIN_URI]: s.text }).compile().program,
      );
    const renamed = s.edit("-> A\nend\nscene A", "-> B\nend\nscene B");
    expect(describeRoot(renamed.chunks!)).toEqual(describeRoot(coldOf().chunks!));
    expect(texts(storyBeats(new ProgramStory(renamed.chunks!)))).toEqual(["Pass 1.", "Pass 2."]);
    const label = chunksWith(renamed.chunks!, Op.Visit)[0];
    const next = s.edit("Pass {n}.", "Pass {n}!");
    expect(chunksWith(next.chunks!, Op.Visit)[0]).toBe(label);
    expect(describeRoot(next.chunks!)).toEqual(describeRoot(coldOf().chunks!));
    expect(texts(storyBeats(new ProgramStory(next.chunks!)))).toEqual(["Pass 1!", "Pass 2!"]);
  });

  it("keeps a target written in a loop's header as the author's through a rename", () => {
    const text = [
      "scene start",
      "  -> A",
      "end",
      "scene A",
      "  label top",
      "  while READ_COUNT(-> top) > 0 do",
      "    Entered.",
      "    break",
      "  end",
      "  & n = 0",
      "  repeat",
      "    & n = n + 1",
      "  until READ_COUNT(-> top) < n",
      "  Left {n}.",
      "  done",
      "end",
      "",
    ].join("\n");
    const { actual } = programBeats(text);
    expect(texts(actual)).toEqual(["Entered.", "Left 2."]);
    const s = session(text);
    const renamed = s.edit("-> A\nend\nscene A", "-> B\nend\nscene B");
    const cold = silence(
      () => programCompiler({ [MAIN_URI]: s.text }).compile().program,
    );
    expect(describeRoot(renamed.chunks!)).toEqual(describeRoot(cold.chunks!));
    expect(texts(storyBeats(new ProgramStory(renamed.chunks!)))).toEqual(["Entered.", "Left 2."]);
  });

  it("keeps an alternator's count when the statement that writes it is edited", () => {
    const s = session(['scene main', '  Pick {queue|"one"|"two"}.', "  done", "end", ""].join("\n"));
    const first = s.first.chunks!;
    const game = new ProgramStory(first);
    game.ChoosePathString("main");
    expect(game.Continue()).toBe("Pick one.\n");
    while (game.canContinue) {
      game.Continue();
    }
    const saved = game.state.toJson();
    const alternatorOf = (root: ProgramRoot) =>
      chunksWith(root, Op.VisitIndex).map(
        (chunk) =>
          [...new BinaryProgramReader(root).instructions(chunk)].find(
            (i) => i.op === Op.VisitIndex,
          )!.arg,
      );
    const before = alternatorOf(first);
    const edited = s.edit("  Pick", "  Selection").chunks!;
    expect(alternatorOf(edited)).toEqual(before);
    const resumed = new ProgramStory(edited);
    resumed.state.LoadJson(saved);
    resumed.ChoosePathString("main");
    expect(resumed.Continue()).toBe("Selection two.\n");
  });

  it.each([
    [
      "the function they call",
      ["    | Pick {cycle|a(1)|a(2)}.", "    | Pick {cycle|b(1)|b(2)}."],
      ["Pick A1.", "Pick B1.", "Pick A2."],
      "Pick A1.",
    ],
    [
      "the kind of an alternator nested in them",
      ['    | Pick {cycle|"{cycle|1|2}"|"X"}.', '    | Pick {cycle|"{queue|1|2}"|"X"}.'],
      ["Pick 1.", "Pick 1.", "Pick X."],
      "Pick 2.",
    ],
  ])("keeps each alternator's count when arms that differ only by %s swap", (_what, arms, before, after) => {
    const text = (order: string[]) =>
      [
        "store passes = 0",
        "scene main",
        "  label top",
        "  & passes = passes + 1",
        "  cycle",
        ...order,
        "  end",
        "  if passes < 3 then",
        "    -> top",
        "  end",
        "  done",
        "end",
        'function a(x) return "A" .. x end',
        'function b(x) return "B" .. x end',
        "",
      ].join("\n");
    const s = session(text(arms));
    const game = new ProgramStory(s.first.chunks!);
    game.ChoosePathString("main");
    const shown: string[] = [];
    while (game.canContinue) {
      shown.push(game.Continue()!.trim());
    }
    expect(shown.filter(Boolean)).toEqual(before);
    const saved = game.state.toJson();
    const swapped = s.edit(arms.join("\n"), [arms[1], arms[0]].join("\n")).chunks!;
    const resumed = new ProgramStory(swapped);
    resumed.state.LoadJson(saved);
    resumed.ChoosePathString("main");
    expect(resumed.Continue()).toBe(`${after}\n`);
  });

  it("seeds an alternator's shuffle from its own source, which an edit above leaves as it was", () => {
    const s = session(
      [
        "scene first",
        "  Start.",
        "  done",
        "end",
        "scene main",
        "  Pick {shuffle|{f():upper()}|b|c}.",
        "  done",
        "end",
        'function f() return "p" end',
        "",
      ].join("\n"),
    );
    const seedOf = (root: ProgramRoot) => {
      const [chunk] = chunksWith(root, Op.ShuffleIndex);
      const symbol = [...new BinaryProgramReader(root).instructions(chunk!)].find(
        (i) => i.op === Op.ShuffleIndex,
      )!.arg;
      return root.labelOf(symbol);
    };
    const before = seedOf(s.first.chunks!);
    expect(before).toBe("main:6|shuffle|{f():upper()}|b|c");
    const edited = s.edit("  Start.", "  Up {f():upper()}.\n  Start.").chunks!;
    expect(seedOf(edited)).toBe(before);
  });

  it("counts a path chosen without a reset from the flow a loaded or reset story last ran in", () => {
    const text = ["scene main", "  Visits {main}.", "  done", "end", ""].join("\n");
    silence(() => {
      const { program } = compileScript(text);
      expect(program.chunks).toBeDefined();
      const lines = (game: any) => {
        const out: string[] = [];
        while (game.canContinue) {
          out.push(game.Continue().trim());
        }
        return out.filter(Boolean).join(" ");
      };
      const runs = (make: () => any) => {
        const game = make();
        game.ChoosePathString("main");
        const first = lines(game);
        const saved = game.state.toJson();
        const loaded = make();
        loaded.state.LoadJson(saved);
        loaded.ChoosePathString("main", false);
        const afterLoad = lines(loaded);
        game.ChoosePathString("main", false);
        const inSession = lines(game);
        game.ResetCallstack();
        game.ChoosePathString("main", false);
        const afterForcedEnd = lines(game);
        game.ResetState();
        game.ChoosePathString("main", false);
        const afterReset = lines(game);
        return [first, afterLoad, inSession, afterForcedEnd, afterReset];
      };
      const actual = runs(() => new ProgramStory(program.chunks!));
      expect(actual).toEqual(["Visits 1.", "Visits 1.", "Visits 1.", "Visits 2.", "Visits 1."]);
    });
  });

  it("counts a path chosen without a reset from the flow of the thread a fork resumed", () => {
    const text = [
      "scene main",
      "  <- side",
      "end",
      "scene side",
      "  Main {main}.",
      "  Side.",
      "  done",
      "end",
      "",
    ].join("\n");
    silence(() => {
      const { program } = compileScript(text);
      expect(program.chunks).toBeDefined();
      const lines = (game: ProgramStory) => {
        const out: string[] = [];
        while (game.canContinue) {
          out.push(game.Continue()!.trim());
        }
        return out.filter(Boolean).join(" ");
      };
      const game = new ProgramStory(program.chunks!);
      game.ChoosePathString("main");
      expect(game.Continue()).toBe("Main 1.\n");
      const saved = game.state.toJson();
      expect(lines(game)).toBe("Side.");
      game.ChoosePathString("main", false);
      expect(lines(game)).toBe("Main 1. Side.");
      const loaded = new ProgramStory(program.chunks!);
      loaded.state.LoadJson(saved);
      expect(lines(loaded)).toBe("Side.");
      loaded.ChoosePathString("main", false);
      expect(lines(loaded)).toBe("Main 1. Side.");
    });
  });

  it("drops a saved count whose symbol the loading root does not define", () => {
    const s = session(
      ["scene main", "  label extra", "  Extra {extra}.", "  done", "end", ""].join("\n"),
    );
    const game = new ProgramStory(s.first.chunks!);
    game.ChoosePathString("main");
    expect(game.Continue()).toBe("Extra 1.\n");
    const saved = game.state.toJson();
    const without = s.edit("  label extra\n  Extra {extra}.", "  Plain.").chunks!;
    const loaded = new ProgramStory(without);
    loaded.state.LoadJson(saved);
    expect(loaded.state.GetVisitCountEntries().map(([key]) => key)).toEqual(["main"]);
    const resaved = loaded.state.toJson();
    const again = s.edit("  Plain.", "  Plain {extra}.\n  label extra").chunks!;
    const resumed = new ProgramStory(again);
    resumed.state.LoadJson(resaved);
    resumed.ChoosePathString("main", false);
    expect(resumed.Continue()).toBe("Plain 0.\n");
  });

  it("re-emits, for a renamed scene, the chunks that refer to it and no other", () => {
    const text = [
      "scene start",
      "  -> place",
      "end",
      "scene place",
      "  label top",
      "  Top {top}.",
      "  & seen = seen + 1",
      "  if seen < 2 then",
      "    -> top",
      "  end",
      "  Plain line.",
      "  done",
      "end",
      "store seen = 0",
      "",
    ].join("\n");
    const s = session(text);
    const before = new Set(rootChunks(s.first.chunks!));
    const renamed = s.edit("scene place", "scene spot");
    expect(renamed.chunks).toBeDefined();
    const cold = silence(() =>
      programCompiler({ [MAIN_URI]: s.text }).compile().program,
    );
    expect(describeRoot(renamed.chunks!)).toEqual(describeRoot(cold.chunks!));
    const emitted = rootChunks(renamed.chunks!).filter((chunk) => !before.has(chunk));
    const reader = new BinaryProgramReader(renamed.chunks!);
    const names = emitted.map((chunk) =>
      [...reader.instructions(chunk)]
        .filter((i) => [Op.Visit, Op.GetCount, Op.JumpSym].includes(i.op as never))
        .map((i) => renamed.chunks!.table.symbols[i.arg])
        .join(" "),
    );
    expect(names.sort()).toEqual(["spot.top", "spot.top", "spot.top"]);
  });
});

describe("symbols", () => {
  it("interns scenes, branches and labels with their kind and a count id, and resolves each through the root's definition arrays", () => {
    const { program } = silence(() =>
      compileScript(
        [
          "scene start",
          "  Hall.",
          "  label door",
          "  Door.",
          "  -> start.cellar",
          "  branch cellar",
          "    Cellar.",
          "    done",
          "  end",
          "end",
          "",
        ].join("\n"),
        {},
      ),
    );
    const root = program.chunks!;
    const counted = new Set<number>();
    for (const [name, kind] of [
      ["start", SymbolKind.Scene],
      ["start.cellar", SymbolKind.Branch],
      ["start.door", SymbolKind.Label],
    ] as const) {
      const symbol = symbolOf(root, name);
      expect(root.kindOf(symbol), name).toBe(kind);
      const id = countIdOf(root.table, symbol);
      expect(id, name).toBeGreaterThanOrEqual(0);
      counted.add(id);
    }
    expect(counted.size).toBe(3);
    expect(root.parentOf(symbolOf(root, "start.cellar"))).toBe(symbolOf(root, "start"));
    const door = symbolOf(root, "start.door");
    const at = root.place(door)!;
    const chunk = at.sequence.arrays.chunks[at.entry]!;
    expect(chunk[HEADER_WORDS + at.offset]! & 0xff).toBe(Op.Visit);
    expect(chunk[HEADER_WORDS + at.offset + 1]).toBe(door);
    expect(root.definition(door)).toEqual({
      sequence: at.sequence.id,
      entry: at.entry,
      offset: at.offset,
    });
    expect(isAnonymousSymbol(root.table, door)).toBe(false);
  });

  it("reports a label named as another flow's symbol as an error, and makes no program", () => {
    const { program } = silence(() =>
      compileScript(
        ["scene start", "  label cellar", "  Hall.", "  branch cellar", "    Cellar.", "  end", "end", ""].join("\n"),
      ),
    );
    expect(program.chunks).toBeUndefined();
    const errors = Object.values(program.diagnostics ?? {})
      .flat()
      .filter((d) => d.severity === 1)
      .map((d) => [d.range.start.line, typeof d.message === "string" ? d.message : d.message.value]);
    expect(errors).toEqual([
      [1, "This statement cannot be compiled: a label named as another."],
    ]);
  });
});

describe("the chunk store's table", () => {
  it("is the compiler's persistent table, and a reseed between two compiles leaves a game on the first root reading its own generation", () => {
    const text = [
      "store where = -> there",
      "scene start",
      "  Here {start}.",
      "  Still here.",
      "  -> where",
      "end",
      "scene there",
      "  There {there}.",
      "  done",
      "end",
      "",
    ].join("\n");
    const s = session(text);
    const compiler = s.compiler as any;
    const store = s.compiler.chunkStore!;
    expect(store.table).toBe(compiler._binaryTable);
    const first = s.first.chunks!;
    const game = new ProgramStory(first);
    expect(game.Continue()).toBe("Here 1.\n");
    const strings = first.table.strings;
    const generation = first.generation;
    const there = symbolOf(first, "there");
    const grown = strings.length * 2 + 600;
    for (let i = 0; i < grown; i += 1) {
      store.table.strings.push(`unused ${i}`);
    }
    compiler.maybeReseedBinaryTable();
    expect(store.table.generation).toBe(generation + 1);
    expect(first.table.strings).toBe(strings);
    expect(store.table.strings).not.toBe(strings);
    const next = s.edit("  Still here.", "  Still here!");
    const second = next.chunks!;
    expect(second.generation).toBe(generation + 1);
    const old = new Set(rootChunks(first));
    expect(rootChunks(second).some((chunk) => old.has(chunk))).toBe(false);
    expect(s.compiler.lastProgramBuild?.coverage.emitted).toBe(
      s.compiler.lastProgramBuild?.coverage.statements,
    );
    expect(second.symbolFrom(there, generation)).toBe(symbolOf(second, "there"));
    expect(game.Continue()).toBe("Still here.\n");
    expect(game.Continue()).toBe("There 1.\n");
    expect(texts(storyBeats(new ProgramStory(second)))).toEqual(["Here 1.", "Still here!", "There 1."]);
    expect(chunkId(rootChunks(second)[0]!)).toBeGreaterThan(Math.max(...rootChunks(first).map(chunkId)));
  });

  it("moves the ids a reseed renumbers, and loads the counts a state saved before it holds", () => {
    const early = "scene early\n  Early.\n  done\nend\n";
    const s = session(
      [early + "scene start", "  label top", '  Pick {cycle|"a"|"b"} {top}.', "  done", "end", ""].join("\n"),
    );
    const compiler = s.compiler as any;
    const store = s.compiler.chunkStore!;
    const before = s.edit(early, "").chunks!;
    const generation = before.generation;
    const top = symbolOf(before, "start.top");
    const game = new ProgramStory(before);
    expect(texts(storyBeats(game))).toEqual(["Pick a 1."]);
    const saved = game.state.toJson();
    const grown = store.table.strings.length * 2 + 600;
    for (let i = 0; i < grown; i += 1) {
      store.table.strings.push(`unused ${i}`);
    }
    compiler.maybeReseedBinaryTable();
    expect(store.table.generation).toBe(generation + 1);
    const after = s.edit("  Pick", "  Picked").chunks!;
    expect(after.generation).toBe(generation + 1);
    const moved = symbolOf(after, "start.top");
    expect(moved).not.toBe(top);
    expect(after.symbolFrom(top, generation)).toBe(moved);
    const resumed = new ProgramStory(after);
    resumed.state.LoadJson(saved);
    expect(resumed.state.VisitCount(countIdOf(after.table, moved))).toBe(1);
    resumed.ChoosePathString("start");
    expect(resumed.Continue()).toBe("Picked b 2.\n");
  });
});

describe("the flow screenplay", () => {
  it("runs each scene", () => {
    const text = flowScreenplay(3);
    for (const [scene, count, first, last] of [
      ["FLOW_0", 29, "1 time, top 1.", "The end, after 3 passes."],
      ["FLOW_1", 28, "1 time, top 1.", "After 1, mid 1, k 2."],
      ["FLOW_2", 29, "1 time, top 1.", "The end, after 3 passes."],
      ["ENDING", 1, "The end, after 0 passes.", "The end, after 0 passes."],
    ] as const) {
      const { actual } = programBeats(text, scene);
      expect(actual.errors).toEqual([]);
      const shown = texts(actual);
      expect([shown.length, shown[0], shown.at(-1)], scene).toEqual([count, first, last]);
    }
  });
});
