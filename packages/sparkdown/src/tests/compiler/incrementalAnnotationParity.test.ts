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

function fixture() {
  const L: string[] = [];
  L.push("title: Parity Fixture");
  L.push("author: Anonymous");
  L.push("");
  L.push("store trust = 0");
  L.push("");
  for (let s = 0; s < 4; s++) {
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

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function safeEditOffsets(text: string) {
  const offsets: number[] = [];
  for (const m of text.matchAll(
    /\b(?:describing|careful|detail|Action|Line)\b/g,
  )) {
    offsets.push(m.index! + m[0].length);
  }
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
    const { missing, extra } = diff(incrementalSnapshot, coldSnapshot);
    expect(
      { missing, extra },
      `step ${step} (seed ${seed}) edit at ${offset}`,
    ).toEqual({ missing: [], extra: [] });
    expect(
      incrementalSnapshot,
      `step ${step} (seed ${seed}): annotation ORDER diverged`,
    ).toEqual(coldSnapshot);

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

    expect(named(incremental, "trust").length).toBe(5);
    expect(named(incremental, "trust")).toEqual(named(open(text), "trust"));
    expect(named(incremental, "companion_3").length).toBeGreaterThan(0);
    expect(named(incremental, "companion_3")).toEqual(
      named(open(text), "companion_3"),
    );
  });
});
