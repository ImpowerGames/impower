import { describe, expect, test } from "vitest";
import type { Clock } from "../../game/core/classes/Clock";
import { Coordinator } from "../../game/core/classes/Coordinator";
import type { Instructions } from "../../game/core/types/Instructions";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const tick = (deltaMS = 0) => ({ deltaMS }) as Clock;

const pointerDown = {
  jsonrpc: "2.0",
  method: "event",
  params: { type: "pointerdown", button: 0 },
} as any;

const DEFS = `define mia as character with
  name = "MIA"
end

define mia_hello as audio with
  src = "https://example.com/mia_hello.wav"
end

define door as audio with
  src = "https://example.com/door.wav"
end
`;

async function beatOf(body: string): Promise<Instructions> {
  const h = createHarness(`${DEFS}\n\nscene start\n${body}end\n`);
  await h.ready;
  h.jumpToFlow("start");
  await flushMicrotasks(10);
  const beat = h.nextBeat();
  expect(beat).toBeTruthy();
  return beat!;
}

const ops = (messages: any[]): any[] =>
  messages.flatMap((message) =>
    Array.isArray(message?.params?.messages) ? ops(message.params.messages) : [message],
  );

describe("a dialogue beat that plays a voice clip (#2113)", () => {
  test("a clip on voice inside the character's block marks the beat voiced with its speaker", async () => {
    const beat = await beatOf(`  MIA:\n    ((play voice mia_hello))\n    Hello!\n`);
    expect(beat.speech?.character).toBe("mia");
    expect(beat.speech?.voiced).toBe(true);
    expect(beat.speech?.spans.length).toBeGreaterThan(0);
  });

  test("a clip on voice in the middle of the line marks the beat voiced", async () => {
    const beat = await beatOf(`  MIA: Hello ((play voice mia_hello)) there.\n`);
    expect(beat.speech?.character).toBe("mia");
    expect(beat.speech?.voiced).toBe(true);
  });

  test("a clip on another channel leaves the beat unvoiced", async () => {
    const beat = await beatOf(`  MIA:\n    ((play sound door))\n    Hello!\n`);
    expect(beat.speech?.character).toBe("mia");
    expect(beat.speech?.voiced).toBeUndefined();
  });

  test("stopping the voice channel does not voice the beat", async () => {
    const beat = await beatOf(`  MIA:\n    ((stop voice))\n    Hello!\n`);
    expect(beat.speech?.voiced).toBeUndefined();
  });

  test("a clip on voice on a line with no speaking character voices nobody", async () => {
    const beat = await beatOf(`  ((play voice mia_hello))\n  Hello!\n`);
    expect(beat.speech).toBeUndefined();
  });

  test.each([
    ["one write at a time", false],
    ["composed into one page beat", true],
  ])("%s: the page is told the beat is voiced, and a tap that shows the whole line leaves the speech to the clip", async (_label, composeBeats) => {
    const h = createHarness(`${DEFS}\n\nscene start\n  MIA:\n    ((play voice mia_hello))\n    Hello there!\n  MIA:\n    Next one\nend\n`, 0, {
      beforeConnect: (game) => {
        game.context.system.previewing = undefined;
        game.context.system.composeBeats = composeBeats;
      },
    });
    await h.ready;
    h.jumpToFlow("start");
    await flushMicrotasks(10);
    const beat = h.nextBeat()!;
    h.reset();
    const coordinator = new Coordinator(h.game, beat);
    const sent = () => ops(h.messages).filter((message) => message?.method === "morph/speech");
    for (let n = 0; n < 20 && sent().length === 0; n += 1) {
      await flushMicrotasks(10);
      coordinator.onUpdate(tick());
    }
    expect(sent().map((message) => message.params)).toEqual([
      expect.objectContaining({ character: "mia", spans: beat.speech!.spans, voiced: true }),
    ]);
    coordinator.onMessage(pointerDown);
    coordinator.onUpdate(tick());
    await flushMicrotasks(10);
    expect(sent().map((message) => message.params)).toEqual([
      expect.objectContaining({ character: "mia", spans: beat.speech!.spans, voiced: true }),
      { character: "mia", spans: [], voiced: true, revealed: true },
    ]);
  });

  test("a voiced beat shown at once sends no speech", async () => {
    const h = createHarness(`${DEFS}\n\nscene start\n  MIA:\n    ((play voice mia_hello))\n    Hello there!\nend\n`, 0, {
      beforeConnect: (game) => {
        game.context.system.previewing = true;
      },
    });
    await h.ready;
    h.jumpToFlow("start");
    await flushMicrotasks(10);
    const beat = h.nextBeat()!;
    expect(beat.speech?.voiced).toBe(true);
    h.reset();
    new Coordinator(h.game, beat);
    await flushMicrotasks(10);
    expect(ops(h.messages).filter((message) => message?.method === "morph/speech")).toEqual([]);
  });

  test("the line after a voiced line ends its speech when it does not speak", async () => {
    const h = createHarness(`${DEFS}\n\nscene start\n  MIA:\n    ((play voice mia_hello))\n    Hello there!\n  The door shuts.\nend\n`, 0, {
      beforeConnect: (game) => {
        game.context.system.previewing = undefined;
      },
    });
    await h.ready;
    h.jumpToFlow("start");
    await flushMicrotasks(10);
    const first = h.nextBeat()!;
    const second = h.nextBeat()!;
    expect(second.speech).toBeUndefined();
    h.reset();
    const sent = () => ops(h.messages).filter((message) => message?.method === "morph/speech");
    for (const beat of [first, second]) {
      const coordinator = new Coordinator(h.game, beat);
      const count = sent().length;
      for (let n = 0; n < 20 && sent().length === count; n += 1) {
        await flushMicrotasks(10);
        coordinator.onUpdate(tick());
      }
    }
    expect(sent().map((message) => message.params.voiced ?? false)).toEqual([true, false]);
    expect(sent()[1].params.spans).toEqual([]);
  });
});
