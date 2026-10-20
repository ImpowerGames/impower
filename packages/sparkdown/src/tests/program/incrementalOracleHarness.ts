// What the incremental oracle tests of the binary program share (#701): the
// surface an incremental compile and a cold compile of the same text must
// agree on (whether it falls back and for what, its chunks by content
// (`describeRoot`), the qualified names its root defines with their kinds,
// and its diagnostics), the drawer of randomized edits, half of which land
// inside the bodies of block statements, the warm-up and the edits of
// `incrementalEquivalence`, the cumulative run of
// `incrementalCumulativeEquivalence`, and a preview compile. The tests are
// one file per oracle, so that the Test Suite workflow's shards can spread
// them (#1932): programIncrementalEquivalence, programIncrementalMovedClosure,
// programIncrementalCumulative, programIncrementalLongBodies,
// programIncrementalLoopsAndChoose, programIncrementalSyntheticAppend,
// programIncrementalAutoGlobals, programIncrementalPreviewInterleaved and
// programPreviewRootSharing.
import { expect } from "vitest";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { isAnonymousSymbol, UNDEFINED_KIND } from "../../program/ProgramSymbols";
import { describeRoot, MAIN_URI, programCompiler } from "./programHarness";

// As programChunkIdentity's `session` compiles.
export const CONFIG = { seedBuiltinsIntoStory: true };

export function quiet<T>(fn: () => T): T {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

export function stable(value: unknown): string {
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

export function posAt(text: string, offset: number) {
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

export const clip = (s: string | undefined, n = 240) =>
  s === undefined ? "(none)" : s.length > n ? `${s.slice(0, n)}...` : s;

/** The qualified names a root defines, each with its kind, sorted. An
 *  anonymous symbol has no stable name and is left out. */
export const definedSymbols = (root: ProgramRoot): string[] => {
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
export interface Surface {
  /** Whether the compile reported an error, which a compile that builds no
   *  chunks does for the statement it could not compile. */
  reportsError: boolean;
  chunks: string[] | null;
  symbols: string[] | null;
  diagnostics: string[];
}

export const surface = (program: SparkProgram): Surface => ({
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

export const coldSurface = (text: string): Surface =>
  quiet(() => surface(programCompiler({ [MAIN_URI]: text }, CONFIG).compile().program));

export const firstDifference = (a: readonly string[], b: readonly string[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return i;
  }
  return -1;
};

/** How `incremental` differs from `cold`, field by field, or nothing. */
export function divergence(incremental: Surface, cold: Surface): string | undefined {
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
export const lcg = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
};

// ---- Edits inside the bodies of block statements ---------------------------

// The head of a block statement whose body is the lines indented below it.
export const BLOCK_HEAD =
  /^(?:if\b.*\bthen$|elseif\b.*\bthen$|else$|while\b.*\bdo$|for\b.*\bdo$|do$|repeat$|(?:local\s+)?function\b|choose$|then\b|[*+]\s)/;

export interface BodyLine {
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
export function bodyLines(text: string): BodyLine[] {
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

export interface RandomEdit {
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
export function editDrawer(
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
export function update(
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
export const record = (n: number, text: string, edit: RandomEdit, detail: string) => {
  const lineStart = text.lastIndexOf("\n", edit.offset - 1) + 1;
  const lineEnd = text.indexOf("\n", edit.offset);
  const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
  return `#${n} [${edit.kind}] insert=${JSON.stringify(edit.insert)} del=${edit.end - edit.offset} @${edit.offset} (line ${posAt(text, edit.offset).line}: ${JSON.stringify(clip(line, 80))}) -> ${detail}`;
};

// Whole lines the edits inside bodies insert into the coupled screenplays: a
// line of dialogue, a line of action, a local, a call, a divert, an `end`, a
// `then`, a new block, a closure, a loop's head and its `break`, and a
// `choose` block's head (#1683).
export const COUPLED_LINES = [
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
export const CHOOSE_LINES = [
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
export const WARM_EDITS: [string, string][] = [
  ["Line one of dialogue in scene 3.", "Line one of dialogue in scene 3!"],
  ["Line one of dialogue in scene 4.", "Line one of dialogue in scene 4!"],
];
export const warmText = (text: string) =>
  WARM_EDITS.reduce((t, [find, replace]) => t.replace(find, replace), text);
export const AFTER_WARM = WARM_EDITS.length + 2;

/** A compiler over `text` with chunks on, compiled and then warmed up. */
export function warmed(text: string) {
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

export interface Edit {
  name: string;
  find: string;
  replace: string;
}

// incrementalEquivalence's diverse edits and the find and replace of its
// carried edits, then edits inside the bodies of the fixture's block
// statements: an `if` body in a scene, a choice body and the `then` clause of
// the `choose` block, and the loops inside the function `reckon`.
export const EDITS: Edit[] = [
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

// incrementalCumulativeEquivalence's shaped edits (not exported, so copied),
// each a pair of texts the edit toggles between.
export const SHAPED_EDITS: [string, string][] = [
  ["store trust = 0", "function later()\n  return 7\nend\n\nstore trust = 0"],
  [
    "define hero as character with",
    "define thing with\n  x = 1\nend\n\ndefine sidekick as thing with\n  x = 2\nend\n\ndefine hero as character with",
  ],
  ["function bonus(x):", "function bonus(x, y):"],
  ["function bonus(", "function bonus_b("],
];

/** The edit that puts back what `edit` changed in `text`. */
export const inverseOf = (text: string, edit: RandomEdit): RandomEdit => ({
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
export function cumulativeRun(
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

export const preview = (c: SparkdownCompiler, version: number, offset: number, end: number, text: string, insert: string) =>
  quiet(() =>
    c.previewCompile({
      root: { uri: MAIN_URI },
      textDocument: { uri: MAIN_URI, version },
      contentChanges: [{ range: { start: posAt(text, offset), end: posAt(text, end) }, text: insert }],
    } as never),
  );
