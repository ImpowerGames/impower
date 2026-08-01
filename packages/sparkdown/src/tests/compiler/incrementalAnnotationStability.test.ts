// Incremental annotation stability.
//
// `SparkdownCombinedAnnotator.update` re-annotates only the window
// `[editStart, reparsedTo]` and drops the superseded annotations with the
// complementary predicate (`to < editStart || from > reparsedTo` is KEPT).
// Nothing is double-counted as long as every annotation an annotator emits
// overlaps the window it was produced in — which is what carrying the entered
// node's own `[from, to]` guarantees, since Lezer only enters a node that
// overlaps the iterate range.
//
// Annotations anchored somewhere OTHER than the node's full range escape that.
// A zero-width mark at a node's START (`top_level_begin`) sits before
// `editStart` whenever the parser restarts at an in-block split point, so the
// old copy is KEPT and an identical fresh copy is added. `RangeSet` does not
// dedup, so the set grows by one entry per keystroke, unbounded, for as long
// as typing continues inside one top-level block (issue #322).
//
// SCOPE: these pin the DUPLICATION direction only. The incremental window has
// separate, pre-existing holes in the other direction — an in-block window can
// drop annotations a cold parse emits (annotator state like
// `SemanticAnnotator.scopeStack` is rebuilt from the window, not the document),
// and nothing removes an out-of-window annotation the new parse stopped
// emitting. Those are tracked in #326; do not read a green run here as
// incremental ≡ cold in general.
//
// Each edit here is round-tripped (insert a character, then delete it) so the
// document ends byte-identical to where it started — any drift in the
// annotations is pure accumulation, with no legitimate content change to
// explain it away. The insertion point is the end of an identifier so the
// transient text stays valid Luau; a transient parse error perturbs the
// annotations for reasons that have nothing to do with the delete window.
//
// The bug is only REACHABLE when the parser restarts at a split point strictly
// inside the top-level block — otherwise `editStart <= block.from`, the mark is
// inside the window, and the whole scenario is moot. `expectReachedTheBug`
// asserts that precondition against the tree's own recorded reparse spans over
// the real edit sequence, so these stay honest if the parser's chunking or
// reuse policy changes: they go red rather than silently passing on a document
// that can no longer trigger it.
//
// They are deliberately host-level (`SparkdownDocumentRegistry`) rather than
// compiler-level: `formatting` is not in `SparkdownCompiler`'s annotate set,
// so a bare-compiler harness cannot see this class of bug at all.
import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { describe, expect, it } from "vitest";
import type { SparkdownAnnotators } from "../../compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

const URI = "inmemory:///main.sd";

// Mirrors `SparkdownLanguageServerWorkspace`'s set.
const ANNOTATE: (keyof SparkdownAnnotators)[] = [
  "characters",
  "colors",
  "declarations",
  "formatting",
  "links",
  "lenses",
  "references",
  "semantics",
];

// `SparkdownDocumentRegistry.update` ignores a change whose version equals the
// current one, so keep one ever-increasing counter for the whole file.
let nextVersion = 2;

/** Every annotation in every set, as comparable `set from-to type` strings. */
function snapshot(registry: SparkdownDocumentRegistry) {
  const annotations = registry.annotations(URI) as Record<string, any>;
  const out: string[] = [];
  for (const key of ANNOTATE) {
    const iter = annotations[key]!.iter(0);
    while (iter.value) {
      out.push(
        `${key} ${iter.from}-${iter.to} ${JSON.stringify(iter.value.type)}`,
      );
      iter.next();
    }
  }
  return out;
}

function counts(snap: string[]) {
  const out: Record<string, number> = {};
  for (const key of ANNOTATE) {
    out[key] = 0;
  }
  for (const entry of snap) {
    out[entry.slice(0, entry.indexOf(" "))]! += 1;
  }
  return out;
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

function open(text: string) {
  const registry = new SparkdownDocumentRegistry(ANNOTATE);
  registry.add({
    textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" },
  });
  return registry;
}

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

/**
 * Simulate `cycles` keystrokes at `offset`, each one inserted and then
 * immediately deleted, exactly as the language server receives them (one
 * content change per event). The document is byte-identical afterwards.
 *
 * Returns the `editStart` the annotator computed for each update — that is
 * `min(reparsedFrom, edit start)`, the lower bound of the re-annotation window
 * (see `SparkdownCombinedAnnotator.update`).
 */
function typeAndUndo(
  registry: SparkdownDocumentRegistry,
  text: string,
  offset: number,
  cycles: number,
) {
  const at = posAt(text, offset);
  const after = posAt(text, offset + 1);
  const editStarts: (number | null)[] = [];
  const record = () => {
    const span = reparsedSpan(registry);
    editStarts.push(span == null ? null : Math.min(span.from, offset));
  };
  for (let i = 0; i < cycles; i++) {
    registry.update({
      textDocument: { uri: URI, version: nextVersion++ },
      contentChanges: [{ range: { start: at, end: at }, text: "x" }],
    });
    record();
    registry.update({
      textDocument: { uri: URI, version: nextVersion++ },
      contentChanges: [{ range: { start: at, end: after }, text: "" }],
    });
    record();
  }
  // The whole design rests on the document being restored exactly.
  expect(registry.get(URI)!.getText()).toBe(text);
  return editStarts;
}

/**
 * Assert the block actually emits the mark this is all about. Without this the
 * fixture could drift to a shape that produces no `top_level_begin` and every
 * assertion below would hold vacuously.
 */
function expectMarkPresent(text: string, blockFrom: number) {
  // The block start also carries a zero-width `indent` (it is a column-0
  // line), so assert containment rather than exclusivity.
  expect(snapshot(open(text)), `top_level_begin at ${blockFrom}`).toContain(
    `formatting ${blockFrom}-${blockFrom} "top_level_begin"`,
  );
}

/**
 * Assert the typing burst actually reached the bug: at least one update must
 * have re-annotated a window that STARTS AFTER the block, leaving the
 * `top_level_begin` at `[blockFrom, blockFrom]` behind it. Only then is the
 * old mark kept by the delete-filter while the still-entered node re-emits it.
 *
 * The first edit after a cold parse always reparses the whole document, so
 * this only becomes true from the second edit onward; the assertion is over
 * the real sequence rather than a probe, so it stays honest if the parser's
 * chunking or reuse policy changes — the tests go red instead of silently
 * passing on a document that can no longer trigger the bug.
 */
function expectReachedTheBug(editStarts: (number | null)[], blockFrom: number) {
  expect(
    editStarts.filter((s) => s != null && s > blockFrom).length,
    `updates whose window starts after block ${blockFrom} (saw ${JSON.stringify(editStarts)})`,
  ).toBeGreaterThan(0);
}

/** Canonical sparkdown: front matter, a scene, and top-level `function` blocks. */
function buildScript(blocks: number, bodyLines: number) {
  const lines: string[] = [];
  lines.push("title: Annotation Stability");
  lines.push("author: Anonymous");
  lines.push("");
  lines.push("scene rooftop");
  lines.push("= INT. ROOFTOP - NIGHT");
  lines.push(":");
  lines.push("  A moonlit rooftop, wind moving across the gravel.");
  lines.push("hero:");
  lines.push("  Hello there.");
  lines.push("end");
  lines.push("");
  for (let b = 0; b < blocks; b++) {
    lines.push(`function tally_${b}()`);
    for (let i = 0; i < bodyLines; i++) {
      lines.push(`  local slot_${b}_${i} = ${i} + 1`);
    }
    lines.push("  return 0");
    lines.push("end");
    lines.push("");
  }
  return lines.join("\n");
}

/** Offset of a block's `function` keyword — where `top_level_begin` is anchored. */
function blockStart(text: string, block: number) {
  const at = text.indexOf(`function tally_${block}()`);
  expect(at, `block ${block} present`).toBeGreaterThanOrEqual(0);
  return at;
}

/** Offset just past an identifier deep inside a block's body. */
function deepOffset(text: string, block: number, line: number) {
  const marker = `local slot_${block}_${line}`;
  expect(text).toContain(marker);
  return text.indexOf(marker) + marker.length;
}

describe("incremental annotation stability", () => {
  it("does not accumulate annotations while typing inside a top-level function block", () => {
    const text = buildScript(1, 80);
    const blockFrom = blockStart(text, 0);
    const offset = deepOffset(text, 0, 60);
    expectMarkPresent(text, blockFrom);

    const registry = open(text);
    const before = snapshot(registry);
    expectReachedTheBug(typeAndUndo(registry, text, offset, 30), blockFrom);

    // Counts first: a mismatch here is the #322 growth, and the message names
    // which set drifted. The full positional compare below is the real oracle.
    expect(counts(snapshot(registry))).toEqual(counts(before));
    expect(snapshot(registry)).toEqual(before);
  });

  it("does not accumulate annotations while typing in any of several top-level blocks", () => {
    // Each block contributes its own `top_level_begin`, and each one is a
    // separate anchor that can end up behind the window.
    const text = buildScript(4, 20);
    const registry = open(text);
    const before = snapshot(registry);

    for (let b = 0; b < 4; b++) {
      const blockFrom = blockStart(text, b);
      const offset = deepOffset(text, b, 15);
      expectMarkPresent(text, blockFrom);
      expectReachedTheBug(typeAndUndo(registry, text, offset, 8), blockFrom);
      expect(snapshot(registry), `after typing in block ${b}`).toEqual(before);
    }
  });

  it("matches a cold parse after typing inside a top-level function block", () => {
    const text = buildScript(1, 40);
    const blockFrom = blockStart(text, 0);
    const offset = deepOffset(text, 0, 30);
    expectMarkPresent(text, blockFrom);

    const incremental = open(text);
    expectReachedTheBug(typeAndUndo(incremental, text, offset, 12), blockFrom);

    expect(snapshot(incremental)).toEqual(snapshot(open(text)));
  });
});
