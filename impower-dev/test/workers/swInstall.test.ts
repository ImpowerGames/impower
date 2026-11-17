// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@impower/sparkdown/src/filters/filteredSvg", () => ({
  getOrCreateFilteredSvg: vi.fn(),
}));
vi.mock("@impower/sparkdown/src/morph/assetService", () => ({
  parseMorphAssetRequest: () => undefined,
  serveMorphAsset: vi.fn(),
}));
vi.mock("@impower/sparkdown/src/morph/service", () => ({
  MorphBakeService: class {},
}));
vi.mock("@impower/sparkdown/src/thumbnails/composeThumbnail", () => ({
  getOrCreateThumbnail: vi.fn(),
}));

const RESOURCES = ["/", "/editor.js", "/opfs-workspace.200.js"];

afterEach(() => {
  vi.unstubAllGlobals();
});

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const install = async () => {
  vi.resetModules();
  const precache = deferred();
  const listeners: Record<string, (event: unknown) => void> = {};
  const addAll = vi.fn(() => precache.promise);
  vi.stubGlobal("SW_VERSION_INJECTED", "200");
  vi.stubGlobal("SW_RESOURCES_INJECTED", JSON.stringify(RESOURCES));
  vi.stubGlobal("SW_NODE_ENV_INJECTED", "production");
  vi.stubGlobal("self", {
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = listener;
    },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  });
  vi.stubGlobal("caches", { open: async () => ({ addAll }) });
  await import("../../src/workers/sw");
  let waited: Promise<unknown> | undefined;
  listeners["install"]!({
    waitUntil: (promise: Promise<unknown>) => {
      waited = promise;
    },
  });
  expect(waited, "install extends its lifetime").toBeDefined();
  let state: "pending" | "fulfilled" | "rejected" = "pending";
  const outcome = waited!.then(
    () => {
      state = "fulfilled";
    },
    () => {
      state = "rejected";
    },
  );
  return { precache, addAll, outcome, state: () => state };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("service worker install", () => {
  it("does not finish while the precache is still filling", async () => {
    const { precache, addAll, outcome, state } = await install();
    await flush();
    expect(addAll).toHaveBeenCalledWith(RESOURCES);
    expect(state(), "install is still waiting for every file").toBe("pending");
    precache.resolve();
    await outcome;
    expect(state()).toBe("fulfilled");
  });

  it("fails when a file cannot be cached, so the previous version keeps serving", async () => {
    const { precache, outcome, state } = await install();
    await flush();
    precache.reject(new TypeError("network error"));
    await outcome;
    expect(state()).toBe("rejected");
  });
});
