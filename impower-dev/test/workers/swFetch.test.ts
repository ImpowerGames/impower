// @vitest-environment node
// The editor's service worker, end to end: a `Range` request for a project
// file goes through the worker's own fetch listener and comes back with only
// the requested bytes.
//
// The preview's `<video preload="metadata">` reads a video's start through
// ranged requests to `/file:/…`, which this worker answers from OPFS. The
// worker is loaded as it ships, with its globals stubbed: its event
// registrations land on a fake `self`, and OPFS is an in-memory directory.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The generated-variant services the worker imports are not on the path
// a plain project file takes.
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

const bytes = Uint8Array.from({ length: 300 }, (_, i) => i % 256);
const listeners: Record<string, (event: unknown) => void> = {};

const directory = (entries: Record<string, unknown>) => ({
  getDirectoryHandle: async (name: string) => {
    const entry = entries[name];
    if (!entry || typeof (entry as any).getFileHandle !== "function") {
      throw new DOMException("not found", "NotFoundError");
    }
    return entry;
  },
  getFileHandle: async (name: string) => {
    const entry = entries[name];
    if (!entry || typeof (entry as any).getFile !== "function") {
      throw new DOMException("not found", "NotFoundError");
    }
    return entry;
  },
});

beforeAll(async () => {
  const file = { getFile: async () => new File([bytes], "intro.webm", { type: "video/webm" }) };
  const root = directory({
    local: directory({ assets: directory({ "intro.webm": file }) }),
  });
  vi.stubGlobal("self", {
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = listener;
    },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  });
  vi.stubGlobal("navigator", { storage: { getDirectory: async () => root } });
  await import("../../src/workers/sw");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const request = (headers?: Record<string, string>) => {
  let responded: Promise<Response> | undefined;
  listeners["fetch"]!({
    request: new Request("http://localhost/file:/local/assets/intro.webm?v=1-300", { headers }),
    respondWith: (response: Promise<Response>) => {
      responded = response;
    },
  });
  expect(responded, "the worker answers a /file:/ request").toBeDefined();
  return responded!;
};

const body = async (response: Response) =>
  Array.from(new Uint8Array(await response.arrayBuffer()));

describe("project-file requests through the service worker", () => {
  it("answers a whole-file request with 200 and every byte", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(await body(response)).toEqual(Array.from(bytes));
  });

  it("answers a ranged request with 206 and only the requested bytes", async () => {
    const response = await request({ Range: "bytes=100-149" });
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 100-149/300");
    expect(response.headers.get("Content-Length")).toBe("50");
    expect(response.headers.get("Content-Type")).toBe("video/webm");
    expect(await body(response)).toEqual(Array.from(bytes.slice(100, 150)));
  });

  it("answers a range past the end with 416", async () => {
    const response = await request({ Range: "bytes=300-" });
    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */300");
  });

  it("answers a missing file with 404", async () => {
    let responded: Promise<Response> | undefined;
    listeners["fetch"]!({
      request: new Request("http://localhost/file:/local/assets/missing.webm"),
      respondWith: (response: Promise<Response>) => {
        responded = response;
      },
    });
    expect((await responded!).status).toBe(404);
  });
});
