import { PerformanceObserver } from "node:perf_hooks";
import { beforeEach, describe, expect, it } from "vitest";
import { profiled } from "../../utils/logging/profiled";

const perf = globalThis.performance;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const observeMeasures = async (
  run: () => void | Promise<void>,
  minCount = 1,
  timeoutMs = 5000,
) => {
  const seen: { name: string; duration: number }[] = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      seen.push({ name: entry.name, duration: entry.duration });
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

describe("profiled()", () => {
  beforeEach(() => {
    perf.clearMarks();
    perf.clearMeasures();
  });

  it("measures a synchronous phase", async () => {
    const seen = await observeMeasures(() => {
      const value = profiled("lsp: sync", "file:///main.sd", () => 42);
      expect(value).toBe(42);
    });
    expect(seen.map((s) => s.name)).toEqual(["lsp: sync file:///main.sd"]);
  });

  it("still measures a phase whose body throws", async () => {
    const seen = await observeMeasures(() => {
      expect(() =>
        profiled("lsp: throws", "file:///main.sd", () => {
          throw new Error("boom");
        }),
      ).toThrow("boom");
    });
    expect(seen.map((s) => s.name)).toEqual(["lsp: throws file:///main.sd"]);
  });

  it("measures an async phase across its whole settle, not just the call", async () => {
    const seen = await observeMeasures(async () => {
      await profiled("lsp: async", "file:///main.sd", async () => {
        await sleep(80);
        return "done";
      });
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.duration).toBeGreaterThan(50);
  });

  it("still measures an async phase that rejects, across its whole settle", async () => {
    const seen = await observeMeasures(async () => {
      await expect(
        profiled("lsp: rejects", "file:///main.sd", async () => {
          await sleep(80);
          throw new Error("nope");
        }),
      ).rejects.toThrow("nope");
    });
    expect(seen.map((s) => s.name)).toEqual(["lsp: rejects file:///main.sd"]);
    expect(seen[0]!.duration).toBeGreaterThan(50);
  });

  it("omits the uri from the name when there is none", async () => {
    const seen = await observeMeasures(() => {
      profiled("lsp: no-uri", undefined, () => 1);
    });
    expect(seen.map((s) => s.name)).toEqual(["lsp: no-uri"]);
  });

  it("measures both a throwing phase and the next one of the same name", async () => {
    const seen = await observeMeasures(async () => {
      expect(() =>
        profiled("lsp: reused", "file:///main.sd", () => {
          throw new Error("boom");
        }),
      ).toThrow();
      await sleep(200);
      profiled("lsp: reused", "file:///main.sd", () => 1);
    }, 2);
    expect(seen).toHaveLength(2);
    expect(seen[1]!.duration).toBeLessThan(100);
  });
});
