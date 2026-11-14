import { describe, expect, test, vi } from "vitest";
import type { Clock } from "../../../../spark-engine/src/game/core/classes/Clock";
import { createDOMHarness, flushMicrotasks, untilShown } from "./domTestHarness";
import { stubMedia } from "./mediaStubs";

vi.setConfig({ testTimeout: 120_000 });

const tick = (deltaMS: number) => ({ deltaMS }) as Clock;

async function played(source: string, line: number, compose = false) {
  const h = createDOMHarness(source, line, { compose });
  const media = stubMedia(h.overlay);
  await h.ready;
  await h.game.preview("inmemory:///main.sd", line, undefined, undefined, {
    playId: 1,
  });
  await flushMicrotasks(30);
  h.game.update(tick(100));
  await flushMicrotasks(30);
  return { h, media };
}

describe("movies in a beat played in the stopped preview (#2256)", () => {
  test("a cutscene starts playing, muted", async () => {
    const { h, media } = await played(
      'define intro as video with\n  src = "intro.webm"\nend\nscene start\n  [[play intro]]\n  After.\nend\n',
      4,
      true,
    );
    try {
      const video = h.overlay.querySelector(".cutscene video") as HTMLVideoElement;
      expect(video).toBeTruthy();
      expect(media.of(video, "play")).toBeGreaterThan(0);
      expect(video.muted).toBe(true);
    } finally {
      h.game.destroy();
      h.ui.onDispose();
      h.overlay.remove();
    }
  });

  test("a movie on a layer starts playing, muted", async () => {
    const { h, media } = await played(
      'define wave as video with\n  src = "wave.webm"\nend\nscene start\n  [[show portrait wave]]\n  Waving.\nend\n',
      4,
    );
    try {
      await untilShown(h.overlay);
      const video = h.overlay.querySelector("video") as HTMLVideoElement;
      expect(video).toBeTruthy();
      expect(media.of(video, "play")).toBeGreaterThan(0);
      expect(video.muted).toBe(true);
    } finally {
      h.game.destroy();
      h.ui.onDispose();
      h.overlay.remove();
    }
  });
});
