// The page's side of the `assets/*` protocol: every load request is answered,
// progress comes back as notifications, and the page's own pins (what is on
// screen, what is playing) reach the cache.

import { describe, expect, it } from "vitest";
import { AssetCache, type ImageTarget } from "../assets/AssetCache";
import AssetManager from "./AssetManager";

/** An image that loads on the next microtask, like a cached response. */
const instantImage = (): ImageTarget => {
  const target: ImageTarget = {
    src: "",
    onload: null,
    onerror: null,
    naturalWidth: 10,
    naturalHeight: 10,
  };
  let src = "";
  Object.defineProperty(target, "src", {
    get: () => src,
    set: (value: string) => {
      src = value;
      queueMicrotask(() => target.onload?.call(target, {}));
    },
  });
  return target;
};

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const makeApp = () => {
  const emitted: any[] = [];
  const overlay = document.createElement("div");
  const cache = new AssetCache({ createImage: instantImage });
  const app: any = {
    overlay,
    emit: (message: any) => emitted.push(message),
    audio: {
      decodeAudioBuffer: async () => null,
      playingKeys: () => ["audio.theme"],
    },
    assetCache: cache,
  };
  const manager = new AssetManager(app);
  return { app, emitted, overlay, cache, manager };
};

const request = (method: string, params: unknown) => ({
  jsonrpc: "2.0",
  id: "req-1",
  method,
  params,
});

const notification = (method: string, params: unknown) => ({
  jsonrpc: "2.0",
  method,
  params,
});

describe("AssetManager", () => {
  it("answers a load request once the items are resident", async () => {
    const { manager, cache } = makeApp();
    await manager.onInit();
    const response = await manager.onReceiveRequest(
      request("assets/load", {
        items: [{ kind: "image", src: "/file:/a.png?v=1" }],
        priority: 0,
        pin: "beat:1",
      }) as any,
    );
    expect(response).toEqual({
      result: { loaded: ["/file:/a.png?v=1"], failed: [], pinned: ["/file:/a.png?v=1"] },
      transfer: undefined,
    });
    expect(cache.isResident("/file:/a.png?v=1")).toBe(true);
  });

  it("answers an empty load request at once", async () => {
    const { manager } = makeApp();
    await manager.onInit();
    const response = await manager.onReceiveRequest(
      request("assets/load", { items: [], priority: 0, pin: "beat:1" }) as any,
    );
    expect(response).toEqual({
      result: { loaded: [], failed: [], pinned: [] },
      transfer: undefined,
    });
  });

  it("leaves other requests to other managers", async () => {
    const { manager } = makeApp();
    await manager.onInit();
    expect(
      await manager.onReceiveRequest(request("ui/create", {}) as any),
    ).toBeUndefined();
  });

  it("configures, prefetches, and releases on notifications", async () => {
    const { manager, cache } = makeApp();
    await manager.onInit();
    const tenMiB = 10 * 1024 * 1024;
    manager.onReceiveNotification(
      notification("assets/configure", {
        predictBytes: tenMiB,
        loadBytes: 2 * tenMiB,
      }) as any,
    );
    expect(cache.predictBytes).toBe(tenMiB);
    expect(cache.loadBytes).toBe(2 * tenMiB);
    manager.onReceiveNotification(
      notification("assets/prefetch", {
        items: [{ kind: "image", src: "/file:/b.png?v=1" }],
        priority: 2,
      }) as any,
    );
    await flush();
    expect(cache.isResident("/file:/b.png?v=1")).toBe(true);
    await manager.onReceiveRequest(
      request("assets/load", {
        items: [{ kind: "image", src: "/file:/c.png?v=1" }],
        priority: 1,
        pin: "load:C",
      }) as any,
    );
    manager.onReceiveNotification(
      notification("assets/release", { pins: ["load:C"], drop: true }) as any,
    );
    expect(cache.has("/file:/c.png?v=1")).toBe(false);
  });

  it("reports progress back as notifications, once per pin per turn", async () => {
    const { manager, emitted } = makeApp();
    await manager.onInit();
    await manager.onReceiveRequest(
      request("assets/load", {
        items: [
          { kind: "image", src: "/file:/a.png?v=1" },
          { kind: "image", src: "/file:/b.png?v=1" },
        ],
        priority: 1,
        pin: "load:A",
      }) as any,
    );
    await flush();
    const progress = emitted.filter((m) => m.method === "assets/progress");
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1).params).toEqual({
      pin: "load:A",
      loaded: 2,
      failed: 0,
      total: 2,
    });
  });

  it("derives pins from the images on screen and the audio playing", async () => {
    const { manager, overlay } = makeApp();
    await manager.onInit();
    const img = document.createElement("img");
    img.className = "object";
    img.setAttribute("src", "/file:/shown.png?v=1");
    overlay.appendChild(img);
    expect([...manager.derivedPins()].sort()).toEqual([
      "/file:/shown.png?v=1",
      "audio.theme",
    ]);
  });

  it("unpins without dropping when disposed, so the next application finds everything resident", async () => {
    const { manager, cache } = makeApp();
    await manager.onInit();
    await manager.onReceiveRequest(
      request("assets/load", {
        items: [{ kind: "image", src: "/file:/a.png?v=1" }],
        priority: 1,
        pin: "load:A",
      }) as any,
    );
    manager.onDispose();
    expect(cache.isResident("/file:/a.png?v=1")).toBe(true);
    expect(cache.pinsOf("/file:/a.png?v=1")).toEqual([]);
  });
});
