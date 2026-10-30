import { WriteImageMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { describe, expect, it } from "vitest";
import { AssetCache } from "../assets/AssetCache";
import AssetManager from "./AssetManager";
import UIManager from "./UIManager";

const g = globalThis as any;
g.CSS ??= {};
g.CSS.escape ??= (value: string) => value;

class FakeImage {
  src = "";
  naturalWidth = 10;
  naturalHeight = 10;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

const makeApp = () => {
  const overlay = document.createElement("div");
  const cache = new AssetCache({ createImage: () => new FakeImage() });
  const app: any = {
    overlay,
    audio: { playingKeys: () => ["audio.theme"], decodeAudioBuffer: async () => null },
    assetCache: cache,
    emit: () => {},
  };
  const manager = new AssetManager(app);
  return { app, cache, manager, overlay };
};

describe("AssetManager derived pins", () => {
  it("pins every layer of a written image, the videos, and the playing audio", async () => {
    const { app, manager, overlay } = makeApp();
    await manager.onInit();
    const ui = new UIManager(app);
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    const content = document.createElement("div");
    content.className = "image";
    backdrop.appendChild(content);
    overlay.appendChild(backdrop);
    await ui.onReceiveRequest(
      WriteImageMessage.type.request({
        target: "backdrop",
        instructions: [
          {
            control: "show",
            content: {
              background:
                'url("/file:/shadow.png?v=1"), url("/file:/hero.png?v=1")',
              imageNames: "hero shadow",
              src: "/file:/hero.png?v=1",
              srcs: ["/file:/hero.png?v=1", "/file:/shadow.png?v=1"],
            },
          },
        ],
        instant: true,
      }),
    );
    expect(content.querySelector("span.instance[image='hero shadow']")).not.toBeNull();
    const video = document.createElement("video");
    video.className = "object";
    video.setAttribute("data-src", "/file:/intro.webm?v=1");
    video.setAttribute("src", "blob:page/1");
    overlay.appendChild(video);
    expect([...manager.derivedPins()].sort()).toEqual([
      "/file:/hero.png?v=1",
      "/file:/intro.webm?v=1",
      "/file:/shadow.png?v=1",
      "audio.theme",
    ]);
  });

  it("pins a displayed movie's file, so eviction leaves its object URL alone", async () => {
    const overlay = document.createElement("div");
    const revoked: string[] = [];
    let n = 0;
    const cache = new AssetCache({
      createImage: () => new FakeImage(),
      fetchBytes: async () => ({ bytes: new ArrayBuffer(100), type: "video/webm" }),
      createObjectURL: () => `blob:page/${++n}`,
      revokeObjectURL: (url) => revoked.push(url),
    });
    cache.configure({ predictBytes: 150, loadBytes: 0 });
    const app: any = {
      overlay,
      audio: { playingKeys: () => [], decodeAudioBuffer: async () => null },
      assetCache: cache,
      emit: () => {},
    };
    const manager = new AssetManager(app);
    await manager.onInit();
    const wave = "/file:/wave.webm?v=1";
    await cache.request([{ kind: "video", src: wave }], 1, "beat:1");
    cache.release(["beat:1"], false);
    const ui = new UIManager(app);
    const portrait = document.createElement("div");
    portrait.className = "portrait";
    const content = document.createElement("div");
    content.className = "image";
    portrait.appendChild(content);
    overlay.appendChild(portrait);
    await ui.onReceiveRequest(
      WriteImageMessage.type.request({
        target: "portrait",
        instructions: [
          {
            control: "show",
            content: {
              background: "none",
              imageNames: "wave",
              srcs: [wave],
              video: {
                src: wave,
                loop: true,
                muted: false,
                mixer: "movie",
                mixerGain: 1,
                preview: true,
              },
            },
          },
        ],
        instant: true,
      }),
    );
    const video = content.querySelector("video.object");
    expect(video?.getAttribute("src")).toBe("blob:page/1");
    expect([...manager.derivedPins()]).toContain(wave);
    cache.prefetch([{ kind: "video", src: "/file:/a.webm?v=1" }], 2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    cache.prefetch([{ kind: "video", src: "/file:/b.webm?v=1" }], 2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cache.bytes).toBeGreaterThan(150);
    expect(cache.has("/file:/a.webm?v=1")).toBe(false);
    expect(revoked).toEqual(["blob:page/2"]);
    expect(cache.getVideoUrl(wave)).toBe("blob:page/1");
  });

  it("withdraws its providers and forgets failures on dispose, leaving a successor's alone", async () => {
    const { manager, cache, overlay } = makeApp();
    await manager.onInit();
    const img = document.createElement("img");
    img.className = "object";
    img.setAttribute("src", "/file:/hero.png?v=1");
    overlay.appendChild(img);
    expect([...(cache as any)._derivedPins()]).toContain("/file:/hero.png?v=1");
    manager.onDispose();
    expect([...(cache as any)._derivedPins()]).toEqual([]);
    expect((cache as any)._deps.decodeAudio).toBeUndefined();
    const next = makeApp();
    (next.app as any).assetCache = cache;
    const successor = new AssetManager(next.app);
    await successor.onInit();
    manager.onDispose();
    expect((cache as any)._derivedPins).not.toBeUndefined();
    expect([...(cache as any)._derivedPins()]).toEqual(["audio.theme"]);
  });
});
