// A video name shown on a layer (I-1380): the interpreter carries `loop`,
// `once` and `mute` onto the image instruction, and `Image.write` puts a
// `video` entry on the layer's write instead of a background image, so the
// page can build a `<video>` for it.

import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const asset = (type: string, name: string, ext: string): File => ({
  uri: `inmemory:///${name}.${ext}`,
  type,
  name,
  ext,
  src: `/file:/proj/${name}.${ext}?v=1`,
});

const ASSETS: File[] = [
  asset("video", "bunny_wave", "webm"),
  asset("video", "rain", "webm"),
  asset("image", "room", "png"),
];

const DEFS = `layout main with
  stage {
    backdrop {
      image
    }
    portrait {
      image
    }
  }
end
`;

const story = (body: string) =>
  `${DEFS}\n-> start\n\nscene start\n${body}\nend\n`;

/** Every `ui/write-image` the game sent to `target`, in order. */
const writes = (messages: any[], target: string) =>
  messages.filter(
    (m) => m?.method === "ui/write-image" && m.params?.target === target,
  );

/** The content of the last write to `target` that carried one. */
const lastContent = (messages: any[], target: string) =>
  writes(messages, target)
    .flatMap((m) => m.params.instructions)
    .filter((i: any) => i.content)
    .at(-1)?.content;

async function shown(body: string, opts: { playing?: boolean } = {}) {
  const h = createHarness(story(body), 0, {
    assets: ASSETS,
    beforeConnect: opts.playing
      ? (game) => {
          game.context.system.previewing = undefined;
        }
      : undefined,
  });
  await h.ready;
  h.jumpToFlow("start");
  h.reset();
  const beat = h.nextBeat();
  expect(beat).toBeTruthy();
  await h.display(beat!, true);
  await flushMicrotasks(10);
  return { h, beat: beat! };
}

describe("a video on a layer: the interpreter's clauses", () => {
  test("`once` and `mute` reach the image instruction, and `loop` from `[[show … loop]]`", async () => {
    const { beat } = await shown(
      `  [[show portrait bunny_wave once mute]]\n  [[show backdrop rain loop]]\n  A line.`,
    );
    expect(beat.image?.["portrait"]?.[0]).toMatchObject({
      control: "show",
      assets: ["bunny_wave"],
      once: true,
      mute: true,
    });
    expect(beat.image?.["portrait"]?.[0]?.loop).toBeUndefined();
    expect(beat.image?.["backdrop"]?.[0]).toMatchObject({
      control: "show",
      assets: ["rain"],
      loop: true,
    });
    expect(beat.image?.["backdrop"]?.[0]?.once).toBeUndefined();
    expect(beat.image?.["backdrop"]?.[0]?.mute).toBeUndefined();
  });
});

describe("a video on a layer: Image.write", () => {
  test("a video name writes a `video` entry that loops by default, with sound", async () => {
    const { h } = await shown(`  [[show portrait bunny_wave]]\n  A line.`, {
      playing: true,
    });
    const content = lastContent(h.messages, "portrait");
    expect(content?.video).toEqual({
      src: "/file:/proj/bunny_wave.webm?v=1",
      loop: true,
      muted: false,
    });
    // No background image stands in for the movie, and its file is what the
    // page keeps resident while the layer shows it.
    expect(content?.background).toBe("none");
    expect(content?.src).toBeUndefined();
    expect(content?.srcs).toEqual(["/file:/proj/bunny_wave.webm?v=1"]);
  });

  test("`once` turns the loop off and `mute` silences it", async () => {
    const { h } = await shown(
      `  [[show portrait bunny_wave once mute]]\n  A line.`,
      { playing: true },
    );
    expect(lastContent(h.messages, "portrait")?.video).toEqual({
      src: "/file:/proj/bunny_wave.webm?v=1",
      loop: false,
      muted: true,
    });
  });

  test("`loop` keeps the default loop", async () => {
    const { h } = await shown(`  [[show backdrop rain loop]]\n  A line.`, {
      playing: true,
    });
    expect(lastContent(h.messages, "backdrop")?.video?.loop).toBe(true);
  });

  test("a preview's write carries the preview flag, so the page shows the first frame only", async () => {
    const { h } = await shown(`  [[show portrait bunny_wave]]\n  A line.`);
    expect(h.game.context.system.previewing).toBeTruthy();
    expect(lastContent(h.messages, "portrait")?.video).toEqual({
      src: "/file:/proj/bunny_wave.webm?v=1",
      loop: true,
      muted: false,
      preview: true,
    });
  });

  test("an image name still writes a background image and no video", async () => {
    const { h } = await shown(`  [[show backdrop room]]\n  A line.`, {
      playing: true,
    });
    const content = lastContent(h.messages, "backdrop");
    expect(content?.video).toBeUndefined();
    expect(content?.background).toBe('url("/file:/proj/room.png?v=1")');
    expect(content?.src).toBe("/file:/proj/room.png?v=1");
  });

  test("a restore replays the movie with its clauses", async () => {
    // The builtin layout's backdrop stays up across a connect; an empty
    // `image` leaf, like the portrait's, clears on it.
    const source = `-> start\n\nscene start\n  A line.\nend\n`;
    const recorder = createHarness(source, 0, { assets: ASSETS });
    await recorder.ready;
    await recorder.display(
      {
        image: {
          backdrop: [
            { control: "show", assets: ["rain"], once: true, mute: true },
          ],
        },
        end: 0,
      },
      true,
    );
    const save = recorder.game.save();
    const restored = createHarness(source, 0, {
      assets: ASSETS,
      loadCheckpoint: save,
      beforeConnect: (game) => {
        game.context.system.previewing = undefined;
      },
    });
    await restored.ready;
    expect(lastContent(restored.messages, "backdrop")?.video).toEqual({
      src: "/file:/proj/rain.webm?v=1",
      loop: false,
      muted: true,
    });
  });
});
