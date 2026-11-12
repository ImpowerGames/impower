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
  return harness
    .snapshotFiltered("audio/update")
    .flatMap((m: any) => m.params.updates.map((u: any) => `${u.control} ${u.key ?? "*"}`));
}

describe("audio scheduled for a redelivered, unchanged beat (#2118)", () => {
  test.each([
    { name: "skips a one-shot sound", channel: "sound", events: [{ control: "play", assets: ["door"] }], landing: ["start audio.door"], redelivered: [] },
    { name: "skips a voice line", channel: "voice", events: [{ control: "play", assets: ["door"] }], landing: ["start audio.door"], redelivered: [] },
    { name: "keeps a sound whose asset loops", channel: "sound", events: [{ control: "play", assets: ["rain"] }], landing: ["start audio.rain"], redelivered: ["start audio.rain"] },
    { name: "keeps a sound played as a loop", channel: "sound", events: [{ control: "play", assets: ["door"], loop: true }], landing: ["start audio.door"], redelivered: ["start audio.door"] },
    { name: "keeps music", channel: "music", events: [{ control: "play", assets: ["theme"] }], landing: ["start audio.theme"], redelivered: ["start audio.theme"] },
  ])("$name", async ({ channel, events, landing, redelivered }) => {
    expect(await schedulesOf(channel, events, false)).toEqual(landing);
    expect(await schedulesOf(channel, events, true)).toEqual(redelivered);
  });

  test("keeps a redelivered beat's stop of a sound it started as a loop", async () => {
    expect(
      await schedulesOf("sound", [{ control: "play", assets: ["rain"] }, { control: "stop", assets: ["rain"] }], true),
    ).toEqual(["start audio.rain", "stop audio.rain"]);
  });
});
