import { describe, expect, test } from "vitest";
import type { Clock } from "../../game/core/classes/Clock";
import {
  createHarness,
  flattenMessages,
  flushMicrotasks,
  MAIN_URI,
  type UIHarness,
} from "./harness/uiTestHarness";

const tick = (deltaMS = 0) => ({ deltaMS }) as Clock;

const SOURCE = `define mia as character with
  name = "MIA"
end

define theme as audio with
  src = "https://example.com/theme.mp3"
end

define storm as audio with
  src = "https://example.com/storm.mp3"
end

define mia_hello as audio with
  src = "https://example.com/mia_hello.wav"
end

scene start
  MIA:
    ((play music theme))
    First line.
  MIA: Second line.
  MIA:
    ((play voice mia_hello))
    Hello there.
  MIA:
    ((play music storm))
    Fourth line.
end
`;

const FIRST = 19;
const SECOND = 20;
const VOICED = 23;
const FOURTH = 26;

type Update = { channel: string; control: string; key?: string };

const updates = (h: UIHarness): Update[] =>
  flattenMessages(h.messages)
    .filter((m) => m?.method === "audio/update")
    .flatMap((m) =>
      (m.params.updates as { control: string; key?: string }[]).map((u) => ({
        channel: m.params.channel,
        control: u.control,
        ...(u.key ? { key: u.key } : {}),
      })),
    );

const starts = (h: UIHarness) => updates(h).filter((u) => u.control === "start");

async function harness(): Promise<UIHarness> {
  const h = createHarness(SOURCE, FIRST);
  await h.ready;
  await h.preview(FIRST);
  await flushMicrotasks(20);
  return h;
}

async function preview(h: UIHarness, line: number) {
  await h.preview(line);
  await flushMicrotasks(20);
}

async function play(h: UIHarness, line: number) {
  await h.game.preview(MAIN_URI, line, undefined, undefined, { playId: 1 });
  await flushMicrotasks(20);
  for (let elapsed = 0; elapsed < 10_000 && h.game.playingBeat; elapsed += 50) {
    h.game.update(tick(50));
    await flushMicrotasks(5);
  }
  expect(h.game.playingBeat).toBe(false);
}

describe("preview audio in the engine (#2258)", () => {
  test("a shown beat starts the looping sound running there, keeps it across a beat that shares it and swaps it when the state differs", async () => {
    const h = await harness();
    h.reset();
    h.game.setPreviewAudio(true);
    await flushMicrotasks(20);
    expect(starts(h)).toEqual([
      { channel: "music", control: "start", key: "audio.theme" },
    ]);

    h.reset();
    await preview(h, SECOND);
    expect(updates(h).filter((u) => u.key === "audio.theme")).toEqual([]);

    h.reset();
    await preview(h, FOURTH);
    expect(updates(h)).toContainEqual({
      channel: "music",
      control: "stop",
      key: "audio.theme",
    });
    expect(starts(h)).toEqual([
      { channel: "music", control: "start", key: "audio.storm" },
    ]);
  });

  test("a voice clip and typing blips start only when the beat is played", async () => {
    const h = await harness();
    h.game.setPreviewAudio(true);
    h.reset();
    await preview(h, VOICED);
    expect(starts(h).filter((u) => u.channel !== "music")).toEqual([]);

    h.reset();
    await play(h, VOICED);
    const played = starts(h);
    expect(played).toContainEqual({
      channel: "voice",
      control: "start",
      key: "audio.mia_hello",
    });
    expect(played.some((u) => u.channel === "typewriter")).toBe(true);
    expect(played.filter((u) => u.key === "audio.theme")).toEqual([]);
  });

  test("with preview audio off nothing starts, on shown or played beats", async () => {
    const h = await harness();
    h.reset();
    await preview(h, SECOND);
    await preview(h, VOICED);
    await play(h, VOICED);
    await preview(h, FOURTH);
    expect(starts(h)).toEqual([]);
  });

  test("switching preview audio off stops what it started", async () => {
    const h = await harness();
    h.game.setPreviewAudio(true);
    await flushMicrotasks(20);
    h.reset();
    h.game.setPreviewAudio(false);
    expect(updates(h)).toContainEqual({ channel: "music", control: "stop" });
    h.reset();
    await preview(h, FOURTH);
    expect(starts(h)).toEqual([]);
  });

  const holdAudioLoads = (h: UIHarness) => {
    const sent: any[] = [];
    const loading: any[] = [];
    const reply = (message: any) =>
      h.game.connection.receive({
        jsonrpc: "2.0",
        id: message.id,
        method: message.method,
        result: message.method === "audio/load" ? message.params : [],
      } as any);
    h.game.connection.connectOutput((message: any) => {
      sent.push(structuredClone(message));
      if (!("id" in message && "params" in message)) {
        return;
      }
      if (message.method === "audio/load") {
        loading.push(message);
      } else {
        queueMicrotask(() => reply(message));
      }
    });
    const startsIn = (messages: any[]) =>
      flattenMessages(messages)
        .filter((m) => m?.method === "audio/update")
        .flatMap((m) =>
          (m.params.updates as { control: string; key?: string }[]).map((u) => ({
            channel: m.params.channel,
            control: u.control,
            ...(u.key ? { key: u.key } : {}),
          })),
        )
        .filter((u) => u.control === "start");
    return {
      sent,
      loading,
      release: () => loading.splice(0).forEach(reply),
      startsSince: (index: number) => startsIn(sent.slice(index)),
    };
  };

  test("a loop still loading when preview audio is switched off never starts", async () => {
    const h = await harness();
    const held = holdAudioLoads(h);
    h.game.setPreviewAudio(true);
    await flushMicrotasks(20);
    expect(held.loading.length).toBeGreaterThan(0);
    h.game.setPreviewAudio(false);
    await flushMicrotasks(20);
    const off = held.sent.length;
    held.release();
    await flushMicrotasks(40);
    expect(held.startsSince(off)).toEqual([]);
  });

  test("a played beat whose audio is still loading when preview audio is switched off sounds nothing", async () => {
    const h = await harness();
    h.game.setPreviewAudio(true);
    await preview(h, VOICED);
    const held = holdAudioLoads(h);
    await h.game.preview(MAIN_URI, VOICED, undefined, undefined, { playId: 1 });
    await flushMicrotasks(20);
    expect(held.loading.length).toBeGreaterThan(0);
    h.game.setPreviewAudio(false);
    await flushMicrotasks(20);
    const off = held.sent.length;
    held.release();
    await flushMicrotasks(40);
    for (let elapsed = 0; elapsed < 10_000 && h.game.playingBeat; elapsed += 50) {
      h.game.update(tick(50));
      await flushMicrotasks(5);
    }
    expect(held.startsSince(off)).toEqual([]);
  });
});
