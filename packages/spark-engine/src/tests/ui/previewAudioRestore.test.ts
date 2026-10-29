import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SOURCE = `define theme as audio with
  src = "https://example.com/theme.wav"
end

layout main with
  textbox {
    dialogue {
      text
    }
  }
end

-> start

scene start
  ((play music theme))
  The music is playing.
  And still playing.
end
`;

const playback = (h: { messages: any[] }) =>
  h.messages.filter(
    (m) => m?.method === "audio/load" || m?.method === "audio/update",
  );

async function checkpointWithMusicPlaying() {
  const h = createHarness(SOURCE);
  await h.ready;
  h.jumpToFlow("start");
  const beat = h.nextBeat();
  await h.display(beat!, false);
  await flushMicrotasks();
  expect(Object.keys(beat?.audio ?? {})).toContain("music");
  const save = h.game.save();
  expect(typeof save).toBe("string");
  return save;
}

describe("previewing does not resume the scene's audio", () => {
  test("a game that is not in preview mode resumes the music on restore", async () => {
    const cp = await checkpointWithMusicPlaying();
    const h = createHarness(SOURCE, 0, {
      loadCheckpoint: cp,
      beforeConnect: (game) => {
        game.context.system.previewing = undefined;
      },
    });
    await h.ready;
    const methods = playback(h).map((m) => m.method);
    expect(methods).toContain("audio/load");
    expect(methods).toContain("audio/update");
  });

  test("a game told it is previewing stays silent through restore", async () => {
    const cp = await checkpointWithMusicPlaying();
    const h = createHarness(SOURCE, 0, {
      loadCheckpoint: cp,
      beforeConnect: (game) => {
        game.context.system.previewing = undefined;
        game.markPreviewing(2 ** 40);
      },
    });
    await h.ready;
    expect(playback(h)).toEqual([]);
  });

  test("marking the mode does not swallow the preview itself", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    const game: any = h.game;
    const path = await game.preview("inmemory:///main.sd", 0);
    expect(path).toBeTruthy();
    game.markPreviewing(path);
    game._previewedAddress = undefined;
    h.reset();
    expect(await game.preview("inmemory:///main.sd", 0)).toBe(path);
    expect(h.messages.length).toBeGreaterThan(0);
  });
});
