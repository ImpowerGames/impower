// Previewing a line must not start the scene's music.
//
// `audio.schedule` records what a channel is playing into the module's saved
// state BEFORE it checks whether this is a real run or a route simulation, so a
// checkpoint captured mid-scene knows the music is on. `AudioModule.onRestore`
// then resumes those channels for real — correct on PLAY, wrong on a preview.
//
// The editor's preview sequence is: load the checkpoint, connect the game
// (which restores every module), and only THEN ask the game to preview a point.
// So `context.system.previewing` has to be set before the connect, not by
// `preview()` — which is what `markPreviewing` is for.

import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SOURCE = `define theme as audio with
  src = "https://example.com/theme.wav"
end

layout main with
  textbox:
    dialogue:
      text
end

-> start

scene start
  ((play music theme))
  The music is playing.
  And still playing.
end
`;

/** Messages that make sound: loading an asset into a player and running a
 *  control timeline on it. `audio/configure` is excluded deliberately — restore
 *  always re-applies the mixer gains, which is silent on its own. */
const playback = (h: { messages: any[] }) =>
  h.messages.filter(
    (m) => m?.method === "audio/load" || m?.method === "audio/update",
  );

/** Play the scene far enough that the music channel is in the saved state. */
async function checkpointWithMusicPlaying() {
  const h = createHarness(SOURCE);
  await h.ready;
  h.jumpTo("start");
  const beat = h.nextBeat();
  await h.display(beat!, /* instant */ false);
  await flushMicrotasks();
  // The beat really did schedule music — otherwise the assertions below would
  // pass for the boring reason that there was never anything to resume.
  expect(Object.keys(beat?.audio ?? {})).toContain("music");
  const save = h.game.save();
  expect(typeof save).toBe("string");
  return save;
}

describe("previewing does not resume the scene's audio", () => {
  test("a game that is not in preview mode resumes the music on restore", async () => {
    // The control: this is the PLAY path, and resuming here is the whole point
    // of recording channel state. If this stops emitting audio the test below
    // proves nothing.
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
        // A game built for a real run, now being previewed — exactly what the
        // editor has after PLAY or after any recompile.
        game.context.system.previewing = undefined;
        game.markPreviewing("start");
      },
    });
    await h.ready;
    expect(playback(h)).toEqual([]);
  });

  test("marking the mode does not swallow the preview itself", async () => {
    // `preview()` skips work when asked for the path it already previewed.
    // That memo has to stay separate from the mode flag, or declaring the mode
    // up front would look like "already previewed" and nothing would render.
    const h = createHarness(SOURCE);
    await h.ready;
    const game: any = h.game;
    const path = game.preview("inmemory:///main.sd", 0);
    expect(path).toBeTruthy();
    game.markPreviewing(path);
    game._previewedPath = undefined; // as a recompile leaves it
    h.reset();
    expect(game.preview("inmemory:///main.sd", 0)).toBe(path);
    expect(h.messages.length).toBeGreaterThan(0);
  });
});
