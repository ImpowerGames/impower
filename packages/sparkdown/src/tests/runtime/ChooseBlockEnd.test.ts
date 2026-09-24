// A `choose` block's `end` is where every choice in it continues once its
// content runs out, whether or not the block has a `then` clause. A scene that
// runs out of content after a choice therefore reaches the scene's implicit
// `done` and ends without a runtime error, including when the choice sits in a
// `choose` inside an `if`.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

// Continues until the story stops, choosing `picks` in order, and returns the
// text shown and the errors `onError` received.
function drive(source: string, ...picks: string[]) {
  const ctx = makeRuntimeStoryFromSource(source);
  const story: any = ctx.story;
  const runtimeErrors: string[] = [];
  story.onError = (message: string) => runtimeErrors.push(message);
  const lines: string[] = [];
  const run = () => {
    while (story.canContinue) {
      const text = story.Continue();
      if (text) lines.push(text.trim());
    }
  };
  run();
  for (const pick of picks) {
    const index = story.currentChoices.findIndex((c: any) => c.text === pick);
    expect(index, `choice ${pick}`).toBeGreaterThanOrEqual(0);
    story.ChooseChoiceIndex(index);
    run();
  }
  return {
    compileErrors: ctx.errorMessages,
    runtimeErrors,
    lines,
    choices: story.currentChoices.map((c: any) => c.text),
  };
}

describe("a choose block's end", () => {
  test("a scene with no choose block ends cleanly", () => {
    const result = drive(`
-> main

scene main
  The end.
end
`);
    expect(result.runtimeErrors).toEqual([]);
    expect(result.lines).toEqual(["The end."]);
  });

  test("content after a choose block with no then clause runs, and the scene ends cleanly", () => {
    const result = drive(
      `
-> main

scene main
  choose
    * Up
  end
  The end.
end
`,
      "Up",
    );
    expect(result.compileErrors).toEqual([]);
    expect(result.runtimeErrors).toEqual([]);
    expect(result.lines).toEqual(["Up", "The end."]);
    expect(result.choices).toEqual([]);
  });

  test("content after a choose block runs after whichever choice was taken", () => {
    const source = `
-> main

scene main
  choose
    * Up
      Going up.
    * Down
      Going down.
  end
  The end.
end
`;
    const up = drive(source, "Up");
    expect(up.runtimeErrors).toEqual([]);
    expect(up.lines).toEqual(["Up", "Going up.", "The end."]);
    const down = drive(source, "Down");
    expect(down.runtimeErrors).toEqual([]);
    expect(down.lines).toEqual(["Down", "Going down.", "The end."]);
  });

  test("a scene that ends with a choose block ends cleanly after its choice", () => {
    const result = drive(
      `
-> main

scene main
  choose
    * Up
  end
end
`,
      "Up",
    );
    expect(result.runtimeErrors).toEqual([]);
    expect(result.lines).toEqual(["Up"]);
  });

  test("a then clause still runs after the choice, before content after the block", () => {
    const result = drive(
      `
-> main

scene main
  choose
    * Up
  then
    Then.
  end
  The end.
end
`,
      "Up",
    );
    expect(result.runtimeErrors).toEqual([]);
    expect(result.lines).toEqual(["Up", "Then.", "The end."]);
  });

  test("a choice offered from an if continues after its choose block", () => {
    const source = `
-> main

scene main
  choose
    if true then
      * Unlock
        Unlocked.
    end
    * Leave
  end
  After.
end
`;
    const unlock = drive(source, "Unlock");
    expect(unlock.compileErrors).toEqual([]);
    expect(unlock.runtimeErrors).toEqual([]);
    expect(unlock.lines).toEqual(["Unlock", "Unlocked.", "After."]);
    const leave = drive(source, "Leave");
    expect(leave.runtimeErrors).toEqual([]);
    expect(leave.lines).toEqual(["Leave", "After."]);
  });

  test("a label after a choose block runs once, whether reached by divert or by falling through", () => {
    const source = `
-> main

scene main
  choose
    * Jump
      -> here
    * Walk
  end
  Skipped by the jump.
  label here
  Here.
end
`;
    const jump = drive(source, "Jump");
    expect(jump.runtimeErrors).toEqual([]);
    expect(jump.lines).toEqual(["Jump", "Here."]);
    const walk = drive(source, "Walk");
    expect(walk.runtimeErrors).toEqual([]);
    expect(walk.lines).toEqual(["Walk", "Skipped by the jump.", "Here."]);
  });

  test("two choose blocks in a row each run once", () => {
    const result = drive(
      `
-> main

scene main
  choose
    * A
  then
    X.
  end
  choose
    * B
  end
  The end.
end
`,
      "A",
      "B",
    );
    expect(result.runtimeErrors).toEqual([]);
    expect(result.lines).toEqual(["A", "X.", "B", "The end."]);
    expect(result.choices).toEqual([]);
  });

  test("choosing inside a choose nested in an if ends cleanly", () => {
    const result = drive(
      `
-> main

scene main
  choose
    Outer.
    if true then
      choose
        Inner.
        & print("Aside.")
        * Inner choice
      end
    end
    * Outer choice
  end
end
`,
      "Inner choice",
    );
    expect(result.compileErrors).toEqual([]);
    expect(result.runtimeErrors).toEqual([]);
    expect(result.lines.at(-1)).toEqual("Inner choice");
    expect(result.choices).toEqual([]);
  });

  test("choosing inside a choose nested in an if continues after the outer choose block", () => {
    const result = drive(
      `
-> main

scene main
  choose
    if true then
      choose
        * Inner choice
      end
    end
    * Outer choice
  end
  After.
end
`,
      "Inner choice",
    );
    expect(result.runtimeErrors).toEqual([]);
    expect(result.lines).toEqual(["Inner choice", "After."]);
    expect(result.choices).toEqual([]);
  });
});
