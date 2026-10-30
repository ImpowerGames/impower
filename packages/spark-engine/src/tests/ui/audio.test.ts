import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const DEFS = `define HERO as character with
  name = "HERO"
end

define beep as audio with
  src = "https://example.com/beep.wav"
end

layout main with
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
end
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
