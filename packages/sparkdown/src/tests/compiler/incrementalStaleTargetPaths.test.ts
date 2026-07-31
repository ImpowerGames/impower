// Stale-resolved-path oracle for incremental ExportRuntime.
//
// Resolution writes a resolved path INTO a runtime object. Under flow reuse
// that runtime object survives across compiles, so every such write needs a
// matching "no target this compile" reset or the reused flow keeps a path to
// something that no longer exists. `Divert.ResolveReferences` got that reset
// with the reuse work; these cover the two OTHER runtime values that hold an
// independently-resolved path:
//
//   - `DivertTarget` -> `runtimeDivertTargetValue` (a `-> knot` used as a
//     VALUE, e.g. inside `TURNS_SINCE(-> gamma)`)
//   - `TunnelOnwards` -> `_overrideDivertTarget` (`->-> gamma`)
//
// Both are reached by deleting a divert target while an unrelated flow that
// references it stays unchanged (and therefore reused). The general
// incremental-vs-cold oracles never construct that shape.
//
// SCOPE, measured rather than assumed: with the callee-signature guard in
// place these tests do NOT isolate the resets. Deleting a top-level flow
// changes the flow-name map, which disables reuse for that compile, so the
// invariant holds even with the resets removed (verified by removing them —
// both tests still passed). What they pin is the end-to-end invariant
// (incremental == cold when a divert target disappears), whichever guard
// upholds it. The resets stay as defense-in-depth: they become load-bearing
// the moment a guard is narrowed, and narrowing the guards is exactly the
// planned follow-up. Isolating them needs a target whose removal does not
// change the flow set (a labelled gather inside a `choose` block).
import "../../inkjs/engine/Container";
import { describe, it, expect } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

const pick = (p: any) => ({ compiled: p.compiled, diagnostics: p.diagnostics });

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

const quiet = <T,>(fn: () => T): T => {
  const w = console.warn;
  const e = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = w;
    console.error = e;
  }
};

function configured(text: string) {
  const c = new SparkdownCompiler();
  c.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return c;
}

// No front matter: zero root-region chunks, so the root-region guard stays
// quiet and flow reuse genuinely engages on the edit under test.
function doc(callerLine: string): string {
  const L: string[] = [];
  L.push("scene caller");
  L.push(":");
  L.push("  Caller action.");
  L.push(callerLine);
  L.push("-> DONE");
  L.push("end");
  L.push("");
  for (let i = 0; i < 3; i++) {
    L.push(`scene filler_${i}`);
    L.push(":");
    L.push(`  Filler action ${i}.`);
    L.push("-> DONE");
    L.push("end");
    L.push("");
  }
  L.push("scene gamma");
  L.push(":");
  L.push("  Gamma action.");
  L.push("-> DONE");
  L.push("end");
  L.push("");
  return L.join("\n");
}

const GAMMA_BLOCK = "scene gamma\n:\n  Gamma action.\n-> DONE\nend\n";

/** Drive edits through one compiler, comparing to a cold compile each step. */
function runSteps(base: string, steps: { find: string; replace: string }[]) {
  const incr = configured(base);
  incr.compile({ textDocument: { uri: URI } } as never);
  let text = base;
  let version = 1;
  const divergences: string[] = [];
  for (const [i, step] of steps.entries()) {
    const offset = text.indexOf(step.find);
    if (offset < 0) throw new Error(`step ${i}: not found: ${step.find}`);
    version += 1;
    incr.updateDocument({
      textDocument: { uri: URI, version },
      contentChanges: [
        {
          range: {
            start: posAt(text, offset),
            end: posAt(text, offset + step.find.length),
          },
          text: step.replace,
        },
      ],
    } as never);
    text =
      text.slice(0, offset) + step.replace + text.slice(offset + step.find.length);
    const incrProg = pick(
      (incr.compile({ textDocument: { uri: URI } } as never) as any).program,
    );
    const coldProg = pick(
      (configured(text).compile({ textDocument: { uri: URI } } as never) as any)
        .program,
    );
    if (stable(incrProg) !== stable(coldProg)) {
      divergences.push(`step ${i + 1} ("${step.find.slice(0, 30)}")`);
    }
  }
  return divergences;
}

// Warm-up edits in a filler scene, so `caller` is untouched and gets reused,
// then delete the target `caller` points at.
const WARM = (n: number) => ({
  find: `Filler action 1.${"!".repeat(n)}`,
  replace: `Filler action 1.${"!".repeat(n + 1)}`,
});

describe("incremental stale resolved paths", () => {
  it("divert-target VALUE decays when its target is deleted", () => {
    const divergences = quiet(() =>
      runSteps(doc("  Caller action {TURNS_SINCE(-> gamma)}."), [
        WARM(0),
        WARM(1),
        WARM(2),
        { find: GAMMA_BLOCK, replace: "" },
        WARM(3),
      ]),
    );
    expect(divergences).toEqual([]);
  });

  it("tunnel-onwards override decays when its target is deleted", () => {
    const divergences = quiet(() =>
      runSteps(doc("->-> gamma"), [
        WARM(0),
        WARM(1),
        WARM(2),
        { find: GAMMA_BLOCK, replace: "" },
        WARM(3),
      ]),
    );
    expect(divergences).toEqual([]);
  });
});
