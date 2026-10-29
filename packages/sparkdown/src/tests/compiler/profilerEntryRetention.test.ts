import { PerformanceObserver } from "node:perf_hooks";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import {
  profile,
  setRetainProfilerEntries,
} from "../../compiler/utils/profile";
import { generatePerfScreenplay } from "./perfFixture";

const perf = globalThis.performance;

const countEntries = () =>
  perf.getEntriesByType("mark").length +
  perf.getEntriesByType("measure").length;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const observeMeasures = async (run: () => void | Promise<void>) => {
  const seen: { name: string; duration: number }[] = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      seen.push({ name: entry.name, duration: entry.duration });
    }
  });
  observer.observe({ entryTypes: ["measure"] });
  try {
    await run();
    await sleep(50);
  } finally {
    observer.disconnect();
  }
  return seen;
};

describe("profiler user-timing entries", () => {
  beforeEach(() => {
    setRetainProfilerEntries(false);
    perf.clearMarks();
    perf.clearMeasures();
  });

  it("retains nothing once a phase is measured", () => {
    for (let i = 0; i < 50; i += 1) {
      profile("start", "test", "phase", "inmemory:///main.sd");
      profile("end", "test", "phase", "inmemory:///main.sd");
    }
    expect(countEntries()).toBe(0);
  });

  it("still emits a measure for every completed phase", async () => {
    const seen = await observeMeasures(() => {
      for (let i = 0; i < 5; i += 1) {
        profile("start", "test", "phase", "inmemory:///main.sd");
        profile("end", "test", "phase", "inmemory:///main.sd");
      }
    });
    expect(seen).toHaveLength(5);
    expect(seen[0]?.name).toBe("test phase inmemory:///main.sd");
  });

  it("measures BOTH of two overlapping same-name phases", async () => {
    const seen = await observeMeasures(async () => {
      profile("start", "test", "compile", "inmemory:///main.sd");
      await sleep(80);
      profile("start", "test", "compile", "inmemory:///main.sd");
      await sleep(80);
      profile("end", "test", "compile", "inmemory:///main.sd");
      await sleep(80);
      profile("end", "test", "compile", "inmemory:///main.sd");
    });
    expect(seen).toHaveLength(2);
    expect(countEntries()).toBe(0);
  });

  it("a phase that never ended does not corrupt the next one's duration", async () => {
    const seen = await observeMeasures(async () => {
      profile("start", "test", "compile", "inmemory:///main.sd");
      await sleep(300);
      profile("start", "test", "compile", "inmemory:///main.sd");
      await sleep(100);
      profile("end", "test", "compile", "inmemory:///main.sd");
      await sleep(50);
      profile("start", "test", "compile", "inmemory:///main.sd");
      await sleep(100);
      profile("end", "test", "compile", "inmemory:///main.sd");
    });
    expect(seen).toHaveLength(2);
    for (const measure of seen) {
      expect(measure.duration).toBeGreaterThan(80);
      expect(measure.duration).toBeLessThan(200);
    }
  });

  it("retains nothing for phases that never end, and still drains", async () => {
    const seen = await observeMeasures(async () => {
      for (let i = 0; i < 200; i += 1) {
        profile("start", "test", "orphan", "inmemory:///main.sd");
      }
      expect(countEntries()).toBe(0);
      profile("end", "test", "orphan", "inmemory:///main.sd");
    });
    expect(seen).toHaveLength(1);
    expect(countEntries()).toBe(0);
  });

  it("writes nothing at all when no profiler id is set", async () => {
    const seen = await observeMeasures(() => {
      profile("start", undefined, "phase", "inmemory:///main.sd");
      profile("end", undefined, "phase", "inmemory:///main.sd");
    });
    expect(seen).toHaveLength(0);
    expect(countEntries()).toBe(0);
  });

  it("clears by default — a freshly loaded module retains nothing", async () => {
    vi.resetModules();
    const fresh = await import("../../compiler/utils/profile");
    fresh.profile("start", "test", "default", "inmemory:///main.sd");
    fresh.profile("end", "test", "default", "inmemory:///main.sd");
    expect(countEntries()).toBe(0);
  });

  it("retains entries for a harness that opts in", () => {
    setRetainProfilerEntries(true);
    try {
      for (let i = 0; i < 3; i += 1) {
        profile("start", "test", "phase", "inmemory:///main.sd");
        profile("end", "test", "phase", "inmemory:///main.sd");
      }
      expect(perf.getEntriesByType("measure")).toHaveLength(3);
    } finally {
      setRetainProfilerEntries(false);
    }
  });

  it("does not accumulate entries across repeated compiles", async () => {
    const uri = "inmemory:///main.sd";
    const sceneCount = 4;
    let source = generatePerfScreenplay(sceneCount);

    const realWarn = console.warn;
    const realError = console.error;
    console.warn = () => {};
    console.error = () => {};

    try {
      const compiler = new SparkdownCompiler();
      compiler.profilerId = "test";
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
      compiler.compile({ textDocument: { uri } });

      const marker = `This is dialogue line one in scene ${Math.floor(
        sceneCount / 2,
      )}.`;
      let version = 1;
      const edit = () => {
        version += 1;
        const markerIndex = source.indexOf(marker);
        if (markerIndex < 0) {
          throw new Error("marker not found — edit relocated unexpectedly");
        }
        const insertOffset = markerIndex + marker.length;
        const before = source.slice(0, insertOffset);
        const line = before.split("\n").length - 1;
        const character = insertOffset - (before.lastIndexOf("\n") + 1);
        compiler.updateDocument({
          textDocument: { uri, version },
          contentChanges: [
            {
              range: { start: { line, character }, end: { line, character } },
              text: "x",
            },
          ],
        });
        source =
          source.slice(0, insertOffset) + "x" + source.slice(insertOffset);
        compiler.compile({ textDocument: { uri } });
      };

      const seen = await observeMeasures(() => edit());
      expect(seen.length).toBeGreaterThan(0);

      for (let i = 0; i < 4; i += 1) {
        edit();
      }
      const afterFiveEdits = countEntries();

      for (let i = 0; i < 15; i += 1) {
        edit();
      }
      const afterTwentyEdits = countEntries();

      expect(afterTwentyEdits).toBe(afterFiveEdits);
      expect(afterTwentyEdits).toBeLessThan(50);
    } finally {
      console.warn = realWarn;
      console.error = realError;
    }
  });
});
