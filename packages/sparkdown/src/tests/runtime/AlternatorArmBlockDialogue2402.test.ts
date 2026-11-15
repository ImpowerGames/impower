import { describe, expect, test } from "vitest";
import {
  continueShowedSomething,
  displayRouting,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";
import type { TestStory } from "../engineUnderTest";

function continueBeats(
  story: TestStory,
): { text: string; routing: string | null }[] {
  const beats: { text: string; routing: string | null }[] = [];
  while (story.canContinue) {
    const text = story.Continue() ?? "";
    if (!continueShowedSomething(story)) continue;
    const routed = displayRouting(story).find((r) => r.target);
    beats.push({
      text,
      routing: routed ? `${routed.target}:${routed.character ?? ""}` : null,
    });
  }
  return beats;
}

describe("a block dialogue opened right after an alternator arm's bar", () => {
  test("plays its lines as the speaker's dialogue, as the same dialogue in an if branch does", () => {
    const branch = makeRuntimeStoryFromSource(
      `scene start
  if true then
    GUIDE (softly):
      Welcome back.
      It has been a while.
  else
    Other line.
  end
end
`,
    );
    expect(branch.errorMessages).toEqual([]);
    const expected = [
      {
        text: "Welcome back.\nIt has been a while.\n",
        routing: "dialogue:GUIDE (softly)",
      },
    ];
    expect(continueBeats(branch.story)).toEqual(expected);
    const ctx = makeRuntimeStoryFromSource(
      `scene start
  queue
    | GUIDE (softly):
        Welcome back.
        It has been a while.
    | Other line.
  end
end
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(continueBeats(ctx.story)).toEqual(expected);
  });

  test("ends at a line back at the bar's indentation, which plays in the same arm", () => {
    const ctx = makeRuntimeStoryFromSource(
      `scene start
  cycle
    | GUIDE:
        Welcome back.
    Narration after.
    | Other line.
  end
end
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    const beats = continueBeats(ctx.story);
    expect(beats[0]).toEqual({ text: "Welcome back.\n", routing: "dialogue:GUIDE" });
    expect(beats.slice(1).map((beat) => beat.text)).toEqual(["Narration after.\n"]);
    expect(beats[1]?.routing).not.toBe("dialogue:GUIDE");
  });
});
