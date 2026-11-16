import { describe, expect, test } from "vitest";
import { continueBeats, makeRuntimeStoryFromSource } from "./runtimeTestHarness";

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

  test("ends at the next arm's bar even when that bar is indented deeper than the first", () => {
    const ctx = makeRuntimeStoryFromSource(
      `scene start
  for i = 1, 2 do
    queue
      | GUIDE:
          Hello.
        | Goodbye.
    end
  end
end
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    const beats = continueBeats(ctx.story);
    expect(beats[0]).toEqual({ text: "Hello.\n", routing: "dialogue:GUIDE" });
    expect(beats[1]?.text).toBe("Goodbye.\n");
    expect(beats[1]?.routing).not.toBe("dialogue:GUIDE");
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

describe("an action block opened right after an alternator arm's bar", () => {
  test("plays its lines as one beat, as the same block in an if branch does", () => {
    const branch = makeRuntimeStoryFromSource(
      `scene start
  if true then
    :
      First line.
      Second line.
  else
    Other line.
  end
end
`,
    );
    expect(branch.errorMessages).toEqual([]);
    const expected = continueBeats(branch.story);
    expect(expected.map((beat) => beat.text)).toEqual(["First line.\nSecond line.\n"]);
    const ctx = makeRuntimeStoryFromSource(
      `scene start
  queue
    | :
        First line.
        Second line.
    | Other line.
  end
end
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(continueBeats(ctx.story)).toEqual(expected);
  });
});
