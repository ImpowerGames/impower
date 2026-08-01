import "../../inkjs/engine/Container";
import { PerformanceObserver } from "node:perf_hooks";
import { beforeEach, describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const perf = globalThis.performance;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Entries are cleared as soon as they are emitted (#321), so the buffer cannot
// be read back — an observer is the only way to see what was measured.
// Observer delivery is asynchronous and the callback can be delayed well past
// a fixed sleep when the suite runs under load, so wait for the entries rather
// than for the clock.
const observeMeasures = async (
  run: () => void | Promise<void>,
  minCount = 1,
  timeoutMs = 5000,
) => {
  const seen: string[] = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      seen.push(entry.name);
    }
  });
  observer.observe({ entryTypes: ["measure"] });
  try {
    await run();
    const start = Date.now();
    while (seen.length < minCount && Date.now() - start < timeoutMs) {
      await sleep(10);
    }
    await sleep(20);
  } finally {
    observer.disconnect();
  }
  return seen;
};

const URI = "inmemory:///main.sd";

const SOURCE = ["$:", "  A ROOFTOP", "", "ALICE:", "  Hello.", ""].join("\n");

const newCompiler = () => {
  const compiler = new SparkdownCompiler();
  compiler.profilerId = "test";
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: SOURCE,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  return compiler;
};

describe("compiler profiler phases close on every exit path", () => {
  const realWarn = console.warn;
  const realError = console.error;

  beforeEach(() => {
    perf.clearMarks();
    perf.clearMeasures();
    console.warn = () => {};
    console.error = () => {};
  });

  const restore = () => {
    console.warn = realWarn;
    console.error = realError;
  };

  it("emits an ink/parse measure on a normal compile", async () => {
    try {
      const compiler = newCompiler();
      const seen = await observeMeasures(() => {
        compiler.compile({ textDocument: { uri: URI } });
      });
      expect(seen.some((name) => name.includes("ink/parse"))).toBe(true);
    } finally {
      restore();
    }
  });

  // `compile` catches a mid-parse throw, logs it and keeps serving, so the
  // trailing `profile("end", …)` was never reached and the compile that failed
  // — the one worth looking at — contributed no measurement at all.
  it("emits an ink/parse measure even when parsing throws", async () => {
    try {
      const compiler = newCompiler();
      // Stub after configure(), which parses once itself.
      (compiler as unknown as Record<string, unknown>)["parseIncrementally"] =
        () => {
          throw new Error("boom");
        };
      const seen = await observeMeasures(() => {
        // The compiler swallows the throw by design; this must not reject.
        compiler.compile({ textDocument: { uri: URI } });
      });
      expect(seen.some((name) => name.includes("ink/parse"))).toBe(true);
    } finally {
      restore();
    }
  });

  // `ink/parse` is only the first of five phases under that same swallowing
  // catch. A throw in a later one has to close its phase too — `ink/compile`
  // (ExportRuntime) is the phase the catch was written for.
  it("emits a measure for a later phase when that phase throws", async () => {
    try {
      const compiler = newCompiler();
      (compiler as unknown as Record<string, unknown>)["populateAllLocations"] =
        () => {
          throw new Error("boom");
        };
      const seen = await observeMeasures(() => {
        compiler.compile({ textDocument: { uri: URI } });
      });
      expect(seen.some((name) => name.includes("populateLocations"))).toBe(
        true,
      );
    } finally {
      restore();
    }
  });
});
