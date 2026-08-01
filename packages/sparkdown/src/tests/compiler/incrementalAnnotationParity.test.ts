// Incremental annotation parity: the annotations after a burst of edits must
// equal the annotations a cold parse of the same text produces.
//
// `SparkdownCombinedAnnotator.update` re-annotates only `[editStart,
// reparsedTo]` and deletes whatever that window overlaps. That reconciles only
// if re-running the annotators over the window reproduces what a cold parse
// would put there — and several annotators do not, unaided, because `begin()`
// resets state a cold parse accumulates from earlier in the document.
// `SemanticAnnotator` is the sharpest case: with `scopeStack` reset to the
// global frame, a window opening inside a function body has neither the
// document's top-level declarations nor that body's earlier `local`s bound, so
// identifier references stop resolving and their tokens are deleted without
// being re-emitted. They stay gone until a cold parse (#326).
//
// EDITS ARE BINDING-PRESERVING BY CONSTRUCTION, and that is load-bearing:
//
//  - Inserting at an arbitrary offset lands inside keywords and numbers
//    (`end` -> `endx`, `1` -> `1x`) and degrades the parse. A cold parse and an
//    incremental one then legitimately disagree, so the oracle stops being an
//    oracle. Every edit here keeps the document syntactically valid.
//  - Renaming a DECLARATION leaves stale tokens on its downstream references,
//    which sit outside the window and are never re-examined. That is a real
//    defect, still open, and it needs symbol-level dependency tracking rather
//    than anything this window can do — so these edits do not rename.
//
// `treesMatch` is asserted first: if the incremental and cold parse trees ever
// differ, an annotation difference is downstream of the parser and this file is
// pointing at the wrong subsystem.
import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { describe, expect, it } from "vitest";
import type { SparkdownAnnotators } from "../../compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

const URI = "inmemory:///main.sd";

// The language server's set, plus the two object-valued annotators that also
// emit non-node-anchored ranges.
const ANNOTATE: (keyof SparkdownAnnotators)[] = [
  "characters",
  "colors",
  "declarations",
  "formatting",
  "links",
  "lenses",
  "references",
  "semantics",
  "validations",
  "implicits",
];

let nextVersion = 2;

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

function open(text: string) {
  const registry = new SparkdownDocumentRegistry(ANNOTATE);
  registry.add({
    textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" },
  });
  return registry;
}

/** The span the parser actually re-tokenized, or null on a full reparse. */
function reparsedSpan(registry: SparkdownDocumentRegistry) {
  const cached: any = registry.tree(URI)?.prop(cachedCompilerProp as any);
  if (!cached || cached.reparsedFrom == null) {
    return null;
  }
  return {
    from: cached.reparsedFrom as number,
    to: cached.reparsedTo as number,
  };
}

/** Every annotation in every set, as comparable strings. */
function snapshot(registry: SparkdownDocumentRegistry) {
  const annotations = registry.annotations(URI) as Record<string, any>;
  const out: string[] = [];
  for (const key of ANNOTATE) {
    const iter = annotations[key]!.iter(0);
    while (iter.value) {
      let value: string;
      try {
        value = JSON.stringify(iter.value.type) ?? "undefined";
      } catch {
        value = "<unserializable>";
      }
      out.push(`${key} ${iter.from}-${iter.to} ${value}`);
      iter.next();
    }
  }
  return out;
}

/** Multiset difference, so a duplicate counts as a difference. */
function diff(incremental: string[], cold: string[]) {
  const tally = (xs: string[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  const inc = tally(incremental);
  const col = tally(cold);
  const missing: string[] = [];
  const extra: string[] = [];
  for (const [k, n] of col) {
    for (let i = 0; i < n - (inc.get(k) ?? 0); i++) missing.push(k);
  }
  for (const [k, n] of inc) {
    for (let i = 0; i < n - (col.get(k) ?? 0); i++) extra.push(k);
  }
  return { missing, extra };
}

/**
 * A script with the shapes that break window-local annotator state:
 * a top-level `store` referenced from prose far below it, prose scenes whose
 * interpolations resolve against it, and large top-level `function` blocks
 * whose bodies reference their own earlier `local`s.
 */
function fixture() {
  const L: string[] = [];
  L.push("title: Parity Fixture");
  L.push("author: Anonymous");
  L.push("");
  L.push("store trust = 0");
  L.push("");
  for (let s = 0; s < 4; s++) {
    // Parameterised scenes matter: the grammar nests `LuauFunctionParameter`
    // under the (non-Luau) `Scene` node, and that parameter binds into the
    // enclosing scope. A prefix walk that skips non-Luau subtrees drops it.
    L.push(`scene scene_${s}(companion_${s})`);
    L.push(`= INT. ROOM ${s} - DAY`);
    L.push(":");
    L.push(`  Action describing room ${s} in careful detail here.`);
    L.push(`hero:`);
    L.push(
      `  Line one in scene ${s} with {trust} and {companion_${s}} inline.`,
    );
    L.push("end");
    L.push("");
  }
  for (let b = 0; b < 2; b++) {
    L.push(`function pad_${b}()`);
    for (let i = 0; i < 40; i++) {
      L.push(`  local pad_${b}_${i} = ${i} + 1`);
    }
    L.push(`  local r_${b} = pad_${b}_1 + pad_${b}_2`);
    L.push(`  return r_${b}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

// Deterministic LCG — vitest forbids nothing here, but a seeded generator keeps
// a failure reproducible from the seed alone.
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Offsets where inserting one character is binding-preserving. */
function safeEditOffsets(text: string) {
  const offsets: number[] = [];
  // Extend a prose word (changes text, binds nothing).
  for (const m of text.matchAll(
    /\b(?:describing|careful|detail|Action|Line)\b/g,
  )) {
    offsets.push(m.index! + m[0].length);
  }
  // Widen the gap before an arithmetic operator inside a function body.
  for (const m of text.matchAll(/ \+ /g)) {
    offsets.push(m.index! + 1);
  }
  return offsets;
}

function runBurst(seed: number, steps: number) {
  let text = fixture();
  const incremental = open(text);
  const random = rng(seed);
  let sawNarrowWindow = false;

  for (let step = 0; step < steps; step++) {
    const offsets = safeEditOffsets(text);
    expect(offsets.length).toBeGreaterThan(0);
    const offset = offsets[Math.floor(random() * offsets.length)]!;
    const at = posAt(text, offset);
    // A space before `+` stays a space; a letter after a prose word extends it.
    const inserted = text[offset] === "+" ? " " : "z";
    incremental.update({
      textDocument: { uri: URI, version: nextVersion++ },
      contentChanges: [{ range: { start: at, end: at }, text: inserted }],
    });
    text = text.slice(0, offset) + inserted + text.slice(offset);

    const cold = open(text);
    expect(
      incremental.tree(URI)!.toString() === cold.tree(URI)!.toString(),
      `step ${step} (seed ${seed}): parse trees diverged, so this is a parser difference, not an annotator one`,
    ).toBe(true);

    const incrementalSnapshot = snapshot(incremental);
    const coldSnapshot = snapshot(cold);
    // Multiset first: it names exactly which annotations drifted.
    const { missing, extra } = diff(incrementalSnapshot, coldSnapshot);
    expect(
      { missing, extra },
      `step ${step} (seed ${seed}) edit at ${offset}`,
    ).toEqual({ missing: [], extra: [] });
    // Then ORDER. Zero-width marks share offsets (`top_level_begin` and
    // `indent` both sit at a block's first column) and the formatter consumes
    // them in order, so a reconciliation that deletes and re-adds an
    // annotation instead of keeping it would silently permute them — which a
    // multiset comparison cannot see.
    expect(
      incrementalSnapshot,
      `step ${step} (seed ${seed}): annotation ORDER diverged`,
    ).toEqual(coldSnapshot);

    // Non-vacuity: at least one update must have re-annotated a window that
    // does not start at 0, or none of this exercises the incremental path.
    const span = reparsedSpan(incremental);
    if (span && Math.min(span.from, offset) > 0) {
      sawNarrowWindow = true;
    }
  }
  expect(
    sawNarrowWindow,
    `seed ${seed}: every update rebuilt from offset 0, so the incremental path was never exercised`,
  ).toBe(true);
}

describe("incremental annotation parity", () => {
  it("matches a cold parse across a burst of edits (seed 555)", () => {
    runBurst(555, 25);
  });

  it("matches a cold parse across a burst of edits (seed 12345)", () => {
    runBurst(12345, 25);
  });

  it("keeps resolving bindings declared before the window", () => {
    // The narrow case behind most of the loss: the window opens inside a
    // scene body, so both the `store trust = 0` that binds `{trust}` and the
    // scene's own `(companion_3)` parameter are entirely behind it.
    let text = fixture();
    const incremental = open(text);
    const storeAt = text.indexOf("store trust = 0");
    const sceneAt = text.indexOf("scene scene_3(");
    const offset = text.indexOf("careful detail", sceneAt);
    expect(sceneAt).toBeGreaterThan(storeAt);
    expect(offset).toBeGreaterThan(sceneAt);

    for (let i = 0; i < 6; i++) {
      const at = posAt(text, offset);
      incremental.update({
        textDocument: { uri: URI, version: nextVersion++ },
        contentChanges: [{ range: { start: at, end: at }, text: "z" }],
      });
      text = text.slice(0, offset) + "z" + text.slice(offset);
    }

    // Non-vacuity: the window must actually open past the `store`, or the
    // binding is inside it and nothing here is being tested. Read from the
    // tree's own recorded reparse span, so a change in the parser's chunking
    // turns this red rather than hollow. (The window lands at the scene
    // declaration, so the parameter case is covered by the bursts above,
    // whose windows land inside scene bodies.)
    const span = reparsedSpan(incremental);
    expect(
      span,
      "reparse must be incremental, not a full rebuild",
    ).not.toBeNull();
    expect(
      Math.min(span!.from, offset),
      "window must open after the `store` declaration",
    ).toBeGreaterThan(text.indexOf("store trust = 0"));

    const named = (registry: SparkdownDocumentRegistry, name: string) =>
      snapshot(registry).filter((entry) => {
        const m = /^semantics (\d+)-(\d+) /.exec(entry);
        return m && text.slice(Number(m[1]), Number(m[2])) === name;
      });

    // Every `{trust}` interpolation plus the declaration itself.
    expect(named(incremental, "trust").length).toBe(5);
    expect(named(incremental, "trust")).toEqual(named(open(text), "trust"));
    // The scene parameter binds under a non-Luau `Scene` node.
    expect(named(incremental, "companion_3").length).toBeGreaterThan(0);
    expect(named(incremental, "companion_3")).toEqual(
      named(open(text), "companion_3"),
    );
  });
});
