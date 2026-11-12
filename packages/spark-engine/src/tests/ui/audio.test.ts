import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const DEFS = `define HERO as character with
  name = "HERO"
end

define beep as audio with
  src = "https://example.com/beep.wav"
end

layout main {
  textbox {
    character_info {
      character_name {
        text
      }
    }
    dialogue {
      text
    }
  }
}
`;

function story(body: string) {
  return `${DEFS}\n-> start\n\nscene start\n${body}\nend\n`;
}

async function runBeat(body: string) {
  const harness = createHarness(story(body));
  await harness.ready;
  harness.jumpToFlow("start");
  harness.reset();
  const beat = harness.nextBeat();
  await harness.display(beat!, false);
  await flushMicrotasks();
  return { harness, beat };
}

describe("audio", () => {
  test("explicit SFX directive schedules audio/load + audio/update", async () => {
    const { harness, beat } = await runBeat(`  ((play sound beep))\n  Hi.`);
    expect(Object.keys(beat?.audio ?? {})).toContain("sound");
    expect(harness.snapshotFiltered("audio/")).toMatchSnapshot();
  });

  test("typewriter synth tones scheduled for voiced dialogue", async () => {
    const { harness, beat } = await runBeat(`  HERO: Hello.`);
    expect(Object.keys(beat?.audio ?? {})).toContain("typewriter");
    expect(harness.snapshotFiltered("audio/")).toMatchSnapshot();
  });
});

const SOUNDS = `define door as audio with
  src = "https://example.com/door.wav"
end

define rain as audio with
  src = "https://example.com/rain.wav"
  loop = true
end

define theme as audio with
  src = "https://example.com/theme.wav"
end
`;

async function schedulesOf(
  channel: string,
  events: { control: string; assets?: string[]; loop?: boolean }[],
  redelivered: boolean,
) {
  const harness = createHarness(`${SOUNDS}\n-> start\n\nscene start\n  Hi.\nend\n`);
  await harness.ready;
  harness.reset();
  const audio = harness.game.module.audio;
  const id = audio.schedule(channel, events as any, false, redelivered);
  await flushMicrotasks(10);
  audio.triggerAll([id]);
  await flushMicrotasks(10);
  return {
    updates: harness
      .snapshotFiltered("audio/update")
      .flatMap((m: any) => m.params.updates.map((u: any) => `${u.control} ${u.key ?? "*"}`)),
    held: [...(audio.loopsHeld().get(channel)?.keys() ?? [])],
  };
}

describe("audio scheduled for a redelivered, unchanged beat (#2118)", () => {
  test.each([
    { name: "does not start a one-shot sound again", channel: "sound", events: [{ control: "play", assets: ["door"] }], landing: ["start audio.door"], redelivered: ["stop audio.door"], held: [] },
    { name: "does not start a voice line again", channel: "voice", events: [{ control: "play", assets: ["door"] }], landing: ["start audio.door"], redelivered: ["stop audio.door"], held: [] },
    { name: "keeps a sound whose asset loops", channel: "sound", events: [{ control: "play", assets: ["rain"] }], landing: ["start audio.rain"], redelivered: ["start audio.rain"], held: ["audio.rain"] },
    { name: "keeps a sound played as a loop", channel: "sound", events: [{ control: "play", assets: ["door"], loop: true }], landing: ["start audio.door"], redelivered: ["start audio.door"], held: ["audio.door"] },
    { name: "keeps music", channel: "music", events: [{ control: "play", assets: ["theme"] }], landing: ["start audio.theme"], redelivered: ["start audio.theme"], held: ["audio.theme"] },
    { name: "keeps a stop of a sound it started as a loop", channel: "sound", events: [{ control: "play", assets: ["rain"] }, { control: "stop", assets: ["rain"] }], landing: ["start audio.rain", "stop audio.rain"], redelivered: ["start audio.rain", "stop audio.rain"], held: [] },
    { name: "ends a loop the beat then plays once, leaving no loop held", channel: "sound", events: [{ control: "play", assets: ["door"], loop: true }, { control: "play", assets: ["door"], loop: false }], landing: ["start audio.door", "start audio.door"], redelivered: ["start audio.door", "stop audio.door"], held: [] },
    { name: "ends a loop the beat then plays once across the channel, leaving no loop held", channel: "sound", events: [{ control: "play", assets: ["door"], loop: true }, { control: "play", loop: false }], landing: ["start audio.door", "start *"], redelivered: ["start audio.door", "stop *"], held: [] },
  ])("$name", async ({ channel, events, landing, redelivered, held }) => {
    const landed = await schedulesOf(channel, events, false);
    expect(landed.updates).toEqual(landing);
    expect(landed.held).toEqual(held);
    const again = await schedulesOf(channel, events, true);
    expect(again.updates).toEqual(redelivered);
    expect(again.held).toEqual(held);
  });
});
