import { PerformanceObserver } from "node:perf_hooks";
import { beforeEach, describe, expect, it } from "vitest";
import { profile } from "../src/browser/utils/profile";

// `profile()` writes to the *global* performance timeline.
const perf = globalThis.performance;

const countEntries = () =>
  perf.getEntriesByType("mark").length +
  perf.getEntriesByType("measure").length;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Entries are cleared as soon as they are emitted, so the buffer cannot be read
// back. An observer still receives them — that is the whole basis for clearing.
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

describe("jsonrpc profile()", () => {
  beforeEach(() => {
    perf.clearMarks();
    perf.clearMeasures();
  });

  it("does not accumulate entries across repeated messages", () => {
    // This helper brackets every request and response of a connection that
    // lives as long as the worker does.
    for (let i = 0; i < 200; i += 1) {
      profile("start", "player", "request compiler/compile");
      profile("end", "player", "request compiler/compile");
    }
    expect(countEntries()).toBe(0);
  });

  it("still emits a measure for every completed phase", async () => {
    const seen = await observeMeasures(() => {
      for (let i = 0; i < 5; i += 1) {
        profile("start", "player", "request compiler/compile");
        profile("end", "player", "request compiler/compile");
      }
    });
    expect(seen).toHaveLength(5);
    expect(seen[0]?.name).toBe("player request compiler/compile");
  });

  it("measures BOTH of two overlapping same-name phases", async () => {
    // A connection handles concurrent requests of the same method, and the
    // phase name carries no request id — so this interleaving is routine.
    const seen = await observeMeasures(async () => {
      profile("start", "player", "request compiler/compile"); // A
      await sleep(80);
      profile("start", "player", "request compiler/compile"); // B
      await sleep(80);
      profile("end", "player", "request compiler/compile"); // A ends (~160ms)
      await sleep(80);
      profile("end", "player", "request compiler/compile"); // B ends (~160ms)
    });
    // Both phases must be measured. Clearing marks by name would have deleted
    // B's start mark when A finished, losing B's measurement entirely.
    expect(seen).toHaveLength(2);
    expect(countEntries()).toBe(0);
  });

  it("a phase that never ended does not corrupt the next one's duration", async () => {
    // `SparkdownWorkspace.compile` opens a phase and returns early on the
    // no-change path, so a stale start sitting in the bookkeeping is routine.
    // Pairing an end with the OLDEST outstanding start would charge it the
    // whole idle gap, and stay one behind forever.
    const seen = await observeMeasures(async () => {
      profile("start", "player", "request compiler/compile"); // orphaned
      await sleep(300);
      profile("start", "player", "request compiler/compile");
      await sleep(100);
      profile("end", "player", "request compiler/compile");
      await sleep(50);
      profile("start", "player", "request compiler/compile");
      await sleep(100);
      profile("end", "player", "request compiler/compile");
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
        profile("start", "player", "request compiler/compile");
      }
      expect(countEntries()).toBe(0);
      profile("end", "player", "request compiler/compile");
    });
    expect(seen).toHaveLength(1);
    expect(countEntries()).toBe(0);
  });

  it("bounds its own bookkeeping for unbounded phase names", async () => {
    // `lsp: onCompletionResolve ${item.label}` embeds an unbounded value, and
    // those handlers have no try/finally — a throw leaves the phase open under
    // a name that may never be seen again.
    const seen = await observeMeasures(async () => {
      for (let i = 0; i < 5000; i += 1) {
        profile("start", "player", `request unique/${i}`);
      }
      expect(countEntries()).toBe(0);
      // The most recent names are still tracked; the oldest were evicted.
      profile("end", "player", "request unique/4999");
      profile("end", "player", "request unique/0");
    });
    expect(seen.map((s) => s.name)).toEqual(["player request unique/4999"]);
    expect(countEntries()).toBe(0);
  });

  it("writes nothing at all when no profiler id is set", async () => {
    const seen = await observeMeasures(() => {
      profile("start", undefined, "request compiler/compile");
      profile("end", undefined, "request compiler/compile");
    });
    expect(seen).toHaveLength(0);
    expect(countEntries()).toBe(0);
  });

  it("does not throw when a message ends without a start", () => {
    expect(() =>
      profile("end", "player", "response compiler/compile"),
    ).not.toThrow();
    expect(countEntries()).toBe(0);
  });
});
