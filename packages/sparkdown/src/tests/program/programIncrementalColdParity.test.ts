// Incremental-versus-cold parity regressions for tickets that no longer
// reproduce (unit E of #1893): each replays its ticket's edits through one
// persistent compiler (or, for #1201, one document registry) and compares
// the result after every edit with a cold compile of the same text: the
// parse tree, the program's chunks by content (`describeRoot`) and its
// diagnostics, or for #1201 the `semantics` channel. Where a ticket's
// divergence needed the parser to restart partway through the document
// (#1201, #1211, #1249, #1295), the case also checks that the last edit
// restarted it there, so the incremental parse, not a whole reparse, is what
// agrees with the cold compile. The scripts of #1613 and #1628 are reparsed
// whole; their divergence was in the chunks a compile kept from the one
// before.
import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { describe, expect, it } from "vitest";
import type { SparkdownAnnotators } from "../../compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { describeRoot, MAIN_URI, programCompiler } from "./programHarness";

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

function posAt(text: string, offset: number) {
  const before = text.slice(0, offset);
  const line = before.split("\n").length - 1;
  return { line, character: offset - (before.lastIndexOf("\n") + 1) };
}

function offsetAt(text: string, line: number, character: number) {
  let offset = 0;
  for (let i = 0; i < line; i++) {
    offset = text.indexOf("\n", offset) + 1;
  }
  return offset + character;
}

/** An edit of the text as it stands: the range it replaces and the text it
 *  puts there. */
type Edit = (text: string) => { from: number; to: number; insert: string };

/** Replaces the first `find` at or after the first `after` with `replace`. */
const replaceText =
  (find: string, replace: string, after = ""): Edit =>
  (text) => {
    const from = text.indexOf(find, text.indexOf(after));
    expect(from, `"${find}" is in the document`).toBeGreaterThanOrEqual(0);
    return { from, to: from + find.length, insert: replace };
  };

/** Inserts `insert` right after the first `find`. */
const insertAfter =
  (find: string, insert: string): Edit =>
  (text) => {
    const at = text.indexOf(find);
    expect(at, `"${find}" is in the document`).toBeGreaterThanOrEqual(0);
    return { from: at + find.length, to: at + find.length, insert };
  };

/** Replaces the LSP range from `line`:`character`, `length` characters long. */
const replaceAt =
  (line: number, character: number, length: number, insert: string): Edit =>
  (text) => {
    const from = offsetAt(text, line, character);
    return { from, to: from + length, insert };
  };

/** Where the parser restarted on the tree's last update: null or 0 when it
 *  reparsed the whole document. */
function reparsedFrom(registry: SparkdownDocumentRegistry, uri: string): number | null {
  const cached: any = registry.tree(uri)?.prop(cachedCompilerProp as any);
  return cached?.reparsedFrom ?? null;
}

const diagnosticsOf = (program: SparkProgram): string[] =>
  Object.keys(program.diagnostics ?? {})
    .sort()
    .flatMap((uri) => (program.diagnostics![uri] ?? []).map((d) => `${uri} ${stable(d)}`));

/** What an incremental and a cold compile of the same text must agree on. */
const surface = (compiler: SparkdownCompiler, program: SparkProgram) => ({
  tree: compiler.documents.tree(MAIN_URI)!.toString(),
  chunks: program.chunks ? describeRoot(program.chunks) : null,
  diagnostics: diagnosticsOf(program),
});

/** Compiles `start`, then applies each edit through `updateDocument` and
 *  compiles again, comparing every compile with a cold compile of the same
 *  text. Returns the last cold program and where the last edit's parse
 *  restarted. */
function replay(start: string, edits: Edit[]) {
  return quiet(() => {
    const incremental = programCompiler({ [MAIN_URI]: start });
    incremental.compile();
    let text = start;
    let version = 2;
    let cold: SparkProgram | undefined;
    let restart: number | null = null;
    for (const [i, edit] of edits.entries()) {
      const { from, to, insert } = edit(text);
      incremental.compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version: version++ },
        contentChanges: [
          { range: { start: posAt(text, from), end: posAt(text, to) }, text: insert },
        ],
      });
      text = text.slice(0, from) + insert + text.slice(to);
      const after = incremental.compile().program;
      restart = reparsedFrom(incremental.compiler.documents, MAIN_URI);
      const coldCompiler = programCompiler({ [MAIN_URI]: text });
      cold = coldCompiler.compile().program;
      expect(after.chunks, `edit ${i + 1} builds chunks`).toBeTruthy();
      expect(cold.chunks, `edit ${i + 1}: the cold compile builds chunks`).toBeTruthy();
      expect(surface(incremental.compiler, after), `after edit ${i + 1}`).toEqual(
        surface(coldCompiler.compiler, cold),
      );
    }
    return { text, cold: cold!, restart };
  });
}

/** The errors and hints of a program, each as `sev<severity>
 *  <from>-<to> <message>` with 0-based `line:character` positions. */
const diagList = (program: SparkProgram): string[] =>
  Object.values(program.diagnostics ?? {})
    .flat()
    .map((d) => {
      const { start, end } = d.range;
      const message = typeof d.message === "string" ? d.message : d.message.value;
      return `sev${d.severity} ${start.line}:${start.character}-${end.line}:${end.character} ${message}`;
    })
    .sort();

describe("#1201: a distant reference's semantic token after a value-list edit", () => {
  const URI = "inmemory:///main.sd";
  const CHANNELS: (keyof SparkdownAnnotators)[] = ["declarations", "references", "semantics"];

  const open = (text: string) => {
    const registry = new SparkdownDocumentRegistry(CHANNELS);
    registry.add({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
    return registry;
  };

  const semantics = (registry: SparkdownDocumentRegistry, text: string) => {
    const out: string[] = [];
    const iter = (registry.annotations(URI) as any).semantics.iter(0);
    while (iter.value) {
      out.push(
        `${JSON.stringify(text.slice(iter.from, iter.to))} ${iter.from}-${iter.to} ${JSON.stringify(iter.value.type)}`,
      );
      iter.next();
    }
    return out;
  };

  it("annotates `return bb` as a cold parse does after `=` is typed before a closure list's last value", () => {
    const pad = (p: string) => Array.from({ length: 5 }, (_, i) => `  local ${p}_${i} = ${i} + 1`);
    let text = [
      "function f()",
      ...pad("pre"),
      "  local aa, bb = function()",
      "    return 1",
      "  end,",
      "    3",
      ...pad("post"),
      "  return bb",
      "end",
      "",
    ].join("\n");
    const incremental = open(text);
    let version = 2;
    const insert = (at: number, inserted: string) => {
      incremental.update({
        textDocument: { uri: URI, version: version++ },
        contentChanges: [{ range: { start: posAt(text, at), end: posAt(text, at) }, text: inserted }],
      });
      text = text.slice(0, at) + inserted + text.slice(at);
    };
    // A binding-preserving warm-up edit gives the parser split points inside
    // the function; without it the second edit reparses the whole document.
    insert(text.indexOf(" + ") + 1, " ");
    insert(text.indexOf("    3"), "=");

    const cold = open(text);
    expect(reparsedFrom(incremental, URI)).toBeGreaterThan(0);
    expect(incremental.tree(URI)!.toString()).toBe(cold.tree(URI)!.toString());
    expect(semantics(incremental, text)).toEqual(semantics(cold, text));
  });
});

describe("#1211: diagnostics of nodes before the reparse window", () => {
  // The first line only makes the document long enough for the incremental
  // parse to restart partway through it; a shorter document is reparsed
  // whole, and then both compiles agree.
  const PADDING = `// ${"a".repeat(117)}`;

  it("sizes the unreachable-statement hint of a done by the statements after it", () => {
    const { cold, restart } = replay(`${PADDING}\ndone\nA\n// c\nB`, [
      (text) => ({ from: text.length, to: text.length, insert: "B" }),
    ]);
    expect(restart).toBeGreaterThan(0);
    expect(diagList(cold)).toContain("sev4 2:0-4:2 Unreachable statement detected.");
  });

  it("sizes the unreachable-statement hint of a done when its last line's text is deleted", () => {
    const { restart } = replay(`${PADDING}\ndone\nA\n// c\nB`, [
      (text) => ({ from: text.length - 1, to: text.length, insert: "" }),
    ]);
    expect(restart).toBeGreaterThan(0);
  });

  it("sizes the unreachable-statement hint of a done at the end of a scene", () => {
    const { cold, restart } = replay(`${PADDING}\nscene S\n  done\n  A\n  // c\n  B\nend`, [
      replaceText("B", "BB"),
    ]);
    expect(restart).toBeGreaterThan(0);
    expect(diagList(cold)).toContain("sev4 3:0-5:4 Unreachable statement detected.");
  });

  it("keeps the malformed-number error of a number followed by letters", () => {
    const { cold, restart } = replay(`${PADDING}\nx = 1ret\nfunction helpe`, [
      replaceText("helpe", "1"),
    ]);
    expect(restart).toBeGreaterThan(0);
    expect(diagList(cold)).toContain("sev1 1:4-1:8 Malformed number");
  });
});

describe("#1249: replacing a function's end with return after earlier edits in it", () => {
  it.each(["x.y = 1", "print(1)"])("parses and compiles as a cold compile does with `%s` in the body", (line) => {
    const scenes = Array.from({ length: 6 }, (_, n) => `scene s${n}\n  Line ${n} here.\nend\n`);
    const start = [
      ...scenes,
      `function f()\n  local a = 1\n  ${line}\n\n  local b = 2\nend`,
    ].join("\n");
    const blank = `  ${line}\n`;
    const { restart } = replay(start, [
      insertAfter("local a = 1", "1"),
      insertAfter("local b = 2", "2"),
      insertAfter(blank, "  y = 3\n"),
      replaceText("  y = 3\n", ""),
      insertAfter(blank, "  -- note\n"),
      replaceText("end", "return", "local b = "),
    ]);
    expect(restart).toBeGreaterThan(0);
  });
});

describe("#1295: a statement typed below a function that follows a scene", () => {
  const SCRIPT = [
    "scene Intro",
    "  The first room is quiet and the second room is quiet and the third.",
    "  The fourth room is quiet and the fifth room is quiet and the sixth.",
    "  done",
    "end",
    "",
    "function f()",
    "end",
    "",
  ].join("\n");

  it.each(["x = 3\n", "    local step = 3\n"])("compiles `%s` at the end as a cold compile does", (statement) => {
    const { restart } = replay(SCRIPT, [
      (text) => ({ from: text.length, to: text.length, insert: statement }),
    ]);
    expect(restart).toBeGreaterThan(0);
  });
});

describe("#1613: a statement chunk's line table after an incremental edit", () => {
  it("measures the rows of a local closure after `return ` is typed into its `local`", () => {
    replay("function capture(n)\n  local add = function(x)\n    return local x + ", [
      replaceAt(1, 4, 0, "return "),
    ]);
  });

  it("measures the last-line delta of a row after a `do` block replaces part of a line", () => {
    replay(
      "function capture(n)\n  local function scale(k)\n  return \n    local base = + baseale(2) + total(1, 2)",
      [replaceAt(1, 2, 4, "  do\n      * In do\n    end\n")],
    );
  });
});

describe("#1628: a display line reading a label's name after an edit above it", () => {
  it("compiles {mid} after an incremental edit as a cold compile of the edited text does", () => {
    // Which resolution `{mid}` should have, a label's visit count or a
    // variable, is not this test's question; both compiles must give the same.
    replay(
      "  Done looping {FLOW_2.side} {count.turns(-> FLOW_2.side)} {READ_COUNT(-> top)}.\n  end\n    label mid\n    After 2, mid {mid}.",
      [replaceAt(0, 43, 4, "\n  branch extra\n    Extra.\n  end\n")],
    );
  });
});
