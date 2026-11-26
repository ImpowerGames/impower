import { createHarness } from "@impower/spark-engine/src/tests/ui/harness/uiTestHarness";
import { SynthBuffer } from "@impower/spark-engine/src/game/modules/audio/classes/helpers/SynthBuffer";
import { describe, expect, it } from "vitest";
import {
  rollTypewriter,
  SAMPLE_LINE,
  SAMPLE_SYLLABLES,
  typewriterDefinition,
  typewriterSample,
} from "../../src/modules/spark-editor/components/writing-tools/typewriterSample";

describe("Typewriter sound in Writing tools", () => {
  it("copies the auditioned settings and plays the syllables a story schedules", async () => {
    const patch = rollTypewriter(() => 0.5);
    const script = [
      typewriterDefinition(patch),
      'define reader as character with\n  name = "READER"\nend',
      "define reader as story_key with\n  volume = 0.22\nend",
      "scene start",
      "  READER:",
      "    " + SAMPLE_LINE,
      "end",
    ].join("\n");
    const harness = createHarness(script);
    await harness.ready;
    expect(harness.errors).toEqual([]);
    harness.jumpToFlow("start");
    const beat = harness.nextBeat();
    const beeps = beat?.speech?.beeps ?? [];
    expect(beeps.map((v) => Math.round(v * 1000))).toEqual(
      SAMPLE_SYLLABLES.map((v) => v * 1000),
    );
    const synths = harness.game.context.synth;
    expect(synths["reader"]).toMatchObject({ ...patch, volume: 0.22 });
    const voice = synths["story_key"]!;
    expect(voice).toMatchObject(patch);
    const clip = typewriterSample(patch, synths["$default"]!, 48000);
    const hit = new SynthBuffer(voice, [{}], 48000);
    expect(hit.length).toBe(3504);
    expect(clip.length).toBe(
      Math.floor((0.4 + 0.925 + hit.length / 48000) * 48000),
    );
    expect(clip.slice(hit.length, 19200).every((sample) => sample === 0)).toBe(
      true,
    );
    expect(
      clip.slice(19200, 20000).some((sample) => Math.abs(sample) > 0.01),
    ).toBe(true);
  });
});
