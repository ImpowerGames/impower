import { describe, expect, test } from "vitest";
import { EventMessage } from "../../src/game/core/classes/messages/EventMessage";
import type { CastEntry } from "../../src/game/modules/ui/types/CastState";
import type { StreamEntry } from "../../src/game/modules/ui/types/StreamState";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const PICTURES = ["mia@happy", "mia@sad", "sam@calm"].map((name) => ({
  uri: `inmemory:///${name}.png`,
  type: "image",
  name,
  ext: "png",
  src: `https://example.com/${name}.png`,
}));

const STORY = `define mia as character with
  name = "MIA"
end

define sam as character with
  name = "SAM"
end

layout main {
  stage {
    cast {
      actor {
        portrait { image }
      }
    }
  }
}

layout phone {
  thread {
    stream {
      dialogue.bubble { text }
    }
  }
}

stream phone {
  advance = auto
  pause = 0.6s
}

scene start
  [[open phone]]
  [[mia@happy]]
  MIA: one
  [[sam@calm]]
  SAM: two
  [[mia@sad]]
  MIA: three >
  MIA: four
end
`;

async function play() {
  const h = createHarness(STORY, 0, { autoOpenAll: false, assets: PICTURES as never });
  await h.ready;
  expect(h.errors).toEqual([]);
  const game = h.game;
  game.context.system.previewing = undefined;
  const coordinator = (): any => (game as any)._coordinator;
  const shown = () =>
    (coordinator()?._instructions?.text?.["dialogue"] ?? []).map((e: any) => e.text).join("");
  const tick = async (ms: number) => {
    h.releaseAssets();
    coordinator()?.onUpdate({ deltaMS: ms });
    await flushMicrotasks(5);
  };
  const tickUntil = async (line: string) => {
    for (let i = 0; i < 400 && shown() !== line; i += 1) {
      await tick(50);
    }
    expect(shown()).toBe(line);
  };
  const press = async () => {
    coordinator()?.onMessage(
      EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
    );
    await tick(0);
  };
  const said = () =>
    (game.module.ui.streams.entries("phone") as StreamEntry[]).map((entry) =>
      (entry.text["dialogue"] ?? []).map((e) => e.text).join(""),
    );
  const reserved = () => (game.module.ui as any)._state.streams?.["phone/0"]?.reserved ?? 0;
  const cast = () =>
    (game.module.ui.casts.entries("main") as CastEntry[]).map((entry) => {
      const events = entry.image?.["portrait"] ?? [];
      return [entry.speaker, [...(events.findLast((e) => e.assets?.length)?.assets ?? [])]];
    });
  game.start();
  await flushMicrotasks(10);
  for (let i = 0; i < 10 && !shown(); i += 1) {
    await tick(0);
  }
  return { game, shown, tickUntil, press, said, reserved, cast };
}

describe("a gathered stream run beside a cast (I-2743)", () => {
  test("each cast entry arrives when the line that shows its picture starts, while the stream keeps its room", async () => {
    const h = await play();
    expect(h.shown()).toBe("one");
    expect(h.said()).toEqual(["one", "two", "three"]);
    expect(h.reserved()).toBe(2);
    expect(h.cast()).toEqual([["mia", ["mia@happy"]]]);

    await h.tickUntil("two");
    expect(h.reserved()).toBe(1);
    expect(h.cast()).toEqual([
      ["mia", ["mia@happy"]],
      ["sam", ["sam@calm"]],
    ]);

    await h.tickUntil("three");
    expect(h.reserved()).toBe(0);
    expect(h.cast()).toEqual([
      ["mia", ["mia@sad"]],
      ["sam", ["sam@calm"]],
    ]);
  });

  test("a click through the run brings every cast entry the skipped lines show", async () => {
    const h = await play();
    expect(h.shown()).toBe("one");
    await h.press();
    expect(h.shown()).toBe("three");
    expect(h.said()).toEqual(["one", "two", "three"]);
    expect(h.cast()).toEqual([
      ["mia", ["mia@sad"]],
      ["sam", ["sam@calm"]],
    ]);
  });
});
