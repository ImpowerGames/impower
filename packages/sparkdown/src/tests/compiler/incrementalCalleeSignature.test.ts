// Callee-signature reuse oracle (regression for a bug the general
// incremental-vs-cold oracles CANNOT generate).
//
// A call site's bytecode is derived from its CALLEE's parameter list at the
// CALLER's generation time: a trailing `...` makes the caller emit a
// `PackTuple` to fill the callee's varargs slot (Divert.GenerateRuntimeObject).
// Incremental ExportRuntime reuses a flow whose OWN chunks are unchanged — so
// without a guard, editing a callee's signature leaves every reused caller
// emitting argument pushes for the old signature. The callee then pops a
// different number of values than the caller pushed, silently and with no
// diagnostic.
//
// `incrementalEquivalence`'s fixture has a single non-variadic function and
// never edits a parameter list, and the cumulative fuzz alphabet contains
// neither "..." nor "," — so neither oracle can construct this. Hence a
// dedicated fixture: no front matter (zero root blocks) so the root-region
// guard stays quiet and flow reuse genuinely engages on the edit under test.
import "../../inkjs/engine/Container";
import { describe, it, expect } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

function pick(p: any) {
  return {
    compiled: p.compiled,
    diagnostics: p.diagnostics,
  };
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

function coldCompile(text: string) {
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
  });
  return pick(c.compile({ textDocument: { uri: URI } }).program);
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

const quiet = <T>(fn: () => T): T => {
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

function runScenario(
  name: string,
  base: string,
  steps: { find: string; replace: string }[],
) {
  const log: string[] = [];
  let text = base;
  const incr = new SparkdownCompiler();
  incr.configure({
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
  });
  incr.compile({ textDocument: { uri: URI } });
  let version = 1;
  for (const [i, step] of steps.entries()) {
    const offset = text.indexOf(step.find);
    if (offset < 0) throw new Error(`${name}: not found: ${step.find}`);
    const start = posAt(text, offset);
    const end = posAt(text, offset + step.find.length);
    version += 1;
    incr.updateDocument({
      textDocument: { uri: URI, version },
      contentChanges: [{ range: { start, end }, text: step.replace }],
    });
    text =
      text.slice(0, offset) +
      step.replace +
      text.slice(offset + step.find.length);
    const prog = incr.compile({ textDocument: { uri: URI } }).program;
    const reused = [...((incr as any)._reusedFlowsThisCompile ?? [])].map(
      (f: any) => f?.identifier?.name,
    );
    const a = stable(pick(prog));
    const b = stable(coldCompile(text));
    const tag = `${name} step${i + 1} reused=[${reused.join(",")}] disabled=${(incr as any)._flowReuseDisabled}`;
    if (a !== b) {
      let k = 0;
      while (k < a.length && k < b.length && a[k] === b[k]) k++;
      log.push(
        `${tag} DIVERGED at ${k}\n  INCR: ${a.slice(Math.max(0, k - 200), k + 400)}\n  COLD: ${b.slice(Math.max(0, k - 200), k + 400)}`,
      );
    } else {
      log.push(`${tag} ok`);
    }
  }
  return log;
}

// No front matter at all -> zero root blocks -> stable reuse.
function doc(fnDecl: string, callSite: string) {
  return [
    fnDecl,
    "  return 1",
    "",
    "scene alpha",
    ":",
    "  Alpha action.",
    callSite,
    "-> DONE",
    "end",
    "",
    "scene beta",
    ":",
    "  Beta action",
    "-> DONE",
    "end",
    "",
  ].join("\n");
}

const WARM = (n: number) => ({
  find: `Beta action${"!".repeat(n)}`,
  replace: `Beta action${"!".repeat(n + 1)}`,
});

describe("incremental callee-signature reuse", () => {
  it("callee arity change while caller flow is reused", () => {
    const out = quiet(() =>
      runScenario("arity", doc("function addup(a):", "& local r = addup(2)"), [
        WARM(0),
        WARM(1),
        { find: "function addup(a):", replace: "function addup(a, b):" },
        WARM(2),
        WARM(3),
      ]),
    );
    console.info(out.join("\n"));
    expect(out.filter((s) => s.includes("DIVERGED"))).toEqual([]);
  });

  it("callee becomes variadic while caller flow is reused", () => {
    const out = quiet(() =>
      runScenario("vararg", doc("function addup(a):", "& local r = addup(2)"), [
        WARM(0),
        WARM(1),
        { find: "function addup(a):", replace: "function addup(a, ...):" },
        WARM(2),
        WARM(3),
      ]),
    );
    console.info(out.join("\n"));
    expect(out.filter((s) => s.includes("DIVERGED"))).toEqual([]);
  });

  it("callee stops being variadic while caller flow is reused", () => {
    const out = quiet(() =>
      runScenario(
        "unvararg",
        doc("function addup(a, ...):", "& local r = addup(2, 3, 4)"),
        [
          WARM(0),
          WARM(1),
          {
            find: "function addup(a, ...):",
            replace: "function addup(a, b, c):",
          },
          WARM(2),
          WARM(3),
        ],
      ),
    );
    console.info(out.join("\n"));
    expect(out.filter((s) => s.includes("DIVERGED"))).toEqual([]);
  });

  it("baseline: plain edits reuse", () => {
    const out = quiet(() =>
      runScenario("baseline", doc("function addup(a):", "& local r = addup(2)"), [
        WARM(0),
        WARM(1),
        WARM(2),
      ]),
    );
    console.info(out.join("\n"));
    expect(out.filter((s) => s.includes("DIVERGED"))).toEqual([]);
  });
});
