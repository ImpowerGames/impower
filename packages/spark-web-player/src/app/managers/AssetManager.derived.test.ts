// The manager's derived pins cover every layer a displayed image paints and
// every video on screen, and dispose withdraws what it installed on the
// shared cache.

import { describe, expect, it } from "vitest";
import { AssetCache } from "../assets/AssetCache";
import AssetManager from "./AssetManager";

class FakeImage {
  src = "";
  naturalWidth = 10;
  naturalHeight = 10;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

const CONTEXT = {
  image: {
    hero: { $type: "image", $name: "hero", src: "/file:/hero.png?v=1" },
    shadow: { $type: "image", $name: "shadow", src: "/file:/shadow.png?v=1" },
  },
};

const makeApp = () => {
  const overlay = document.createElement("div");
  const cache = new AssetCache({ createImage: () => new FakeImage() });
  const app: any = {
    overlay,
    context: CONTEXT,
    audio: { playingKeys: () => ["audio.theme"], decodeAudioBuffer: async () => null },
    assetCache: cache,
    emit: () => {},
  };
  const manager = new AssetManager(app);
  return { app, cache, manager, overlay };
};

describe("AssetManager derived pins", () => {
  it("pins every layer of a displayed image, the videos, and the playing audio", async () => {
    const { manager, overlay } = makeApp();
    await manager.onInit();
    // The renderer paints both layers through the span and gives only the
    // first an element.
    const span = document.createElement("span");
    span.className = "instance";
    span.setAttribute("image", "hero shadow");
    const img = document.createElement("img");
    img.className = "object";
    img.setAttribute("src", "/file:/hero.png?v=1");
    span.appendChild(img);
    overlay.appendChild(span);
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
