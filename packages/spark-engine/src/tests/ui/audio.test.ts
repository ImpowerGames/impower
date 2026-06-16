// Golden-master: audio scheduling stream.
//
// `Coordinator.display()` (non-instant) fans `instructions.audio` out to
// `audio.schedule(channel, events)`, which emits `audio/load` (one per asset,
// warming the player + reading back outputLatency) and `audio/update` (the
// control timeline). Two audio sources are covered: an explicit `((sound))`
// SFX directive, and the implicit typewriter synth tones the interpreter
// derives from voiced dialogue. This locks the audio message stream.

import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const DEFS = `define HERO as character with
  name = "HERO"
end

define beep as audio with
  src = "https://example.com/beep.wav"
end

screen main with
  textbox:
    character_info:
      character_name:
        text
    dialogue:
      text
end
`;

function story(body: string) {
  return `${DEFS}\n-> start\n\nscene start\n${body}\nend\n`;
}

async function runBeat(body: string) {
  const harness = createHarness(story(body));
  await harness.ready;
  harness.jumpTo("start");
  harness.reset();
  const beat = harness.nextBeat();
  await harness.display(beat!, /* instant */ false);
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
    // The interpreter derives a typewriter-channel synth tone instruction.
    expect(Object.keys(beat?.audio ?? {})).toContain("typewriter");
    expect(harness.snapshotFiltered("audio/")).toMatchSnapshot();
  });
});
