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

const MIA = `define mia as character with
  name = "MIA"
end
`;

type Options = { prelude?: string; silent?: boolean };

async function beatOf(line: string, opts: Options = {}): Promise<Instructions> {
  const h = createHarness(`${MIA}${opts.prelude ?? ""}\n\nscene start\n  MIA:\n    ${line}\nend\n`, 0, {
    beforeConnect: (game) => {
      if (opts.silent) {
        (game.context as any).synth = {};
      }
    },
  });
  await h.ready;
  h.jumpToFlow("start");
  await flushMicrotasks(10);
  const beat = h.nextBeat();
  expect(beat).toBeTruthy();
  return beat!;
}

function synthTimes(beat: Instructions): Record<string, number[]> {
  return Object.fromEntries(
    (beat.audio?.["typewriter"] ?? []).map((event) => {
      const [name, ...tones] = event.assets![0]!.split("~");
      return [name!, tones.map((tone) => Number(/^t(.*?)s/.exec(tone)![1]))];
    }),
  );
}

describe("the beep times a speaking line carries (#2261)", () => {
  test.each([
    ["a plain line", "Hello there, my good friend"],
    ["a phrase pause", "Hello there,  my good friend"],
    ["an em dash", "Hello there -- my good friend"],
    ["a stressed word", "Hello *there* my good friend"],
    ["a changed text speed", "Hello <speed:0.5>there my<speed:2> good friend"],
  ])("%s: the beeps are the times of the voice synth events the typewriter schedules", async (_label, line) => {
    const beat = await beatOf(line);
    const voice = synthTimes(beat)["character"];
    expect(voice?.length).toBeGreaterThan(2);
    expect(beat.speech?.beeps).toEqual(voice);
  });

  test("a changed text speed changes the beep times", async () => {
    const plain = await beatOf("Hello there my good friend");
    const slowed = await beatOf("Hello <speed:0.5>there my good friend");
    expect(slowed.speech!.beeps!.at(-1)!).toBeGreaterThan(plain.speech!.beeps!.at(-1)!);
  });

  test("the ticks of a punctuated pause are not beeps", async () => {
    const beat = await beatOf("Well . . . maybe so");
    const times = synthTimes(beat);
    expect(times["typewriter"]?.length).toBeGreaterThan(0);
    expect(beat.speech?.beeps).toEqual(times["character"]);
    for (const tick of times["typewriter"]!) {
      expect(beat.speech!.beeps).not.toContain(tick);
    }
  });

  test("the beeps are the same with no synth to sound them", async () => {
    const voiced = await beatOf("Hello there my good friend");
    const silent = await beatOf("Hello there my good friend", { silent: true });
    expect(silent.speech?.beeps?.length).toBeGreaterThan(2);
    expect(silent.speech?.beeps).toEqual(voiced.speech!.beeps);
  });
});

const ops = (messages: any[]): any[] =>
  messages.flatMap((message) =>
    Array.isArray(message?.params?.messages) ? ops(message.params.messages) : [message],
  );

describe("the beep times the page receives (#2261)", () => {
  test("the speech message carries the beat's beeps, and a skip ends them", async () => {
    const h = createHarness(`${MIA}\n\nscene start\n  MIA:\n    Hello there my good friend\nend\n`, 0, {
      beforeConnect: (game) => {
        game.context.system.previewing = undefined;
      },
    });
    await h.ready;
    h.jumpToFlow("start");
    await flushMicrotasks(10);
    const beat = h.nextBeat()!;
    expect(beat.speech?.beeps?.length).toBeGreaterThan(0);
    h.reset();
    const coordinator = new Coordinator(h.game, beat);
    const sent = () => ops(h.messages).filter((message) => message?.method === "morph/speech");
    for (let n = 0; n < 20 && sent().length === 0; n += 1) {
      await flushMicrotasks(10);
      coordinator.onUpdate(tick());
    }
    expect(sent().map((message) => message.params.beeps)).toEqual([beat.speech!.beeps]);
    coordinator.onMessage(pointerDown);
    coordinator.onUpdate(tick());
    await flushMicrotasks(10);
    expect(sent().map((message) => message.params.beeps)).toEqual([beat.speech!.beeps, undefined]);
  });
});
