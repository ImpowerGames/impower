import { PerformanceObserver } from "node:perf_hooks";
import { beforeEach, describe, expect, it } from "vitest";
import { profile } from "../../utils/logging/profile";

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

describe("language server profile()", () => {
  beforeEach(() => {
    perf.clearMarks();
    perf.clearMeasures();
  });

  it("does not accumulate entries across repeated requests", () => {
    // A language server is long-lived and this helper is unconditional, so
    // anything retained here grows for as long as the server runs.
    for (let i = 0; i < 200; i += 1) {
      profile("start", "lsp: onHover", "file:///main.sd");
      profile("end", "lsp: onHover", "file:///main.sd");
    }
    expect(countEntries()).toBe(0);
  });

  it("does not accumulate entries for a phase with no uri", () => {
    for (let i = 0; i < 200; i += 1) {
      profile("start", "lsp: onDocumentColor");
      profile("end", "lsp: onDocumentColor");
    }
    expect(countEntries()).toBe(0);
  });

  it("still emits a measure named after the phase and uri", async () => {
    const seen = await observeMeasures(() => {
      profile("start", "lsp: onHover", "file:///main.sd");
      profile("end", "lsp: onHover", "file:///main.sd");
      // A uri-less phase keeps its name untouched — no trailing space.
      profile("start", "lsp: onDocumentColor");
      profile("end", "lsp: onDocumentColor");
    });
    expect(seen.map((s) => s.name)).toEqual([
      "lsp: onHover file:///main.sd",
      "lsp: onDocumentColor",
    ]);
  });

  it("measures BOTH of two overlapping same-name requests", async () => {
    // vscode-jsonrpc does not serialize async handlers, so two requests for the
    // same document can be in flight at once and the phase names collide.
    const seen = await observeMeasures(async () => {
      profile("start", "lsp: semanticTokens.on", "file:///main.sd"); // A
      await sleep(80);
      profile("start", "lsp: semanticTokens.on", "file:///main.sd"); // B
      await sleep(80);
      profile("end", "lsp: semanticTokens.on", "file:///main.sd"); // A (~160ms)
      await sleep(80);
      profile("end", "lsp: semanticTokens.on", "file:///main.sd"); // B (~160ms)
    });
    // Both requests must be measured. Clearing marks by name would have deleted
    // B's start mark when A finished, losing B's measurement entirely.
    expect(seen).toHaveLength(2);
    expect(countEntries()).toBe(0);
  });

  it("a request that never ended does not corrupt the next one's duration", async () => {
    // `resolveCompletion` and friends are awaited with no try/finally, so a
    // throw leaves a stale start behind.
    const seen = await observeMeasures(async () => {
      profile("start", "lsp: onCompletion", "file:///main.sd"); // orphaned
      await sleep(300);
      profile("start", "lsp: onCompletion", "file:///main.sd");
      await sleep(100);
      profile("end", "lsp: onCompletion", "file:///main.sd");
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.duration).toBeGreaterThan(80);
    expect(seen[0]!.duration).toBeLessThan(200);
  });

  it("retains nothing for requests that never end, and still drains", async () => {
    // `resolveCompletion` and friends are awaited with no try/finally, so a
    // throw leaves the phase permanently open.
    const seen = await observeMeasures(async () => {
      for (let i = 0; i < 200; i += 1) {
        profile("start", "lsp: onCompletion", "file:///main.sd");
      }
      expect(countEntries()).toBe(0);
      profile("end", "lsp: onCompletion", "file:///main.sd");
    });
    expect(seen).toHaveLength(1);
    expect(countEntries()).toBe(0);
  });

  it("does not throw when a request ends without a start", () => {
    expect(() =>
      profile("end", "lsp: onReferences", "file:///main.sd"),
    ).not.toThrow();
    expect(countEntries()).toBe(0);
  });
});
