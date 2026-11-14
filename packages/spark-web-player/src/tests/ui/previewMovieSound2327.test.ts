import { describe, expect, test, vi } from "vitest";
import type { Clock } from "../../../../spark-engine/src/game/core/classes/Clock";
import { createDOMHarness, flushMicrotasks, untilShown } from "./domTestHarness";
import { stubMedia } from "./mediaStubs";

vi.setConfig({ testTimeout: 120_000 });

const tick = (deltaMS: number) => ({ deltaMS }) as Clock;

const CUTSCENE =
  'define intro as video with\n  src = "intro.webm"\nend\nscene start\n  [[play intro]]\n  After.\nend\n';

const LAYER =
  'define wave as video with\n  src = "wave.webm"\nend\nscene start\n  [[show portrait wave]]\n  Waving.\nend\n';

async function played(
  source: string,
  line: number,
  previewAudio: boolean,
  compose = false,
) {
  const h = createDOMHarness(source, line, { compose });
  const media = stubMedia(h.overlay);
  await h.ready;
  h.game.setPreviewAudio(previewAudio);
  await h.game.preview("inmemory:///main.sd", line, undefined, undefined, {
    playId: 1,
  });
  await flushMicrotasks(30);
  h.game.update(tick(100));
  await flushMicrotasks(30);
  return { h, media };
}

const dispose = (h: Awaited<ReturnType<typeof played>>["h"]) => {
  h.game.destroy();
  h.ui.onDispose();
  h.overlay.remove();
};

describe("movie sound in a beat played with Play audio (#2327)", () => {
  test.each([
    ["cutscene", CUTSCENE, ".cutscene video", true],
    ["movie on a layer", LAYER, "video", false],
  ] as const)(
    "switching preview audio off mutes a %s that is playing",
    async (_kind, source, selector, compose) => {
      const { h, media } = await played(source, 4, true, compose);
      try {
        if (!compose) {
          await untilShown(h.overlay);
        }
        const video = h.overlay.querySelector(selector) as HTMLVideoElement;
        expect(video).toBeTruthy();
        expect(media.of(video, "play")).toBeGreaterThan(0);
        expect(video.muted).toBe(false);
        expect(h.game.playingBeat).toBe(true);
        h.game.setPreviewAudio(false);
        await flushMicrotasks(30);
        expect(video.muted).toBe(true);
        expect(video.paused).toBe(false);
      } finally {
        dispose(h);
      }
    },
  );

  test.each([
    [true, false],
    [false, true],
  ])(
    "a played cutscene with preview audio %s plays with muted %s",
    async (previewAudio, muted) => {
      const { h, media } = await played(CUTSCENE, 4, previewAudio, true);
      try {
        const video = h.overlay.querySelector(".cutscene video") as HTMLVideoElement;
        expect(video).toBeTruthy();
        expect(media.of(video, "play")).toBeGreaterThan(0);
        expect(video.muted).toBe(muted);
      } finally {
        dispose(h);
      }
    },
  );

  test.each([
    [true, false],
    [false, true],
  ])(
    "a played movie on a layer with preview audio %s plays with muted %s",
    async (previewAudio, muted) => {
      const { h, media } = await played(LAYER, 4, previewAudio);
      try {
        await untilShown(h.overlay);
        const video = h.overlay.querySelector("video") as HTMLVideoElement;
        expect(video).toBeTruthy();
        expect(media.of(video, "play")).toBeGreaterThan(0);
        expect(video.muted).toBe(muted);
      } finally {
        dispose(h);
      }
    },
  );
});
