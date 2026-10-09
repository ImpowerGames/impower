// The compiler's incremental equivalence oracles run on the binary program
// back end (#701): `incrementalEquivalence`, `incrementalCumulativeEquivalence`
// and `incrementalSyntheticAppend` (in ../compiler), and the interleaved-preview
// oracle of `previewCompileRestore.test.ts` (branch
// perf/652-preview-restore-parse), each with statement chunks on
// (`programChunks`). After each edit a persistent compiler's program is
// compared with a cold compile of the same text: whether it falls back and
// for what, its chunks by content (`describeRoot`), the qualified names its
// root defines with their kinds, and its diagnostics.
//
// Half of the randomized edits land inside the bodies of block statements
// (an `if`, a loop, a function, a `choose` block's choice bodies and its
// `then` clause), where an edit changes a body and leaves its owner's chunk
// as it was: keystrokes inside a body line, whole lines inserted at the
// body's indentation (a line of dialogue, a `local`, a call, a divert, an
// `end`, a `then`, a new block), and a body line deleted.
//
// Last, a preview compile's root is checked to share with the real root, by
// identity, every chunk and every array it did not change, and to leave the
// real root's arrays as they were; and a body an edit removed has no row in
// the root it leaves.
import { describe, expect, it } from "vitest";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import type { ProgramRoot, SequenceRow } from "../../program/ProgramRoot";
import { isAnonymousSymbol, UNDEFINED_KIND } from "../../program/ProgramSymbols";
import {
  B_SEQUENCE,
  blockCount,
  blockField,
  type ProgramChunk,
} from "../../program/ProgramChunk";
import {
  coupledScreenplay,
  cumulativeScreenplay,
} from "../compiler/fixtures/coupledScreenplay";
import { AUTO_GLOBAL_INSERTS, autoGlobalScreenplay } from "./autoGlobalScreenplay";
import { CHOOSE_INSERTS, chooseScreenplay } from "./chooseScreenplay";
import { describeRoot, MAIN_URI, programCompiler, rootChunks } from "./programHarness";

// As programChunkIdentity's `session` compiles.
const CONFIG = { seedBuiltinsIntoStory: true };

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

function stable(value: unknown): string {
  const seen = new WeakSet();
  const walk = (v: any): any => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

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

const clip = (s: string | undefined, n = 240) =>
  s === undefined ? "(none)" : s.length > n ? `${s.slice(0, n)}...` : s;

/** The qualified names a root defines, each with its kind, sorted. An
 *  anonymous symbol has no stable name and is left out. */
const definedSymbols = (root: ProgramRoot): string[] => {
  const out: string[] = [];
  root.table.symbols.forEach((name, id) => {
    if (root.kindOf(id) !== UNDEFINED_KIND && !isAnonymousSymbol(root.table, id)) {
      out.push(`${JSON.stringify(name)}:${root.kindOf(id)}`);
    }
  });
  return out.sort();
};

/** What an incremental compile and a cold compile of the same text must
 *  agree on. */
interface Surface {
  /** Whether the compile reported an error, which a compile that builds no
   *  chunks does for the statement it could not compile. */
  reportsError: boolean;
  chunks: string[] | null;
  symbols: string[] | null;
  diagnostics: string[];
}

const surface = (program: SparkProgram): Surface => ({
  reportsError: Object.values(program.diagnostics ?? {})
    .flat()
    .some((d) => d.severity === 1),
  chunks: program.chunks ? describeRoot(program.chunks) : null,
  symbols: program.chunks ? definedSymbols(program.chunks) : null,
  diagnostics: Object.keys(program.diagnostics ?? {})
    .sort()
    .flatMap((uri) =>
      ((program.diagnostics as Record<string, unknown[]>)[uri] ?? []).map(
        (d) => `${uri} ${stable(d)}`,
      ),
    ),
});

const coldSurface = (text: string): Surface =>
  quiet(() => surface(programCompiler({ [MAIN_URI]: text }, CONFIG).compile().program));

const firstDifference = (a: readonly string[], b: readonly string[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return i;
  }
  return -1;
};

/** How `incremental` differs from `cold`, field by field, or nothing. */
function divergence(incremental: Surface, cold: Surface): string | undefined {
  const fields: string[] = [];
  // A compile that built no root and reported no error threw on its way (a
  // failed `ChunkStore.verifyBuilds`, which the compiler logs and the tests
  // silence): that is a failure on either side, even when both sides fail
  // alike, and a root on one side alone is a divergence. The diagnostics,
  // compared below, hold the error of a statement the compile could not
  // compile.
  if (!incremental.chunks && !incremental.reportsError) {
    fields.push("incremental compile built no root and reported no error");
  }
  if (!cold.chunks && !cold.reportsError) {
    fields.push("cold compile built no root and reported no error");
  }
  if (!!incremental.chunks !== !!cold.chunks) {
    fields.push(
      `chunks ${incremental.chunks ? "built" : "missing"} vs cold ${cold.chunks ? "built" : "missing"}`,
    );
  }
  if (!!incremental.symbols !== !!cold.symbols) {
    fields.push(
      `symbols ${incremental.symbols ? "defined" : "missing"} vs cold ${cold.symbols ? "defined" : "missing"}`,
    );
  }
  if (incremental.chunks && cold.chunks) {
    const i = firstDifference(incremental.chunks, cold.chunks);
    if (i >= 0) {
      fields.push(
        `chunks at line ${i} of ${incremental.chunks.length}/${cold.chunks.length}: ${clip(incremental.chunks[i])} vs cold ${clip(cold.chunks[i])}`,
      );
    }
  }
  if (incremental.symbols && cold.symbols) {
    const have = new Set(incremental.symbols);
    const want = new Set(cold.symbols);
    const extra = incremental.symbols.filter((s) => !want.has(s));
    const missing = cold.symbols.filter((s) => !have.has(s));
    if (extra.length || missing.length) {
      fields.push(`symbols extra ${clip(extra.join(" "))} missing ${clip(missing.join(" "))}`);
    }
  }
  const d = firstDifference(incremental.diagnostics, cold.diagnostics);
  if (d >= 0) {
    fields.push(
      `diagnostics at ${d} of ${incremental.diagnostics.length}/${cold.diagnostics.length}: ${clip(incremental.diagnostics[d])} vs cold ${clip(cold.diagnostics[d])}`,
    );
  }
  return fields.length ? fields.join(" | ") : undefined;
}

/** A deterministic LCG (no Math.random), as the compiler oracles draw. */
const lcg = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
};

// ---- Edits inside the bodies of block statements ---------------------------

// The head of a block statement whose body is the lines indented below it.
const BLOCK_HEAD =
  /^(?:if\b.*\bthen$|elseif\b.*\bthen$|else$|while\b.*\bdo$|for\b.*\bdo$|do$|repeat$|(?:local\s+)?function\b|choose$|then\b|[*+]\s)/;

interface BodyLine {
  /** The line's index, where it starts, its length and its indentation. */
  line: number;
  from: number;
  length: number;
  indent: string;
  /** How many block statements enclose it. */
  depth: number;
}

/** The lines of `text` inside the bodies of block statements: each line whose
 *  nearest less indented line above it is the head of a block statement, or
 *  is itself inside one. */
function bodyLines(text: string): BodyLine[] {
  const lines = text.split("\n");
  const indentOf = (l: string) => l.length - l.trimStart().length;
  const depth = new Array<number>(lines.length).fill(0);
  const out: BodyLine[] = [];
  const stack: number[] = [];
  let from = 0;
  lines.forEach((l, i) => {
    const start = from;
    from += l.length + 1;
    if (!l.trim()) return;
    const indent = indentOf(l);
    while (stack.length && indentOf(lines[stack.at(-1)!]!) >= indent) stack.pop();
    const enclosing = stack.at(-1);
    if (enclosing !== undefined) {
      depth[i] = depth[enclosing]! + (BLOCK_HEAD.test(lines[enclosing]!.trim()) ? 1 : 0);
      if (depth[i]! > 0) {
        out.push({ line: i, from: start, length: l.length, indent: l.slice(0, indent), depth: depth[i]! });
      }
    }
    stack.push(i);
  });
  return out;
}

interface RandomEdit {
  offset: number;
  end: number;
  insert: string;
  /** Where the edit was drawn: over the whole text, or inside a body, and
   *  how. */
  kind: string;
}

/** Draws edits of a text: half at offsets drawn over the whole text, as the
 *  compiler oracles draw them, and half inside the bodies of block
 *  statements, two in five of those in a body two or more blocks deep when
 *  the text has one. An edit inside a body inserts a whole line above a body
 *  line at its indentation, deletes a body line, or types one of `inserts`
 *  inside a body line, deleting a few characters a third of the time. */
function editDrawer(
  rand: () => number,
  inserts: readonly string[],
  lines: readonly string[],
) {
  return (text: string): RandomEdit => {
    if (rand() < 0.5) {
      const bodies = bodyLines(text);
      if (bodies.length) {
        const deep = bodies.filter((b) => b.depth >= 2);
        const pool = deep.length && rand() < 0.4 ? deep : bodies;
        const body = pool[Math.floor(rand() * pool.length)]!;
        const shape = rand();
        const where = `depth ${body.depth} line ${body.line}`;
        if (shape < 0.45) {
          const line = lines[Math.floor(rand() * lines.length)]!;
          return { offset: body.from, end: body.from, insert: `${body.indent}${line}\n`, kind: `body line insert, ${where}` };
        }
        if (shape < 0.6) {
          return {
            offset: body.from,
            end: Math.min(body.from + body.length + 1, text.length),
            insert: "",
            kind: `body line delete, ${where}`,
          };
        }
        const offset = body.from + body.indent.length + Math.floor(rand() * (body.length - body.indent.length + 1));
        const deleted = rand() < 0.3 ? 1 + Math.floor(rand() * 6) : 0;
        return {
          offset,
          end: Math.min(offset + deleted, text.length),
          insert: inserts[Math.floor(rand() * inserts.length)]!,
          kind: `body keystroke, ${where}`,
        };
      }
    }
    const insert = inserts[Math.floor(rand() * inserts.length)]!;
    const deleted = rand() < 0.4 ? Math.min(1 + Math.floor(rand() * 8), 14) : 0;
    const offset = Math.floor(rand() * text.length);
    return { offset, end: Math.min(offset + deleted, text.length), insert, kind: "uniform" };
  };
}

/** Applies a minimal-range edit to the main script of `compiler`. */
function update(
  compiler: SparkdownCompiler,
  text: string,
  version: number,
  offset: number,
  end: number,
  insert: string,
): string {
  compiler.updateDocument({
    textDocument: { uri: MAIN_URI, version },
    contentChanges: [{ range: { start: posAt(text, offset), end: posAt(text, end) }, text: insert }],
  });
  return text.slice(0, offset) + insert + text.slice(end);
}

/** A record of one edit's divergence, with the line it was made in. */
const record = (n: number, text: string, edit: RandomEdit, detail: string) => {
  const lineStart = text.lastIndexOf("\n", edit.offset - 1) + 1;
  const lineEnd = text.indexOf("\n", edit.offset);
  const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
  return `#${n} [${edit.kind}] insert=${JSON.stringify(edit.insert)} del=${edit.end - edit.offset} @${edit.offset} (line ${posAt(text, edit.offset).line}: ${JSON.stringify(clip(line, 80))}) -> ${detail}`;
};

// Whole lines the edits inside bodies insert into the coupled screenplays: a
// line of dialogue, a line of action, a local, a call, a divert, an `end`, a
// `then`, a new block, a closure, a loop's head and its `break`, and a
// `choose` block's head (#1683).
const COUPLED_LINES = [
  "hero: A new line of dialogue.",
  "A new line of action.",
  "local x = 1",
  "& trust = bonus(trust)",
  "-> scene_5",
  "end",
  "then",
  "if trust > 1 then",
  "& local h = function(n) return n + 1 end",
  "while trust < 1 do",
  "break",
  "choose",
];

// Whole lines the edits inside bodies insert into the choose screenplay.
const CHOOSE_LINES = [
  "HERO: A new line of dialogue.",
  "Another line of the body.",
  "local x = 1",
  "& gold = gold + 1",
  "-> top",
  "end",
  "then",
  "* A new choice",
  "if gold > 1 then",
  "for i = 1, 2 do",
  "choose",
];

// ---- incrementalEquivalence ------------------------------------------------

// The warm-up of incrementalEquivalence's `warmed` (not exported, so copied):
// two one-character edits of lines of dialogue, compiled after each, so that
// the edit under test reaches a compiler whose store was left by incremental
// compiles. They keep the text's length.
const WARM_EDITS: [string, string][] = [
  ["Line one of dialogue in scene 3.", "Line one of dialogue in scene 3!"],
  ["Line one of dialogue in scene 4.", "Line one of dialogue in scene 4!"],
];
const warmText = (text: string) =>
  WARM_EDITS.reduce((t, [find, replace]) => t.replace(find, replace), text);
const AFTER_WARM = WARM_EDITS.length + 2;

/** A compiler over `text` with chunks on, compiled and then warmed up. */
function warmed(text: string) {
  const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
  c.compile();
  let main = text;
  let version = 1;
  for (const [find, replace] of WARM_EDITS) {
    const offset = main.indexOf(find);
    expect(offset, `the warm-up line "${find}" is present`).toBeGreaterThanOrEqual(0);
    version += 1;
    main = update(c.compiler, main, version, offset, offset + find.length, replace);
    c.compile();
  }
  return { c, text: main };
}

interface Edit {
  name: string;
  find: string;
  replace: string;
}

// incrementalEquivalence's diverse edits and the find and replace of its
// carried edits, then edits inside the bodies of the fixture's block
// statements: an `if` body in a scene, a choice body and the `then` clause of
// the `choose` block, and the loops inside the function `reckon`.
const EDITS: Edit[] = [
  { name: "same-line char insert in dialogue", find: "Line one of dialogue in scene 5.", replace: "Line one of dialogue in scene 5x." },
  { name: "newline insert (shifts lines below)", find: "Action describing room 6 in some detail here.", replace: "Action describing room 6 in some detail here.\n  An extra action line." },
  { name: "edit define table value", find: "speed = 5", replace: "speed = 9" },
  { name: "add read-count reference (visit-count coupling)", find: "Not yet in scene 7.", replace: "Not yet in scene 7, {scene_2}." },
  { name: "remove a cross-flow divert", find: "-> scene_10", replace: "-> DONE" },
  { name: "lengthen a line above continuations (moves them)", find: "Line one of dialogue in scene 2.", replace: "Line one of dialogue in scene 2, said at much greater length." },
  { name: "add a continuation above others (renumbers their groups)", find: "-> scene_6", replace: "hero: A new glued line ..\n.. said here.\n-> scene_6" },
  { name: "change function body", find: "return x * 2 + 1", replace: "return x * 3 + 1" },
  { name: "edit store initial value", find: "store trust = 0", replace: "store trust = 1" },
  { name: "rename a scene (cross-flow divert target)", find: "scene scene_4", replace: "scene scene_renamed" },
  { name: "delete a whole line above many flows", find: "store visited_count = 0\n", replace: "" },
  { name: "append a whole new scene at end", find: 'layout hud with\n  text "{trust} {t.a}"\nend\n', replace: 'layout hud with\n  text "{trust} {t.a}"\nend\n\nscene scene_extra\n= INT. NEW - DAY\n:\n  Brand new action.\n-> DONE\nend\n' },
  { name: "insert a top-level function at the top of the file", find: "define hero as character with", replace: "function later()\n  return 7\nend\n\ndefine hero as character with" },
  { name: "insert a define at the top of the file", find: "define hero as character with", replace: "define thing with\n  x = 1\nend\n\ndefine sidekick as thing with\n  x = 2\nend\n\ndefine hero as character with" },
  { name: "insert a tag line at the top of the file", find: "define hero as character with", replace: "# opening\n\ndefine hero as character with" },
  { name: "change a function's parameter list", find: "function bonus(x):", replace: "function bonus(x, y):" },
  { name: "rename a callee", find: "function bonus(", replace: "function bonus_renamed(" },
  { name: "edit a line of the then clause below a choice", find: "The rest of the scene runs on here.", replace: "The rest of the scene runs on and on here." },
  { name: "edit a loop body inside a function", find: "    t.a = t.a + i", replace: "    t.a = t.a + i * 2" },
  { name: "edit a layout binding", find: '  text "{trust} {t.a}"', replace: '  text "{trust} {t.b}"' },
  { name: "insert dialogue into an if body", find: "  hero: I trust you in scene 3.\n", replace: "  hero: I trust you in scene 3.\n  hero: And more.\n" },
  { name: "insert a local into an else body", find: "  hero: Not yet in scene 8.\n", replace: "  local x = 1\n  hero: Not yet in scene 8.\n" },
  { name: "insert a line into a choice body", find: "    You press on.\n", replace: "    You press on.\n    hero: Quickly now.\n" },
  { name: "insert an if into the then clause", find: "    The way opens.\n", replace: "    The way opens.\n    if trust > 1 then\n      hero: Inside the clause.\n    end\n" },
  { name: "insert a divert into the then clause", find: "    The way opens.\n", replace: "    -> scene_2\n    The way opens.\n" },
  // A loop and a `choose` block in the clause, which the edits after this one
  // serve from their memos when they lower the clause again (#1683).
  {
    name: "insert a loop and a choose block into the then clause",
    find: "    The way opens.\n",
    replace: "    The way opens.\n    while trust < 1 do\n      & trust = trust + 1\n    end\n    choose\n      * (inner_pick) [Inner]\n        Inner.\n    then (inner_after)\n      After the inner block.\n    end\n",
  },
  // The finds below are left intact by the edits above them, so that the
  // sequential run makes every edit.
  { name: "delete a line of the then clause", find: "    & t.a += 1\n", replace: "" },
  { name: "insert a line into a loop inside a function", find: "    t.b = t.b + 1\n", replace: "    local y = 1\n    t.b = t.b + y\n" },
  { name: "insert an end into a loop inside a function", find: "  for i = 1, 2 do\n", replace: "  for i = 1, 2 do\n    end\n" },
  { name: "insert a then into an if body", find: "  hero: I trust you in scene 5.\n", replace: "  then\n  hero: I trust you in scene 5.\n" },
  { name: "insert a call into a function body", find: "  local x\n", replace: "  local x\n  bonus(1)\n" },
];

describe("incrementalEquivalence on the binary program", () => {
  // The fixture is incrementalEquivalence's coupled screenplay: fourteen
  // scenes coupled by diverts, read counts and a define, each with an
  // `if ... else ... end`, then the constructs of `constructs()`, which hold
  // a `choose` block with choice bodies and a `then` clause, and a function
  // whose body holds a `for` and a `while` loop (bodies two deep).
  it("compiles the fixture cold to its chunks", () => {
    const cold = coldSurface(coupledScreenplay());
    expect(cold.chunks).not.toBeNull();
    expect(bodyLines(coupledScreenplay()).filter((b) => b.depth >= 2).length).toBeGreaterThan(0);
  });

  for (const edit of EDITS) {
    it(`incremental == cold for edit: ${edit.name}`, () => {
      quiet(() => {
        const { c, text } = warmed(coupledScreenplay());
        const offset = text.indexOf(edit.find);
        expect(offset, `find "${edit.find}" present`).toBeGreaterThanOrEqual(0);
        const after = update(c.compiler, text, AFTER_WARM, offset, offset + edit.find.length, edit.replace);
        const incremental = surface(c.compile().program);
        expect(divergence(incremental, coldSurface(after)) ?? "none").toBe("none");
      });
    }, 120_000);
  }

  it("incremental == cold across the full diverse edit sequence on ONE compiler", () => {
    quiet(() => {
      let text = coupledScreenplay();
      const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
      c.compile();
      const failures: string[] = [];
      EDITS.forEach((edit, n) => {
        const offset = text.indexOf(edit.find);
        if (offset < 0) {
          failures.push(`#${n} ${edit.name}: find not present`);
          return;
        }
        text = update(c.compiler, text, n + 2, offset, offset + edit.find.length, edit.replace);
        const detail = divergence(surface(c.compile().program), coldSurface(text));
        if (detail) failures.push(`#${n} ${edit.name} -> ${detail}`);
      });
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
    });
  }, 300_000);

  it("incremental == cold under randomized edits, half inside nested blocks (fuzz, one edit per compiler)", () => {
    quiet(() => {
      const base = warmText(coupledScreenplay());
      const rand = lcg(0x2f6e2b1);
      // incrementalEquivalence's inserts.
      const inserts = ["x", "\n", " ", "1", "}", "{", "{trust}", "// c", "->", "end", ")", "", "# t", "then", ":add(1)", " += 1", "{t.a}", "function() return 1 end", "\ndefine thing with\n"];
      const draw = editDrawer(rand, inserts, COUPLED_LINES);
      const failures: string[] = [];
      let compiles = 0;
      let chunked = 0;
      let nested = 0;
      const EDIT_COUNT = 36;
      for (let n = 0; n < EDIT_COUNT; n++) {
        const edit = draw(base);
        if (edit.insert === "" && edit.end === edit.offset) continue;
        const { c } = warmed(coupledScreenplay());
        const after = update(c.compiler, base, AFTER_WARM, edit.offset, edit.end, edit.insert);
        const program = c.compile().program;
        compiles += 1;
        if (program.chunks) chunked += 1;
        if (edit.kind !== "uniform") nested += 1;
        const detail = divergence(surface(program), coldSurface(after));
        if (detail) failures.push(record(n, base, edit, detail));
      }
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
      // Most edits keep the program within what the writer emits, and about
      // half land inside blocks, so the comparisons covered chunks.
      expect(chunked, `compiles that built chunks, of ${compiles}`).toBeGreaterThan(compiles / 2);
      expect(nested, `edits inside bodies, of ${compiles}`).toBeGreaterThan(compiles / 4);
    });
  }, 600_000);
});

// ---- A statement an edit moves into a body or out of one --------------------

// The single-edit fuzz above found an `end` typed into a choice body above a
// `then` clause whose last statement writes a closure: the `end` closes the
// `choose`, so the closure's statement moves out of the clause into the
// scene, with its text and column unchanged. A cold compile gives the
// statement's chunk a line table of two rows when the statement stands in a
// flow's own sequence (a second row at the closure's code, offset 16) and of
// one row inside a block's body; these pin the move both ways on the
// smallest script that shows it.
describe("a closure statement an edit moves between a scene and a block body", () => {
  const moved = (text: string, find: string, deleted: number, insert: string) =>
    quiet(() => {
      const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
      expect(c.compile().program.chunks).toBeDefined();
      const offset = text.indexOf(find);
      expect(offset, find).toBeGreaterThanOrEqual(0);
      const after = update(c.compiler, text, 2, offset, offset + deleted, insert);
      const program = c.compile().program;
      expect(program.chunks).toBeDefined();
      return divergence(surface(program), coldSurface(after)) ?? "none";
    });

  it("gives the statement the line table of a cold compile when it moves into an if body", () => {
    const text = "scene S\n  Before.\n  if true then\n    Inside.\n  end\n  & local f = function(n) return n + 1 end\nend\n";
    // Deletes the `end` line above the statement, which then ends the
    // `if` body.
    expect(moved(text, "  end\n  & local", "  end\n".length, "")).toBe("none");
  }, 60_000);

  it("gives the statement the line table of a cold compile when it moves out of an if body", () => {
    const text = "scene S\n  Before.\n  if true then\n    Inside.\n    & local f = function(n) return n + 1 end\n  end\nend\n";
    // Inserts an `end` line above the body, which closes the `if`.
    expect(moved(text, "    Inside.", 0, "    end\n")).toBe("none");
  }, 60_000);
});

// ---- incrementalCumulativeEquivalence --------------------------------------

// incrementalCumulativeEquivalence's shaped edits (not exported, so copied),
// each a pair of texts the edit toggles between.
const SHAPED_EDITS: [string, string][] = [
  ["store trust = 0", "function later()\n  return 7\nend\n\nstore trust = 0"],
  [
    "define hero as character with",
    "define thing with\n  x = 1\nend\n\ndefine sidekick as thing with\n  x = 2\nend\n\ndefine hero as character with",
  ],
  ["function bonus(x):", "function bonus(x, y):"],
  ["function bonus(", "function bonus_b("],
];

/** The edit that puts back what `edit` changed in `text`. */
const inverseOf = (text: string, edit: RandomEdit): RandomEdit => ({
  offset: edit.offset,
  end: edit.offset + edit.insert.length,
  insert: text.slice(edit.offset, edit.end),
  kind: "undo",
});

/** Runs `count` random edits of `text` through one compiler, comparing each
 *  compile with a cold one, and returns the divergences and how many
 *  compiles built chunks and how many edits landed inside bodies. With
 *  `undoFallback`, an edit after which the program fell back is undone by
 *  the next one, as `cumulativeEdits` does, so that the run spends most of
 *  its edits on a program that has its chunks. */
function cumulativeRun(
  text: string,
  seed: number,
  count: number,
  inserts: readonly string[],
  lines: readonly string[],
  shaped: readonly [string, string][] = [],
  undoFallback = false,
) {
  const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
  c.compile();
  const rand = lcg(seed);
  const draw = editDrawer(rand, inserts, lines);
  const failures: string[] = [];
  let chunked = 0;
  let nested = 0;
  // Statements of bodies the compiles served from their memos (#656).
  let served = 0;
  let version = 1;
  let undo: RandomEdit | undefined;
  for (let n = 0; n < count; n++) {
    let edit = draw(text);
    if (undo) {
      edit = undo;
      undo = undefined;
    }
    if (edit.insert === "\ndefine header with\n") {
      // A name declared twice stops the cold compile resolving the rest of
      // the script (#979), so each header takes a name of its own.
      edit = { ...edit, insert: `\ndefine header_${n} with\n` };
    }
    if (edit.kind !== "undo" && shaped.length && rand() < 0.1) {
      const [a, b] = shaped[Math.floor(rand() * shaped.length)]!;
      const [find, replace] = text.includes(b) ? [b, a] : [a, b];
      if (text.includes(find)) {
        const offset = text.indexOf(find);
        edit = { offset, end: offset + find.length, insert: replace, kind: "shaped" };
      }
    }
    if (edit.insert === "" && edit.end === edit.offset) continue;
    version += 1;
    const before = text;
    text = update(c.compiler, text, version, edit.offset, edit.end, edit.insert);
    const program = c.compile().program;
    served += c.compiler.memoStats(MAIN_URI)?.served ?? 0;
    if (program.chunks) chunked += 1;
    else if (undoFallback && edit.kind !== "undo") undo = inverseOf(before, edit);
    if (!["uniform", "shaped", "undo"].includes(edit.kind)) nested += 1;
    const detail = divergence(surface(program), coldSurface(text));
    if (detail) failures.push(record(n, before, edit, detail));
  }
  return { failures, chunked, nested, served };
}

describe("incrementalCumulativeEquivalence on the binary program", () => {
  // The cumulative oracle's fixture: the coupled screenplay without the
  // `cfg` define and the glued continuations, with the same blocks.
  it("incremental == cold across many cumulative edits on ONE compiler, half inside nested blocks", () => {
    quiet(() => {
      expect(coldSurface(cumulativeScreenplay()).chunks).not.toBeNull();
      const inserts = ["x", "\n", " ", "1", "}", "{", "{trust}", "// c", "->", "end", ")", "", "{scene_2}", "hero:", "-> scene_5", "\n& f = function() return 9 end\n", "then", ":add(1)", " += 1", "{t.a}", "function() return 1 end", "\ndefine header with\n"];
      const EDIT_COUNT = 140;
      const { failures, chunked, nested, served } = cumulativeRun(
        cumulativeScreenplay(),
        0x51ed5,
        EDIT_COUNT,
        inserts,
        COUPLED_LINES,
        SHAPED_EDITS,
      );
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
      expect(chunked, "compiles that built chunks").toBeGreaterThan(EDIT_COUNT / 3);
      expect(nested, "edits inside bodies").toBeGreaterThan(EDIT_COUNT / 4);
      // Edits inside the bodies leave some of their statements to their
      // memos (#656).
      expect(served, "statements served from their memos").toBeGreaterThan(0);
    });
  }, 600_000);

  // The choose screenplay (written to run from chunks) nests deeper than the
  // coupled one: a choice gated by an `if` inside a `choose`, a `choose`
  // inside a sticky choice's body, and an `if` inside a `then` clause.
  it("incremental == cold across many cumulative edits of the choose screenplay, half inside nested blocks", () => {
    quiet(() => {
      const text = chooseScreenplay(2);
      expect(coldSurface(text).chunks).not.toBeNull();
      expect(bodyLines(text).filter((b) => b.depth >= 3).length).toBeGreaterThan(0);
      const EDIT_COUNT = 70;
      // An edit of a `choose` block's structure (an `end`, a `then`, a
      // choice outside a `choose`) can leave a program that falls back as a
      // whole, which the edits after it would not repair, so an edit after
      // which the program fell back is undone by the next one.
      const { failures, chunked, nested, served } = cumulativeRun(text, 0x697a1, EDIT_COUNT, CHOOSE_INSERTS, CHOOSE_LINES, [], true);
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
      expect(chunked, "compiles that built chunks").toBeGreaterThan(EDIT_COUNT / 3);
      expect(nested, "edits inside bodies").toBeGreaterThan(EDIT_COUNT / 4);
      expect(served, "statements served from their memos").toBeGreaterThan(0);
    });
  }, 600_000);
});

// ---- Long block bodies, served from their memos ----------------------------

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

// ---- Loops and `choose` blocks in long bodies, served from their memos -------

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

// ---- incrementalSyntheticAppend --------------------------------------------

// incrementalSyntheticAppend's `base` (not exported, so copied): six scenes
// of two action lines each.
function syntheticBase() {
  const L: string[] = [];
  for (let s = 0; s < 6; s++) {
    L.push(`scene scene_${s}`);
    L.push(":");
    L.push(`  Room ${s} line one.`);
    L.push(`  Room ${s} line two.`);
    L.push(`-> scene_${(s + 1) % 6}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

// The same scenes, each with an `if` whose body holds a `for` loop, so that
// anonymous functions can be appended into bodies one and two blocks deep.
function syntheticNestedBase() {
  const L: string[] = ["store visits = 0", ""];
  for (let s = 0; s < 6; s++) {
    L.push(`scene scene_${s}`);
    L.push(`  Room ${s} line one.`);
    L.push(`  if visits < 9 then`);
    L.push(`    Room ${s} inside the if.`);
    L.push("    for i = 1, 2 do");
    L.push(`      Room ${s} loop {i}.`);
    L.push("    end");
    L.push("  end");
    L.push(`  Room ${s} line two.`);
    L.push(`  -> scene_${(s + 1) % 6}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

describe("incrementalSyntheticAppend on the binary program", () => {
  const run = (text: string, steps: Edit[]) =>
    quiet(() => {
      expect(coldSurface(text).chunks).not.toBeNull();
      const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
      c.compile();
      const log: string[] = [];
      steps.forEach((step, i) => {
        const offset = text.indexOf(step.find);
        expect(offset, `find ${step.find}`).toBeGreaterThanOrEqual(0);
        text = update(c.compiler, text, i + 2, offset, offset + step.find.length, step.replace);
        const program = c.compile().program;
        const detail = divergence(surface(program), coldSurface(text));
        log.push(`step ${i + 1} ${step.name}: ${program.chunks ? "chunks" : "no chunks"} ${detail ?? "ok"}`);
      });
      return log;
    });

  it("adding an anonymous fn into an existing scene body stays == cold", () => {
    const log = run(syntheticBase(), [
      { name: "warm", find: "Room 5 line one.", replace: "Room 5 line ONE." },
      { name: "append into scene_2", find: "  Room 2 line two.", replace: "  Room 2 line two.\n& local f = function(x) return x + 1 end" },
      { name: "append into scene_1", find: "  Room 1 line two.", replace: "  Room 1 line two.\n& local g = function(y) return y + 2 end" },
    ]);
    expect(log.filter((l) => !l.endsWith(" ok"))).toEqual([]);
  }, 120_000);

  it("adding anonymous fns into the bodies of nested blocks stays == cold", () => {
    const log = run(syntheticNestedBase(), [
      { name: "warm", find: "Room 5 line one.", replace: "Room 5 line ONE." },
      { name: "append into the loop of scene_2", find: "      Room 2 loop {i}.", replace: "      Room 2 loop {i}.\n      & local f = function(x) return x + 1 end" },
      { name: "append into the if of scene_1", find: "    Room 1 inside the if.", replace: "    Room 1 inside the if.\n    & local g = function(y) return y + 2 end" },
      { name: "append into the loop of scene_0", find: "      Room 0 loop {i}.", replace: "      Room 0 loop {i}.\n      local h = function(z) return z * 2 end" },
      { name: "remove the one of scene_1", find: "\n    & local g = function(y) return y + 2 end", replace: "" },
      { name: "edit the one of scene_2", find: "return x + 1", replace: "return x + 3" },
    ]);
    expect(log.filter((l) => !l.endsWith(" ok"))).toEqual([]);
  }, 120_000);
});

// ---- Auto-globals and functions of their names ------------------------------

// The program path's resolver resolves only the statements whose resolution
// can read otherwise, and a bare assignment makes a global of its name only
// where a cold compile's resolution reaches it, a function of the name
// winning for a call (#1607). The three oracles above, over a screenplay of
// auto-globals read before and after their assignments, in scenes and
// functions, and globals named like functions: whole lines of assignments,
// reads, `local`s, declarations and functions of those names are written,
// moved and removed.
const AUTO_LINES = [
  "tally = 4",
  "score = 2",
  "Read {tally} {score} {looped}.",
  "local tally = 1",
  "& score()",
  "& seen = bump(seen)",
  "late_1 = 3",
  "end",
];

describe("the oracles over auto-globals and functions of their names", () => {
  it("compiles the fixture cold to its chunks, with auto-globals read before their assignments", () => {
    const cold = coldSurface(autoGlobalScreenplay(4));
    expect(cold.chunks).not.toBeNull();
    expect(cold.diagnostics.some((d) => d.includes("Cannot find variable named `tally`"))).toBe(true);
  });

  it("incremental == cold under randomized edits (fuzz, one edit per compiler)", () => {
    quiet(() => {
      const base = autoGlobalScreenplay(4);
      const rand = lcg(0x1607a);
      const draw = editDrawer(rand, AUTO_GLOBAL_INSERTS, AUTO_LINES);
      const failures: string[] = [];
      let chunked = 0;
      const EDIT_COUNT = 30;
      for (let n = 0; n < EDIT_COUNT; n++) {
        const edit = draw(base);
        if (edit.insert === "" && edit.end === edit.offset) continue;
        const c = programCompiler({ [MAIN_URI]: base }, CONFIG);
        c.compile();
        const after = update(c.compiler, base, 2, edit.offset, edit.end, edit.insert);
        const program = c.compile().program;
        if (program.chunks) chunked += 1;
        const detail = divergence(surface(program), coldSurface(after));
        if (detail) failures.push(record(n, base, edit, detail));
      }
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
      expect(chunked, "compiles that built chunks").toBeGreaterThan(EDIT_COUNT / 2);
    });
  }, 600_000);

  it("incremental == cold across many cumulative edits on ONE compiler", () => {
    quiet(() => {
      const EDIT_COUNT = 90;
      // Assignments, functions and declarations of the auto-globals' names
      // move in and out of the program, both ways round.
      const shaped: [string, string][] = [
        ["  tally = 0\n", "  tally = 0\n  tally = 7\n"],
        ["function score()\n  return 10\nend\n", "function tally()\n  return 10\nend\n"],
        ["store seen = 0\n", "store seen = 0\nstore tally = 1\n"],
        ["  late_0 = 1\n", ""],
        ["  score = 5\n", "  local score = 5\n"],
      ];
      const { failures, chunked } = cumulativeRun(
        autoGlobalScreenplay(4),
        0x1607b,
        EDIT_COUNT,
        AUTO_GLOBAL_INSERTS,
        AUTO_LINES,
        shaped,
        true,
      );
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
      expect(chunked, "compiles that built chunks").toBeGreaterThan(EDIT_COUNT / 3);
    });
  }, 600_000);

  it("stays == cold as an assignment, a function and a declaration of a read name come and go", () => {
    let text = autoGlobalScreenplay(4);
    quiet(() => {
      expect(coldSurface(text).chunks).not.toBeNull();
      const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
      c.compile();
      const steps: Edit[] = [
        { name: "warm", find: "Tally {tally} in 2.", replace: "Tally {tally} in 2!" },
        { name: "an assignment above the first read", find: "Before any scene {tally}", replace: "Before any scene {tally}.\ntally = 1\nAgain {tally}" },
        { name: "a function of an auto-global's name", find: "function bump(n)", replace: "function looped()\n  return 2\nend\n\nfunction bump(n)" },
        { name: "a declaration of an auto-global's name", find: "store seen = 0", replace: "store seen = 0\nstore inner_1 = 5" },
        { name: "the assignment goes", find: "tally = 1\nAgain {tally}", replace: "Again {tally}" },
        { name: "the function goes", find: "function looped()\n  return 2\nend\n\n", replace: "" },
        { name: "an assignment moves below its reads", find: "  late_2 = 1\n", replace: "" },
        { name: "and back above them", find: "scene AUTO_2\n", replace: "scene AUTO_2\n  late_2 = 1\n" },
        { name: "the declaration goes", find: "\nstore inner_1 = 5", replace: "" },
      ];
      const log: string[] = [];
      steps.forEach((step, i) => {
        const offset = text.indexOf(step.find);
        expect(offset, `find ${step.find}`).toBeGreaterThanOrEqual(0);
        text = update(c.compiler, text, i + 2, offset, offset + step.find.length, step.replace);
        const program = c.compile().program;
        const detail = divergence(surface(program), coldSurface(text));
        log.push(`step ${i + 1} ${step.name}: ${program.chunks ? "chunks" : "no chunks"} ${detail ?? "ok"}`);
      });
      expect(log.filter((l) => !l.endsWith(" ok"))).toEqual([]);
    });
  }, 300_000);
});

// ---- previewCompileRestore: interleaved previews ---------------------------

// previewCompileRestore's screenplay (branch perf/652-preview-restore-parse,
// not on main, so copied).
function previewScreenplay(scenes = 8): string {
  const L: string[] = [];
  L.push("title: Preview Restore");
  L.push("");
  L.push("define hero as character:");
  L.push(`  name = "Hero"`);
  L.push(`  color = "#3366cc"`);
  L.push("");
  L.push("define cfg as object:");
  L.push("  speed = 5");
  L.push("");
  L.push("store trust = 0");
  L.push("");
  L.push("function bonus(x):");
  L.push("  return x * 2 + 1");
  L.push("");
  for (let s = 0; s < scenes; s++) {
    L.push(`scene scene_${s}`);
    L.push(`= INT. ROOM ${s} - DAY`);
    L.push(":");
    L.push(`  Action describing room ${s} in some detail here.`);
    L.push(`hero:`);
    L.push(`  Line one of dialogue in scene ${s}.`);
    L.push(`  Speed is {cfg.speed} and trust is {trust}.`);
    L.push("if trust > 2 then");
    L.push(`  hero: I trust you in scene ${s}.`);
    L.push("else");
    L.push(`  hero: Not yet in scene ${s}.`);
    L.push("end");
    L.push(`& trust = bonus(trust)`);
    L.push(`-> scene_${(s + 1) % scenes}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

const preview = (c: SparkdownCompiler, version: number, offset: number, end: number, text: string, insert: string) =>
  quiet(() =>
    c.previewCompile({
      root: { uri: MAIN_URI },
      textDocument: { uri: MAIN_URI, version },
      contentChanges: [{ range: { start: posAt(text, offset), end: posAt(text, end) }, text: insert }],
    } as never),
  );

describe("previewCompileRestore's interleaved oracle on the binary program", () => {
  // The preview oracle's screenplay, each scene with an `if ... else ...
  // end`, and the choose screenplay, which nests blocks three deep.
  const runs = [
    {
      name: "the preview screenplay",
      text: () => previewScreenplay(10),
      inserts: ["x", "\n", " ", "1", "}", "{", "{trust}", "// c", "->", "end", ")", "{scene_2}", "hero:", "-> scene_5", "\n& f = function() return 9 end\n"],
      lines: COUPLED_LINES,
      seed: 0x9e37a,
      count: 50,
      undoFallback: false,
    },
    {
      // As the cumulative run of this screenplay, an edit after which the
      // program fell back is undone by the next one.
      name: "the choose screenplay",
      text: () => chooseScreenplay(2),
      inserts: CHOOSE_INSERTS,
      lines: CHOOSE_LINES,
      seed: 0x9e37b,
      count: 30,
      undoFallback: true,
    },
  ];
  for (const run of runs) {
    it(`interleaved with random edits never changes the cumulative program of ${run.name}`, () => {
      quiet(() => {
        let text = run.text();
        expect(coldSurface(text).chunks).not.toBeNull();
        const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
        c.compile();
        const store = c.compiler.chunkStore!;
        const rand = lcg(run.seed);
        const draw = editDrawer(rand, run.inserts, run.lines);
        let version = 1;
        const failures: string[] = [];
        let chunked = 0;
        let undo: RandomEdit | undefined;
        for (let n = 0; n < run.count; n++) {
          let edit = draw(text);
          if (undo) {
            edit = undo;
            undo = undefined;
          }
          // A preview of an edit that is never applied, drawn the same way.
          const unrelated = draw(text);
          const current = store.current;
          const result = preview(c.compiler, version, unrelated.offset, unrelated.end, text, unrelated.insert);
          if (result.outdated) {
            failures.push(`#${n} preview refused at version ${version}`);
          }
          if (store.current !== current) {
            failures.push(record(n, text, unrelated, "the preview replaced the store's current root"));
          }
          if (edit.insert === "" && edit.end === edit.offset) continue;
          version += 1;
          const before = text;
          text = update(c.compiler, text, version, edit.offset, edit.end, edit.insert);
          const program = quiet(() => c.compile().program);
          if (program.chunks) chunked += 1;
          else if (run.undoFallback && edit.kind !== "undo") undo = inverseOf(before, edit);
          const detail = divergence(surface(program), coldSurface(text));
          if (detail) {
            failures.push(`${record(n, before, edit, detail)} [after preview ${JSON.stringify(unrelated.insert)} @${unrelated.offset} del=${unrelated.end - unrelated.offset}]`);
          }
        }
        expect(failures, `divergences with preview compiles interleaved:\n${failures.join("\n")}`).toEqual([]);
        expect(chunked, "compiles that built chunks").toBeGreaterThan(run.count / 3);
      });
    }, 600_000);
  }
});

// ---- A preview compile's root shares with the real root --------------------

// A scene whose `choose` has a `then` clause holding an `if` with a body of
// three lines, statements before and after the `if`, and a statement of the
// scene after the `choose`; then a second scene.
const SHARING = [
  "store gold = 0",
  "",
  "scene FIRST",
  "  Opening line.",
  "  choose",
  "    * Take the coin",
  "      You take it.",
  "    * Leave it",
  "      You leave it.",
  "  then",
  "    You stand in the hall.",
  "    You look around.",
  "    if gold < 3 then",
  "      The hall is bright.",
  "      & gold = gold + 1",
  "      It glitters.",
  "    end",
  "    You walk on.",
  "    The door closes.",
  "  end",
  "  After the choice.",
  "  -> SECOND",
  "end",
  "",
  "scene SECOND",
  "  The second scene.",
  "  done",
  "end",
  "",
].join("\n");

const INSERTED = "    A new line in the clause.\n";
const AT_INSERT = "    You look around.\n";
const IF_LINES = "    if gold < 3 then\n      The hall is bright.\n      & gold = gold + 1\n      It glitters.\n    end\n";

/** The scene's `choose` chunk, its `then` clause (the body that holds a
 *  block statement), the `if` chunk in it and the sequence ids of the `if`'s
 *  bodies. */
function sharingParts(root: ProgramRoot) {
  const scene = root.flowNamed("FIRST")!;
  const choose = scene.arrays.chunks.find((chunk) => blockCount(chunk) > 0)!;
  let clause: SequenceRow | undefined;
  for (let k = 0; k < blockCount(choose); k++) {
    const body = root.body(choose, k);
    if (body?.arrays.chunks.some((chunk) => blockCount(chunk) > 0)) clause = body;
  }
  const ifChunk = clause?.arrays.chunks.find((chunk) => blockCount(chunk) > 0);
  const ifBodies = ifChunk
    ? Array.from({ length: blockCount(ifChunk) }, (_, k) => blockField(ifChunk, k, B_SEQUENCE))
    : [];
  return { scene, choose, clause, ifChunk, ifBodies };
}

const rowName = (root: ProgramRoot, row: SequenceRow) =>
  `${row.id}(${row.flow >= 0 ? JSON.stringify(root.table.symbols[row.flow]) : "declarations"} owner ${row.owner} block ${row.block})`;

/** Every array of a root, with a copy of its contents. */
function snapshot(root: ProgramRoot) {
  return [...root.sequences()].map((row) => ({
    row,
    arrays: row.arrays,
    chunks: row.arrays.chunks,
    lineStarts: row.arrays.lineStarts,
    chunkCopy: [...row.arrays.chunks],
    startsCopy: [...row.arrays.lineStarts],
    words: row.arrays.chunks.map((chunk: ProgramChunk) => chunk.join(",")),
  }));
}

/** How `root` no longer holds what `snap` took of it. */
function changedSince(root: ProgramRoot, snap: ReturnType<typeof snapshot>): string[] {
  const out: string[] = [];
  for (const s of snap) {
    const name = rowName(root, s.row);
    if (root.sequence(s.row.id) !== s.row) out.push(`${name}: row replaced`);
    if (s.row.arrays !== s.arrays) out.push(`${name}: arrays replaced`);
    if (s.arrays.chunks !== s.chunks) out.push(`${name}: chunks array replaced`);
    if (s.arrays.lineStarts !== s.lineStarts) out.push(`${name}: line starts replaced`);
    if (s.chunks.length !== s.chunkCopy.length || s.chunks.some((chunk, i) => chunk !== s.chunkCopy[i])) {
      out.push(`${name}: chunks array edited`);
    }
    if (stable(s.lineStarts) !== stable(s.startsCopy)) out.push(`${name}: line starts edited`);
    if (s.chunks.some((chunk, i) => chunk.join(",") !== s.words[i])) out.push(`${name}: a chunk's words edited`);
  }
  return out;
}

/** How `next`, built from `previous` by inserting a line into the `then`
 *  clause above the `if`, fails to share with it: every chunk but the one
 *  emitted, the chunks array of every sequence but the clause's, the line
 *  starts of every sequence but the clause's and the scene's (which holds
 *  statements below the `choose`), and the rows of the `if`'s bodies. */
function sharingProblems(previous: ProgramRoot, next: ProgramRoot): string[] {
  const out: string[] = [];
  const before = sharingParts(previous);
  const after = sharingParts(next);
  if (!before.clause || !after.clause) return ["no then clause holding a block statement"];
  if (after.clause.id !== before.clause.id) out.push("the clause has another sequence id");
  if (after.scene.id !== before.scene.id) out.push("the scene has another sequence id");
  const held = new Set(rootChunks(previous));
  const fresh = rootChunks(next).filter((chunk) => !held.has(chunk));
  if (fresh.length !== 1) out.push(`${fresh.length} chunks the previous root does not hold, not 1`);
  const enclosing = new Set([before.scene.id]);
  for (const row of previous.sequences()) {
    const now = next.sequence(row.id);
    const name = rowName(previous, row);
    if (!now) {
      out.push(`${name}: no row`);
      continue;
    }
    if (row.id === before.clause.id) {
      if (now.arrays.chunks === row.arrays.chunks) out.push(`${name}: the clause's chunks array is shared`);
      if (now.arrays.lineStarts === row.arrays.lineStarts) out.push(`${name}: the clause's line starts are shared`);
      continue;
    }
    if (now.arrays.chunks !== row.arrays.chunks) out.push(`${name}: chunks array not shared`);
    if (enclosing.has(row.id)) {
      if (now.arrays.lineStarts === row.arrays.lineStarts) out.push(`${name}: the scene's line starts are shared`);
    } else if (now.arrays.lineStarts !== row.arrays.lineStarts) {
      out.push(`${name}: line starts not shared`);
    }
  }
  const rows = (root: ProgramRoot) => [...root.sequences()].length;
  if (rows(next) !== rows(previous)) out.push(`${rows(next)} rows, not ${rows(previous)}`);
  if (stable(after.ifBodies) !== stable(before.ifBodies)) out.push("the if's bodies have other ids");
  for (const id of before.ifBodies) {
    if (next.sequence(id) !== previous.sequence(id)) out.push(`the if's body ${id}: row not shared`);
  }
  return out;
}

describe("a preview compile's root", () => {
  const coldRoot = (text: string) =>
    quiet(() => programCompiler({ [MAIN_URI]: text }, CONFIG).compile().program.chunks!);

  it("shares with the real root every chunk and array it did not change, and leaves the real root as it was", () => {
    quiet(() => {
      const c = programCompiler({ [MAIN_URI]: SHARING }, CONFIG);
      const first = c.compile().program;
      expect(first.chunks).toBeDefined();
      const real = first.chunks!;
      const store = c.compiler.chunkStore!;
      expect(store.current === real, "the compile's root is current").toBe(true);
      const parts = sharingParts(real);
      expect(parts.clause, "a then clause holding the if").toBeDefined();
      expect(parts.ifBodies.length).toBeGreaterThan(0);
      for (const id of parts.ifBodies) {
        expect(real.sequence(id), `the if's body ${id}`).toBeDefined();
      }
      const snap = snapshot(real);

      // Insert a line of dialogue into the clause above the `if`.
      const at = SHARING.indexOf(AT_INSERT);
      const inserted = SHARING.slice(0, at) + INSERTED + SHARING.slice(at);
      const result = preview(c.compiler, 1, at, at, SHARING, INSERTED);
      expect(result.outdated ?? false).toBe(false);
      expect(result.program?.chunks).toBeDefined();
      const previewRoot = result.program!.chunks!;
      expect(c.compiler.lastProgramBuild?.root === previewRoot, "the preview's build is its program's root").toBe(true);
      expect(previewRoot === real, "the preview built a root of its own").toBe(false);
      expect(store.current === real, "the store's current root is the real one").toBe(true);
      expect(store.emittedLastBuild).toBe(1);
      expect(sharingProblems(real, previewRoot)).toEqual([]);
      expect(changedSince(real, snap)).toEqual([]);
      expect(describeRoot(previewRoot).join("\n")).toBe(describeRoot(coldRoot(inserted)).join("\n"));

      // Delete the whole `if` from the clause.
      const ifAt = SHARING.indexOf(IF_LINES);
      const removed = SHARING.slice(0, ifAt) + SHARING.slice(ifAt + IF_LINES.length);
      const second = preview(c.compiler, 1, ifAt, ifAt + IF_LINES.length, SHARING, "");
      expect(second.program?.chunks).toBeDefined();
      const without = second.program!.chunks!;
      expect(store.current === real, "the store's current root is the real one").toBe(true);
      expect(parts.ifBodies.filter((id) => without.sequence(id) !== undefined)).toEqual([]);
      expect(parts.ifBodies.filter((id) => real.sequence(id) === undefined)).toEqual([]);
      expect(changedSince(real, snap)).toEqual([]);
      expect(describeRoot(without).join("\n")).toBe(describeRoot(coldRoot(removed)).join("\n"));

      // The insertion made for real, after the previews, is built from the
      // real root as the first preview was.
      update(c.compiler, SHARING, 2, at, at, INSERTED);
      const next = c.compile().program.chunks!;
      expect(store.current === next, "the real edit's root is current").toBe(true);
      expect(store.emittedLastBuild).toBe(1);
      expect(sharingProblems(real, next)).toEqual([]);
      expect(changedSince(real, snap)).toEqual([]);
      expect(describeRoot(next).join("\n")).toBe(describeRoot(coldRoot(inserted)).join("\n"));
    });
  }, 120_000);

  it("of a real edit shares with the previous root in the same way, and drops the rows of a body the edit removed", () => {
    quiet(() => {
      const c = programCompiler({ [MAIN_URI]: SHARING }, CONFIG);
      const real = c.compile().program.chunks!;
      const store = c.compiler.chunkStore!;
      const parts = sharingParts(real);
      const snap = snapshot(real);

      const at = SHARING.indexOf(AT_INSERT);
      const inserted = update(c.compiler, SHARING, 2, at, at, INSERTED);
      const next = c.compile().program.chunks!;
      expect(store.current === next, "the edit's root is current").toBe(true);
      expect(store.emittedLastBuild).toBe(1);
      expect(sharingProblems(real, next)).toEqual([]);
      expect(changedSince(real, snap)).toEqual([]);
      expect(describeRoot(next).join("\n")).toBe(describeRoot(coldRoot(inserted)).join("\n"));

      const nextSnap = snapshot(next);
      const ifAt = inserted.indexOf(IF_LINES);
      const removed = update(c.compiler, inserted, 3, ifAt, ifAt + IF_LINES.length, "");
      const without = c.compile().program.chunks!;
      expect(store.current === without, "the edit's root is current").toBe(true);
      expect(parts.ifBodies.filter((id) => without.sequence(id) !== undefined)).toEqual([]);
      expect(parts.ifBodies.filter((id) => next.sequence(id) === undefined)).toEqual([]);
      expect(changedSince(real, snap)).toEqual([]);
      expect(changedSince(next, nextSnap)).toEqual([]);
      expect(describeRoot(without).join("\n")).toBe(describeRoot(coldRoot(removed)).join("\n"));
    });
  }, 120_000);
});
