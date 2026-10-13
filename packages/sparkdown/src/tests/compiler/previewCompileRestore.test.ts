// A preview compile is a transaction (#666): it parses the suggestion's edit
// once, compiles, and then rolls back what the edit wrote rather than parsing
// the edit's inverse.
//
// The registry's tree, fragments and annotator ranges are persistent values,
// so the registry hands the ones it held back; the grammar parser's shared
// `Compiler` is mutated in place by an incremental parse, so it keeps a
// journal of what the preview's parse changed and undoes it. These tests pin
// the saving and its soundness: one incremental parse per preview, the same
// objects back in the registry, the parser's state identical by a structural
// digest, a rollback even when the compile throws, and the next real compile
// the same program a cold compile of the same text gives, also with preview
// compiles interleaved through random edits (#652's oracle).
import { describe, expect, it } from "vitest";
import { Compiler } from "@impower/textmate-grammar-tree/src/compiler/classes/Compiler";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { describeRoot } from "../program/describeRoot";
import { cumulativeScreenplay, includedChapter } from "./fixtures/coupledScreenplay";

const URI = "inmemory:///main.sd";
const CHAPTER_URI = "inmemory:///chapter.sd";

// Every field the cumulative oracle compares, so a divergence names the field.
const FIELDS = [
  "functionLocations",
  "sceneLocations",
  "knotLocations",
  "branchLocations",
  "labelLocations",
  "context",
  "diagnostics",
  "ui",
] as const;

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

function fieldSig(program: any): Record<string, string> {
  const sig: Record<string, string> = {};
  sig["chunks"] = JSON.stringify(program.chunks ? describeRoot(program.chunks) : null);
  for (const f of FIELDS) sig[f] = stable(program[f]);
  return sig;
}

function diverged(a: Record<string, string>, b: Record<string, string>) {
  return Object.keys(a).filter((f) => a[f] !== b[f]);
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

function filesOf(texts: Record<string, string>) {
  return Object.entries(texts).map(([uri, text]) => ({
    uri,
    type: "script",
    name: uri.slice(uri.lastIndexOf("/") + 1, uri.lastIndexOf(".")),
    ext: "sd",
    text,
    version: 1,
    languageId: "sparkdown",
  }));
}

function compilerFor(texts: Record<string, string>) {
  const c = new SparkdownCompiler();
  c.configure({ files: filesOf(texts) } as never);
  return c;
}

function coldProgram(texts: Record<string, string>) {
  return quiet(() => compilerFor(texts).compile({ textDocument: { uri: URI } }).program);
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

const previewOf = (c: SparkdownCompiler, uri: string, version: number, contentChanges: any[]) =>
  quiet(() =>
    c.previewCompile({
      root: { uri: URI },
      textDocument: { uri, version },
      contentChanges,
    } as never),
  );

/** The registry's per-document parse state, which the rollback puts back. */
function parseState(c: SparkdownCompiler, uri = URI) {
  return (c.documents as any)._documentStates.get(uri);
}

/** The grammar parser's shared compiler the document's tree was built by. */
function parserCompiler(c: SparkdownCompiler, uri = URI): Compiler {
  const tree = parseState(c, uri).tree;
  const found = Object.values(tree.props ?? {}).find((v) => v instanceof Compiler);
  expect(found, "the tree carries its parser's compiler").toBeTruthy();
  return found as Compiler;
}

/**
 * A structural digest of a parser compiler's whole state: every field of the
 * compiler and of every chunk its packet holds, typed arrays by content up to
 * their live length, and every object by an identity shared across digests,
 * so that a digest taken before and after an operation differs exactly when
 * the operation left something changed, replaced or detached.
 */
function digester() {
  const ids = new WeakMap<object, number>();
  let next = 0;
  const id = (o: object | null | undefined) => {
    if (o == null) return "-";
    let n = ids.get(o);
    if (n === undefined) {
      n = ++next;
      ids.set(o, n);
    }
    return `#${n}`;
  };
  const ints = (a: ArrayLike<number> | undefined, n = a?.length ?? 0) =>
    a ? Array.from({ length: n }, (_, i) => a[i]).join(",") : "-";
  const resume = (r: any) =>
    r
      ? `${id(r)}[${r.frames.map((f: any) => `${id(f)}:${f.openedAtAbs}:${f.contentOpened}:${f.emptyMatchCount}`).join(";")}|${r.stack.length}]`
      : "-";
  const chunk = (ch: any) =>
    [
      id(ch),
      ch.from,
      ch.to,
      ch.length,
      ch.nodeCount,
      id(ch.compiled),
      ints(ch.compiled, ch.nodeCount * 4),
      `stack:${ints(ch.stack.ids, ch.stack.length)}/${ints(ch.stack.positions, ch.stack.length)}/${ints(ch.stack.children, ch.stack.length)}`,
      `scopes:${ch.scopes ? ch.scopes.join(",") : "-"}`,
      `tb:${ch.treeBuffer === null ? "null" : id(ch.treeBuffer)}`,
      ch.compilerNodeCount,
      ch.compilerReusedCount,
      ch.compilerMaxTreeBufferLength,
      ch.isSplitPoint,
      ch.startsPure,
      ch.spliceSafe,
      `resume:${resume(ch.resume)}`,
      ch.entrySeeds
        ? `seeds:${id(ch.entrySeeds)}:${ints(ch.entrySeeds.ids)}/${ints(ch.entrySeeds.children)}/${ints(ch.entrySeeds.absPositions)}`
        : "seeds:-",
      ch.inheritedCloseRecords
        ? `closes:${id(ch.inheritedCloseRecords)}:${ch.inheritedCloseRecords.map((r: any) => `${r.seedIndex}@${r.offset}`).join(",")}`
        : "closes:-",
    ].join(" ");
  const packet = (p: any) =>
    p
      ? `${id(p)} ${id(p.chunks)} pending:${p.pendingSplits.map((s: any) => `${s.at}${resume(s.resume)}`).join(",")}\n${p.chunks.map(chunk).join("\n")}`
      : "-";
  return (c: Compiler): string => {
    const k = c as any;
    return [
      `epoch:${k.reuseEpoch}`,
      `nodes:${k.nodeCount} index:${k.index} max:${k.maxTreeBufferLength}`,
      `reparsed:${k.reparsedFrom}..${k.reparsedTo}`,
      `resumeState:${resume(k.resumeState)}`,
      `retokenized:${k.retokenized ? id(k.retokenized) : "-"}`,
      `compiled:${id(k.compiled)}:${k.compiled.length}:${ints(k.compiled, k.nodeCount * 4)}`,
      `reused:${id(k.reused)}:${k.reused.map((b: object) => id(b)).join(",")}`,
      `ahead:${packet(k.ahead)}`,
      `packet:${packet(k.packet)}`,
    ].join("\n");
  };
}

/** Counts calls into the grammar parser for the duration of `fn`. */
function countingParses<T>(c: SparkdownCompiler, fn: () => T): [T, number] {
  const parser = (c.documents as any).parser;
  const real = parser.parse;
  let calls = 0;
  parser.parse = function (...args: any[]) {
    calls += 1;
    return real.apply(this, args);
  };
  try {
    return [fn(), calls];
  } finally {
    parser.parse = real;
  }
}

/** Every annotation set the registry holds for `uri`, by kind. */
function annotationsOf(c: SparkdownCompiler, uri = URI) {
  return { ...(c.documents.annotations(uri) as Record<string, unknown>) };
}

function expectSameParse(
  c: SparkdownCompiler,
  before: { tree: unknown; fragments: unknown; treeVersion: unknown; annotations: Record<string, unknown> },
  uri = URI,
) {
  const after = parseState(c, uri);
  // Compared as booleans: a failing `toBe` on a tree or a range set prints the
  // whole structure and exhausts the test process's heap.
  expect(after.tree === before.tree, "same tree").toBe(true);
  expect(after.treeFragments === before.fragments, "same fragments").toBe(true);
  expect(after.treeVersion).toBe(before.treeVersion);
  const annotations = annotationsOf(c, uri);
  for (const key of Object.keys(before.annotations)) {
    expect(annotations[key] === before.annotations[key], `same ${key} annotations`).toBe(true);
  }
}

function parseOf(c: SparkdownCompiler, uri = URI) {
  const state = parseState(c, uri);
  return {
    tree: state.tree,
    fragments: state.treeFragments,
    treeVersion: state.treeVersion,
    annotations: annotationsOf(c, uri),
  };
}

const SUGGESTED = ["Line one of dialogue in scene 7.", "Line one of dialogue in scene 7, concerned."] as const;

describe("a preview compile", () => {
  it("parses the edit once instead of parsing its inverse back", () => {
    const base = cumulativeScreenplay();
    const c = compilerFor({ [URI]: base });
    quiet(() => c.compile({ textDocument: { uri: URI } }));

    const [preview, parses] = countingParses(c, () =>
      previewOf(c, URI, 1, change(base, ...SUGGESTED).contentChanges),
    );

    expect(preview.outdated).toBeUndefined();
    expect(parses).toBe(1);
  });

  it("leaves the registry's tree, fragments and annotations as the same objects", () => {
    const base = cumulativeScreenplay();
    const c = compilerFor({ [URI]: base });
    quiet(() => c.compile({ textDocument: { uri: URI } }));
    const before = parseOf(c);

    previewOf(c, URI, 1, change(base, ...SUGGESTED).contentChanges);

    expectSameParse(c, before);
    expect(c.documents.get(URI)!.getText()).toBe(base);
    expect(c.documents.get(URI)!.version).toBe(1);
  });

  it("leaves the parser's compiler in the state it was in", () => {
    const base = cumulativeScreenplay();
    const c = compilerFor({ [URI]: base });
    quiet(() => c.compile({ textDocument: { uri: URI } }));
    // An incremental parse first, so the packet holds the in-scope split
    // points, restart snapshots and inherited seeds a later reuse rewrites.
    const warm = change(base, "Action describing room 3", "Action describing room 3 again");
    quiet(() =>
      c.updateDocument({ textDocument: { uri: URI, version: 2 }, contentChanges: warm.contentChanges } as never),
    );
    quiet(() => c.compile({ textDocument: { uri: URI } }));
    const digest = digester();
    const compiler = parserCompiler(c);
    const before = digest(compiler);

    // An edit that changes the length of the text, inside a block, ahead of
    // most of the document: the reuse slides every chunk after it.
    previewOf(c, URI, 2, change(warm.after, ...SUGGESTED).contentChanges);
    expect(parserCompiler(c) === compiler, "the tree's compiler").toBe(true);
    expect(digest(compiler) === before, "the compiler's digest after the preview").toBe(true);

    // And one inside an `if` block, which restarts at an in-scope split point.
    previewOf(c, URI, 2, change(warm.after, "I trust you in scene 4.", "I trust you.").contentChanges);
    expect(digest(compiler) === before, "the compiler's digest after an in-block preview").toBe(true);
  });

  it("in a long block a cold parse left whole splits it once, and each later preview reparses a few lines", () => {
    // A `then` clause a from-scratch parse keeps as a single chunk, so an edit
    // deep inside it reparses all of it until an incremental parse has minted
    // the split points the edit's parse can restart at.
    const L: string[] = ["scene long", "  The hall is quiet.", "", "  choose", "    + [Go on]", "      The door opens.", "", "    + [Wait]", "      Nothing happens.", "  then", ""];
    for (let i = 0; i < 400; i++) {
      L.push(`    Action line ${i} describing the hall at some length.`, "", "    HERO:", `      Dialogue line ${i}.`, "");
    }
    L.push("  end", "end", "");
    const base = L.join("\n");
    const c = compilerFor({ [URI]: base });
    quiet(() => c.compile({ textDocument: { uri: URI } }));
    const target = "Dialogue line 380.";
    const at = base.indexOf(target);
    const compiler = parserCompiler(c);
    expect(compiler.reparseSpan(at), "a parse there reparses the whole scene").toBeGreaterThan(20_000);

    // The first preview there parses the text as it is once, kept, and then
    // the suggestion; the registry keeps its tree and annotations.
    const before = parseOf(c);
    const [, first] = countingParses(c, () => previewOf(c, URI, 1, change(base, target, "Dialogue line 380!").contentChanges));
    expect(first).toBe(2);
    expectSameParse(c, before);
    expect(compiler.reparseSpan(at), "a parse there reparses a few lines").toBeLessThan(1_000);

    // Every preview after it parses once and leaves the parser as it found it.
    const digest = digester();
    const state = digest(compiler);
    for (const replace of ["Dialogue line 380?", "Dialogue 380.", "Line 380."]) {
      const [preview, parses] = countingParses(c, () => previewOf(c, URI, 1, change(base, target, replace).contentChanges));
      expect(preview.outdated).toBeUndefined();
      expect(parses).toBe(1);
      expect(digest(compiler) === state, "the compiler's digest").toBe(true);
    }
    expectSameParse(c, before);

    // The next real edit there compiles to the cold program.
    const typed = change(base, "Dialogue line 381.", "Dialogue line 381, typed.");
    quiet(() =>
      c.updateDocument({ textDocument: { uri: URI, version: 2 }, contentChanges: typed.contentChanges } as never),
    );
    const incremental = quiet(() => c.compile({ textDocument: { uri: URI } })).program;
    expect(diverged(fieldSig(incremental), fieldSig(coldProgram({ [URI]: typed.after })))).toEqual([]);
  });

  it("rolls back when the compile throws", () => {
    const base = cumulativeScreenplay();
    const c = compilerFor({ [URI]: base });
    quiet(() => c.compile({ textDocument: { uri: URI } }));
    const before = parseOf(c);
    const digest = digester();
    const compiler = parserCompiler(c);
    const state = digest(compiler);

    const real = (c as any).compileStory;
    (c as any).compileStory = () => {
      throw new Error("compile failed");
    };
    try {
      expect(() => previewOf(c, URI, 1, change(base, ...SUGGESTED).contentChanges)).toThrow("compile failed");
    } finally {
      (c as any).compileStory = real;
    }

    expectSameParse(c, before);
    expect(digest(compiler) === state, "the compiler's digest").toBe(true);
    expect(c.documents.get(URI)!.getText()).toBe(base);
    expect(c.documents.get(URI)!.version).toBe(1);
    // The document is intact, so an ordinary compile still answers for it.
    const recompiled = quiet(() => c.compile({ textDocument: { uri: URI } })).program;
    expect(diverged(fieldSig(recompiled), fieldSig(coldProgram({ [URI]: base })))).toEqual([]);
  });

  it("is followed by a real edit elsewhere that compiles to the cold program", () => {
    const base = cumulativeScreenplay();
    const c = compilerFor({ [URI]: base });
    quiet(() => c.compile({ textDocument: { uri: URI } }));

    previewOf(c, URI, 1, change(base, ...SUGGESTED).contentChanges);
    // Two back to back, the second at another line.
    previewOf(c, URI, 1, change(base, "Action describing room 2", "Action in room 2").contentChanges);

    const typed = change(base, "Action describing room 5", "Action in room 5");
    quiet(() =>
      c.updateDocument({ textDocument: { uri: URI, version: 2 }, contentChanges: typed.contentChanges } as never),
    );
    const incremental = quiet(() => c.compile({ textDocument: { uri: URI } })).program;

    expect(c.documents.get(URI)!.getText()).toBe(typed.after);
    expect(diverged(fieldSig(incremental), fieldSig(coldProgram({ [URI]: typed.after })))).toEqual([]);
  });

  it("of an included script rolls back that script and leaves the root's parse alone", () => {
    const texts = {
      [URI]: cumulativeScreenplay().replace(
        "define hero as character with",
        "include chapter.sd\n\ndefine hero as character with",
      ),
      [CHAPTER_URI]: includedChapter(),
    };
    const c = compilerFor(texts);
    quiet(() => c.compile({ textDocument: { uri: URI } }));
    const root = parseOf(c, URI);
    const chapter = parseOf(c, CHAPTER_URI);
    const digest = digester();
    const compiler = parserCompiler(c, CHAPTER_URI);
    const state = digest(compiler);

    const preview = previewOf(c, CHAPTER_URI, 1, change(texts[CHAPTER_URI]!, "Chapter line 3.", "Chapter line 3!").contentChanges);
    expect(preview.outdated).toBeUndefined();

    expectSameParse(c, chapter, CHAPTER_URI);
    expectSameParse(c, root, URI);
    expect(digest(compiler) === state, "the chapter compiler's digest").toBe(true);

    const typed = change(texts[URI]!, "Action describing room 5", "Action in room 5");
    quiet(() =>
      c.updateDocument({ textDocument: { uri: URI, version: 2 }, contentChanges: typed.contentChanges } as never),
    );
    const incremental = quiet(() => c.compile({ textDocument: { uri: URI } })).program;
    expect(diverged(fieldSig(incremental), fieldSig(coldProgram({ ...texts, [URI]: typed.after })))).toEqual([]);
  });

  it("interleaved with random edits never changes the cumulative program", () => {
    quiet(() => {
      let text = cumulativeScreenplay();
      const c = compilerFor({ [URI]: text });
      c.compile({ textDocument: { uri: URI } });

      // Deterministic LCG (no Math.random) so the fuzz is reproducible.
      let seed = 0x9e37a;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const inserts = [
        "x",
        "\n",
        " ",
        "1",
        "}",
        "{",
        "{trust}",
        "// c",
        "->",
        "end",
        ")",
        "{scene_2}",
        "hero:",
        "-> scene_5",
        "\n& f = function() return 9 end\n",
        "then",
        ":add(1)",
        " += 1",
        "function() return 1 end",
      ];

      let version = 1;
      const failures: string[] = [];
      const EDITS = 60;
      for (let n = 0; n < EDITS; n++) {
        const insert = inserts[Math.floor(rand() * inserts.length)]!;
        const delLen = rand() < 0.4 ? Math.min(1 + Math.floor(rand() * 10), 16) : 0;
        const offset = Math.floor(rand() * text.length);
        // One or two previews of edits that are never applied, at unrelated
        // offsets.
        const previews = rand() < 0.3 ? 2 : 1;
        for (let p = 0; p < previews; p++) {
          const previewOffset = Math.floor(rand() * text.length);
          const previewDel = rand() < 0.3 ? Math.min(1 + Math.floor(rand() * 6), 16) : 0;
          const preview = previewOf(c, URI, version, [
            {
              range: {
                start: posAt(text, previewOffset),
                end: posAt(text, Math.min(previewOffset + previewDel, text.length)),
              },
              text: inserts[Math.floor(rand() * inserts.length)]!,
            },
          ]);
          if (preview.outdated) {
            failures.push(`#${n} preview refused at version ${version}`);
          }
        }
        version += 1;
        c.updateDocument({
          textDocument: { uri: URI, version },
          contentChanges: [
            {
              range: {
                start: posAt(text, offset),
                end: posAt(text, Math.min(offset + delLen, text.length)),
              },
              text: insert,
            },
          ],
        } as never);
        text = text.slice(0, offset) + insert + text.slice(offset + delLen);
        const incrSig = fieldSig(c.compile({ textDocument: { uri: URI } }).program);
        const coldSig = fieldSig(coldProgram({ [URI]: text }));
        const fields = diverged(incrSig, coldSig);
        if (fields.length) {
          failures.push(`#${n} insert=${JSON.stringify(insert)} del=${delLen} @${offset} fields={${fields.join(",")}}`);
        }
      }
      expect(failures, `divergences with preview compiles interleaved:\n${failures.join("\n")}`).toEqual([]);
    });
  });
});
