import { PerformanceObserver } from "node:perf_hooks";
import { beforeEach, describe, expect, it } from "vitest";
import { profile } from "./profile";

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

describe("player profile()", () => {
  beforeEach(() => {
    perf.clearMarks();
    perf.clearMeasures();
  });

  it("does not accumulate entries across repeated phases", () => {
    for (let i = 0; i < 200; i += 1) {
      profile("start", "game/update");
      profile("end", "game/update");
    }
    expect(countEntries()).toBe(0);
  });

  it("still emits a measure for every completed phase", async () => {
    const seen = await observeMeasures(() => {
      for (let i = 0; i < 5; i += 1) {
        profile("start", "game/update");
        profile("end", "game/update");
      }
    });
    expect(seen).toHaveLength(5);
    expect(seen[0]?.name).toBe("game/update");
  });

  it("measures BOTH of two overlapping same-name phases", async () => {
    const seen = await observeMeasures(async () => {
      profile("start", "compiler/didCompile");
      await sleep(80);
      profile("start", "compiler/didCompile");
      await sleep(80);
      profile("end", "compiler/didCompile");
      await sleep(80);
      profile("end", "compiler/didCompile");
    });
    expect(seen).toHaveLength(2);
    expect(countEntries()).toBe(0);
  });

  it("a phase that never ended does not corrupt the next one's duration", async () => {
    const seen = await observeMeasures(async () => {
      profile("start", "game/create");
      await sleep(300);
      profile("start", "game/create");
      await sleep(100);
      profile("end", "game/create");
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.duration).toBeGreaterThan(80);
    expect(seen[0]!.duration).toBeLessThan(200);
  });

  it("retains nothing for phases that never end, and still drains", async () => {
    const seen = await observeMeasures(async () => {
      for (let i = 0; i < 200; i += 1) {
        profile("start", "game/create");
      }
      expect(countEntries()).toBe(0);
      profile("end", "game/create");
    });
    expect(seen).toHaveLength(1);
    expect(countEntries()).toBe(0);
  });

  it("does not throw when a phase ends without a start", () => {
    expect(() => profile("end", "game/destroy")).not.toThrow();
    expect(countEntries()).toBe(0);
  });
});
