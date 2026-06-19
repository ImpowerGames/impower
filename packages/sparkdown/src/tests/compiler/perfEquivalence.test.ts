import "../../inkjs/engine/Container";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { generatePerfScreenplay } from "./perfFixture";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Byte-identical output gate for the compiler perf work. Compiles the large
// synthetic screenplay both cold and after an incremental edit, and snapshots
// the FULL emitted program (compiled ink JSON + every *Locations map +
// diagnostics + context). Any optimization that changes output flips this.
//
// `program` is serialized with sorted keys so the comparison is insensitive to
// object-key insertion order (we only care about value equivalence), EXCEPT we
// deliberately do NOT sort arrays — array order is semantically meaningful in
// the ink bytecode and in pathLocations ordering.
function stableStringify(value: unknown): string {
  const seen = new WeakSet();
  const walk = (v: any): any => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) {
        out[k] = walk(v[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value), null, 2);
}

function programSnapshot(source: string): string {
  const uri = "inmemory:///main.sd";
  const compiler = new SparkdownCompiler();
  // Silence diagnostic logging noise.
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const cold = compiler.compile({ textDocument: { uri } }).program;

  // Apply one incremental edit (insert a char mid-document) then recompile.
  const marker = "This is dialogue line one in scene 5.";
  const insertOffset = source.indexOf(marker) + marker.length - 1;
  const before = source.slice(0, insertOffset);
  const line = before.split("\n").length - 1;
  const character = insertOffset - (before.lastIndexOf("\n") + 1);
  compiler.updateDocument({
    textDocument: { uri, version: 2 },
    contentChanges: [
      { range: { start: { line, character }, end: { line, character } }, text: "x" },
    ],
  });
  const warm = compiler.compile({ textDocument: { uri } }).program;
  console.warn = realWarn;
  console.error = realError;

  const pick = (p: any) => ({
    compiled: p.compiled,
    pathLocations: p.pathLocations,
    dataLocations: p.dataLocations,
    functionLocations: p.functionLocations,
    sceneLocations: p.sceneLocations,
    knotLocations: p.knotLocations,
    stitchLocations: p.stitchLocations,
    branchLocations: p.branchLocations,
    labelLocations: p.labelLocations,
    context: p.context,
    diagnostics: p.diagnostics,
    ui: p.ui,
  });
  return stableStringify({ cold: pick(cold), warm: pick(warm) });
}

describe("compiler perf equivalence gate", () => {
  it("emits byte-identical program before/after optimization", async () => {
    const source = generatePerfScreenplay(60);
    const snapshot = programSnapshot(source);
    await expect(snapshot).toMatchFileSnapshot(
      join(__dirname, "__snapshots__", "perfEquivalence.snap"),
    );
  });
});
