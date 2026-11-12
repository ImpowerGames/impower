import { describe, expect, test } from "vitest";
import type { Clock } from "../../game/core/classes/Clock";
import { Coordinator } from "../../game/core/classes/Coordinator";
import type { Instructions } from "../../game/core/types/Instructions";
import { pageKey } from "../../game/core/utils/pageKey";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const tick = (deltaMS = 0) => ({ deltaMS }) as Clock;

const pointerDown = {
  jsonrpc: "2.0",
  method: "event",
  params: { type: "pointerdown", button: 0 },
} as any;

const L = 0.025;
const P = L * 5;
const EM = L * 16;
const STRESS = L * 10;

const MIA = `define mia as character with
  name = "MIA"
end
`;

async function beatOf(line: string, opts: { prelude?: string; cue?: string } = {}): Promise<Instructions> {
  const cue = opts.cue === undefined ? "MIA" : opts.cue;
  const body = cue ? `  ${cue}:\n    ${line}\n` : `  ${line}\n`;
  const h = createHarness(`${MIA}${opts.prelude ?? ""}\n\nscene start\n${body}end\n`);
  await h.ready;
  h.jumpToFlow("start");
  await flushMicrotasks(10);
  const beat = h.nextBeat();
  expect(beat).toBeTruthy();
  return beat!;
}

function expectSpans(beat: Instructions, expected: [number, number][]) {
  expect(beat.speech?.character).toBe("mia");
  const spans = beat.speech!.spans;
  expect(spans).toHaveLength(expected.length);
  spans.forEach(([start, end], i) => {
    expect(start).toBeCloseTo(expected[i]![0], 9);
    expect(end).toBeCloseTo(expected[i]![1], 9);
  });
}

function dialogueEvents(beat: Instructions) {
  return (beat.text?.["dialogue"] ?? []).flatMap((event) =>
    [...(event.text ?? "")].map((char) => ({ char, after: event.after ?? 0 })),
  );
}

function expectOutside(beat: Instructions, char: string) {
  const events = dialogueEvents(beat);
  const shown = events.filter((event) => event.char === char);
  expect(shown.length).toBeGreaterThan(0);
  for (const { after } of shown) {
    const next = events.find((event) => event.after > after)?.after ?? beat.end;
    for (const [start, end] of beat.speech!.spans) {
      expect(end <= after + 1e-9 || start >= next - 1e-9).toBe(true);
    }
  }
}

describe("the speech a typed line yields (#2111)", () => {
  test("two spaces leave a pause the length of a phrase pause outside speech", async () => {
    const beat = await beatOf("Hi  yo");
    expectSpans(beat, [
      [0, 2 * L],
      [3 * L + P, 5 * L + P],
    ]);
    expectOutside(beat, " ");
  });

  test("three spaces leave two phrase pauses outside speech", async () => {
    const beat = await beatOf("Hi   yo");
    expectSpans(beat, [
      [0, 2 * L],
      [3 * L + 2 * P, 5 * L + 2 * P],
    ]);
  });

  test("an em dash and the space after it are outside speech", async () => {
    const beat = await beatOf("Hi -- yo");
    expectSpans(beat, [
      [0, 2 * L],
      [5 * L + EM, 7 * L + EM],
    ]);
    expectOutside(beat, "-");
  });

  test("a spaced ellipsis is outside speech", async () => {
    const beat = await beatOf("Hi . . . yo");
    expect(beat.speech?.character).toBe("mia");
    expect(beat.speech!.spans.length).toBeGreaterThan(0);
    expectOutside(beat, ".");
    expectOutside(beat, " ");
  });

  test("the pause a stressed word adds is outside speech", async () => {
    const beat = await beatOf("*Hi* yo");
    expectSpans(beat, [
      [0, 2 * L],
      [2 * L + STRESS, 4 * L + STRESS],
    ]);
  });

  test("slowed text speaks for each letter's slowed pause", async () => {
    const beat = await beatOf("<speed=0.5>Hi yo");
    expectSpans(beat, [
      [0, 4 * L],
      [6 * L, 10 * L],
    ]);
  });

  test("speech starts at the first letter after leading punctuation", async () => {
    const beat = await beatOf("...AND THEN");
    expectSpans(beat, [
      [3 * L, 6 * L],
      [7 * L, 11 * L],
    ]);
    expectOutside(beat, ".");
  });

  test("the cue's name and parenthetical add nothing to the speech", async () => {
    const typedName = `define character_name as typewriter with
  letter_pause = 0.025
end
`;
    const plain = await beatOf("Hi yo", { prelude: typedName });
    const withParenthetical = await beatOf("Hi yo", { prelude: typedName, cue: "MIA (softly)" });
    const spans: [number, number][] = [
      [0, 2 * L],
      [3 * L, 5 * L],
    ];
    expectSpans(plain, spans);
    expectSpans(withParenthetical, spans);
  });

  test("a speaking beat keeps the page key it had before beats carried speech, so earlier saves still resume on it", async () => {
    const beat = await beatOf("Hi yo");
    expect(beat.speech).toBeDefined();
    const { speech, ...without } = beat;
    expect(pageKey(beat)).toBe(pageKey(without));
  });

  test.each([
    ["narration", "Hi yo", {}],
    ["a cue with no character define", "Hi yo", { cue: "BOB" }],
    ["a line with no voiced character", ". . .", {}],
    ["a line shown at once", "<speed=0>Hi yo", {}],
    [
      "a letter pause of zero",
      "Hi yo",
      { prelude: "define dialogue as typewriter with\n  letter_pause = 0\nend\n" },
    ],
  ] as const)("%s yields no speech", async (label, line, opts) => {
    const beat = await beatOf(line, label === "narration" ? { ...opts, cue: "" } : opts);
    expect(beat.text).toBeTruthy();
    expect(beat.speech).toBeUndefined();
  });
});

const ops = (messages: any[]): any[] =>
  messages.flatMap((message) =>
    Array.isArray(message?.params?.messages) ? ops(message.params.messages) : [message],
  );

describe("the speech the page receives with a beat (#2111)", () => {
  test.each([
    ["one write at a time", false],
    ["composed into one page beat", true],
  ])("%s: it is timed from the text's start, and a skip ends it", async (_label, composeBeats) => {
    const h = createHarness(`${MIA}\n\nscene start\n  MIA:\n    Hi yo there\n  MIA:\n    Next one\nend\n`, 0, {
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
    const written = () =>
      ops(h.messages).find((message) => message?.method === "ui/write-text" && message.params.target === "dialogue" && message.params.instructions.length);
    for (let n = 0; n < 20 && !written(); n += 1) {
      await flushMicrotasks(10);
      coordinator.onUpdate(tick());
    }
    await flushMicrotasks(10);
    const sent = () => ops(h.messages).filter((message) => message?.method === "morph/speech");
    const text = written();
    expect(text?.params.time).toBeDefined();
    expect(sent().map((message) => message.params)).toEqual([
      { character: "mia", spans: beat.speech!.spans, time: text.params.time },
    ]);
    coordinator.onMessage(pointerDown);
    coordinator.onUpdate(tick());
    await flushMicrotasks(10);
    expect(sent().map((message) => message.params.spans)).toEqual([beat.speech!.spans, []]);
  });

  test("a beat shown at once sends no speech", async () => {
    const h = createHarness(`${MIA}\n\nscene start\n  MIA:\n    Hi yo there\nend\n`, 0, {
      beforeConnect: (game) => {
        game.context.system.previewing = true;
      },
    });
    await h.ready;
    h.jumpToFlow("start");
    await flushMicrotasks(10);
    const beat = h.nextBeat()!;
    expect(beat.speech?.spans.length).toBeGreaterThan(0);
    h.reset();
    new Coordinator(h.game, beat);
    await flushMicrotasks(10);
    expect(ops(h.messages).filter((message) => message?.method === "morph/speech")).toEqual([]);
  });
});
