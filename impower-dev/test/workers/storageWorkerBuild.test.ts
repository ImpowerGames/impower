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

const ORIGIN = "http://localhost";
const OLD_BUILD = "100";
const NEW_BUILD = "200";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const storageWorkerAddressOf = async (build: string) => {
  vi.resetModules();
  vi.stubEnv("BUILD_ID", build);
  const requested: string[] = [];
  vi.stubGlobal(
    "Worker",
    class {
      onerror = null;
      constructor(url: string | URL) {
        requested.push(String(url));
      }
      addEventListener() {}
      postMessage() {}
    },
  );
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { default: WorkspaceFileSystem } = await import(
    "../../src/modules/spark-editor/workspace/WorkspaceFileSystem"
  );
  const ls = {
    connection: { onRequest() {}, sendNotification() {} },
    start: async () => {},
  };
  new WorkspaceFileSystem(
    ls as never,
    { settings: {}, onDidChange: () => () => {} } as never,
  );
  expect(requested, "the client starts one storage worker").toHaveLength(1);
  return new URL(requested[0]!, ORIGIN).href;
};

const newBuildServiceWorker = async () => {
  vi.resetModules();
  const listeners: Record<string, (event: unknown) => void> = {};
  const cached = new Map<string, string>([
    ["/", `page-${NEW_BUILD}`],
    ["/editor.js", `client-${NEW_BUILD}`],
  ]);
  vi.stubGlobal("SW_VERSION_INJECTED", NEW_BUILD);
  vi.stubGlobal("SW_NODE_ENV_INJECTED", "production");
  vi.stubGlobal("self", {
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = listener;
    },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  });
  vi.stubGlobal("caches", {
    open: async () => ({
      match: async (url: string) => {
        const body = cached.get(new URL(url, ORIGIN).pathname);
        return body === undefined ? undefined : new Response(body);
      },
    }),
  });
  const newBuildStorageWorker = new RegExp(
    `^/opfs-workspace(?:[.]${NEW_BUILD})?[.]js$`,
  );
  vi.stubGlobal("fetch", async (url: string) => {
    const pathname = new URL(url, ORIGIN).pathname;
    return newBuildStorageWorker.test(pathname)
      ? new Response(`storage-worker-${NEW_BUILD}`)
      : new Response("Not found", { status: 404 });
  });
  await import("../../src/workers/sw");
  return async (url: string) => {
    let responded: Promise<Response> | undefined;
    listeners["fetch"]!({
      request: new Request(url),
      respondWith: (response: Promise<Response>) => {
        responded = response;
      },
    });
    const response = await (responded ?? fetch(url));
    return { status: response.status, body: await response.text() };
  };
};

describe("storage worker build binding", () => {
  it("never answers an older client's storage worker request with the newer build's worker", async () => {
    const oldClientWorker = await storageWorkerAddressOf(OLD_BUILD);
    const request = await newBuildServiceWorker();
    const answer = await request(oldClientWorker);
    expect(answer.body).not.toBe(`storage-worker-${NEW_BUILD}`);
    expect(answer.status).toBe(404);
  });

  it("answers a client with the storage worker of its own build", async () => {
    const newClientWorker = await storageWorkerAddressOf(NEW_BUILD);
    const request = await newBuildServiceWorker();
    const answer = await request(newClientWorker);
    expect(answer).toEqual({ status: 200, body: `storage-worker-${NEW_BUILD}` });
  });
});
