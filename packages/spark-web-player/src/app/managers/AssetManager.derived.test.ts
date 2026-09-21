// The manager's derived pins cover every layer a displayed image paints and
// every video on screen, and dispose withdraws what it installed on the
// shared cache.

import { WriteImageMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { describe, expect, it } from "vitest";
import { AssetCache } from "../assets/AssetCache";
import AssetManager from "./AssetManager";
import UIManager from "./UIManager";

// jsdom has no `CSS.escape`, which the write's target lookup uses; the
// class names here need no escaping.
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

// The page has nothing of the game's: no context to resolve an image name
// through. What it pins comes from what it was told to write.
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
    // Both layers paint through the span's background; only the first gets
    // an element.
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
    // A successor that installed its own provider is not disturbed by the
    // predecessor disposing later.
    const next = makeApp();
    (next.app as any).assetCache = cache;
    const successor = new AssetManager(next.app);
    await successor.onInit();
    manager.onDispose();
    expect((cache as any)._derivedPins).not.toBeUndefined();
    expect([...(cache as any)._derivedPins()]).toEqual(["audio.theme"]);
  });
});
