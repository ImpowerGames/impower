import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { describe, expect, it } from "vitest";
import type { SparkdownAnnotators } from "../../compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

const URI = "inmemory:///main.sd";

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

let nextVersion = 2;

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
  expect(registry.get(URI)!.getText()).toBe(text);
  return editStarts;
}

function expectMarkPresent(text: string, blockFrom: number) {
  expect(snapshot(open(text)), `top_level_begin at ${blockFrom}`).toContain(
    `formatting ${blockFrom}-${blockFrom} "top_level_begin"`,
  );
}

function expectReachedTheBug(editStarts: (number | null)[], blockFrom: number) {
  expect(
    editStarts.filter((s) => s != null && s > blockFrom).length,
    `updates whose window starts after block ${blockFrom} (saw ${JSON.stringify(editStarts)})`,
  ).toBeGreaterThan(0);
}

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

function blockStart(text: string, block: number) {
  const at = text.indexOf(`function tally_${block}()`);
  expect(at, `block ${block} present`).toBeGreaterThanOrEqual(0);
  return at;
}

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

    expect(counts(snapshot(registry))).toEqual(counts(before));
    expect(snapshot(registry)).toEqual(before);
  });

  it("does not accumulate annotations while typing in any of several top-level blocks", () => {
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
