// A `choose` block's `end` is where every choice in it continues once its
// content runs out, whether or not the block has a `then` clause, and the
// flow holds at the block until a choice is taken: what follows the block in
// the script, at any nesting, runs after the choice. A scene that runs out of
// content after a choice therefore reaches the scene's implicit `done` and
// ends without a runtime error, including when the block sits inside an `if`.
// A block that offers no choice holds nothing, and the flow runs on past it.
// A block in another block's preamble offers its choices with that block's.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

// Continues until the story stops, choosing `picks` in order, and returns the
// text shown, the text shown before each pick and after the last one
// (`steps`), the choices offered at each pick (`offered`), and the errors
// `onError` received.
function drive(source: string, ...picks: string[]) {
  const ctx = makeRuntimeStoryFromSource(source);
  const story: any = ctx.story;
  const runtimeErrors: string[] = [];
  story.onError = (message: string) => runtimeErrors.push(message);
  // The game listens for the paths the story runs. Listening makes the story
  // read the path of every pointer it steps through, including an empty
  // gather's start, so the hook stays although nothing reads what it gets.
  story.onExecute = () => {};
  const lines: string[] = [];
  const steps: string[][] = [];
  const offered: string[][] = [];
  const run = () => {
    const step: string[] = [];
    while (story.canContinue) {
      const text = story.Continue();
      if (text) step.push(text.trim());
    }
    lines.push(...step);
    steps.push(step);
  };
  const choices = () => story.currentChoices.map((c: any) => c.text);
  run();
  for (const pick of picks) {
    offered.push(choices());
    const index = story.currentChoices.findIndex((c: any) => c.text === pick);
    expect(index, `choice ${pick}`).toBeGreaterThanOrEqual(0);
    story.ChooseChoiceIndex(index);
    run();
  }
  return {
    compileErrors: ctx.errorMessages,
    runtimeErrors,
    lines,
    steps,
    offered,
    choices: choices(),
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
    expect(result.offered).toEqual([["Inner choice", "Outer choice"]]);
    expect(result.steps.at(-1)).toEqual(["Inner choice"]);
    expect(result.choices).toEqual([]);
  });

  test("content after a block in another block's preamble runs with that preamble, before the choices", () => {
    const result = drive(
      `
-> main

scene main
  choose
    if true then
      choose
        * Inner choice
      end
      Still in the preamble.
    end
    * Outer choice
  end
  After the outer choose.
end
`,
      "Inner choice",
    );
    expect(result.runtimeErrors).toEqual([]);
    expect(result.steps[0]).toContain("Still in the preamble.");
    expect(result.offered).toEqual([["Inner choice", "Outer choice"]]);
    expect(result.steps.at(-1)).toEqual([
      "Inner choice",
      "After the outer choose.",
    ]);
  });

  test("a block inside an if holds the flow: what follows the if runs after the choice", () => {
    const source = `
-> cellar

scene cellar
  A heavy door blocks the stairs.
  if has_key then
    choose
      * Unlock it
        The lock gives with a clunk.
      * Leave it for now
        You step back.
    end
  end
  Somewhere above, a floorboard creaks.
  -> hallway
end

scene hallway
  The hallway is dark.
end
`;
    const withKey = drive(`store has_key = true\n${source}`, "Unlock it");
    expect(withKey.compileErrors).toEqual([]);
    expect(withKey.runtimeErrors).toEqual([]);
    expect(withKey.steps).toEqual([
      ["A heavy door blocks the stairs."],
      [
        "Unlock it",
        "The lock gives with a clunk.",
        "Somewhere above, a floorboard creaks.",
        "The hallway is dark.",
      ],
    ]);
    expect(withKey.choices).toEqual([]);
    const withoutKey = drive(`store has_key = false\n${source}`);
    expect(withoutKey.runtimeErrors).toEqual([]);
    expect(withoutKey.lines).toEqual([
      "A heavy door blocks the stairs.",
      "Somewhere above, a floorboard creaks.",
      "The hallway is dark.",
    ]);
  });

  test("a block inside an if in a choice's content holds the flow, and nothing replays", () => {
    const result = drive(
      `
-> main

scene main
  choose
    * Search the desk
      if true then
        choose
          * Read the letter
        end
        You fold the letter.
      end
      You close the desk.
  end
  The clock strikes nine.
end
`,
      "Search the desk",
      "Read the letter",
    );
    expect(result.runtimeErrors).toEqual([]);
    expect(result.steps).toEqual([
      [],
      ["Search the desk"],
      [
        "Read the letter",
        "You fold the letter.",
        "You close the desk.",
        "The clock strikes nine.",
      ],
    ]);
    expect(result.choices).toEqual([]);
  });

  test("a choice from a block inside an if continues when the scene ends in a divert", () => {
    const result = drive(
      `
-> main

scene main
  if true then
    choose
      * A
    end
  end
  -> other
end

scene other
  Other.
end
`,
      "A",
    );
    expect(result.runtimeErrors).toEqual([]);
    expect(result.steps).toEqual([[], ["A", "Other."]]);
  });

  test("a block that offers no choice holds nothing: the flow runs on past it", () => {
    const result = drive(`
store has_key = false
-> main

scene main
  Door.
  choose
    if has_key then
      * Unlock
    end
  end
  You walk away.
end
`);
    expect(result.runtimeErrors).toEqual([]);
    expect(result.lines).toEqual(["Door.", "You walk away."]);
    expect(result.choices).toEqual([]);
  });

  test("a block that offers no choice runs on even after a choice generated before it", () => {
    const result = drive(`
-> main

scene main
  if true then
    * Stray
  end
  choose
    if false then
      * Hidden
    end
  end
  After the empty choose.
end
`);
    expect(result.runtimeErrors).toEqual([]);
    expect(result.lines).toEqual(["After the empty choose."]);
    expect(result.choices).toEqual(["Stray"]);
  });

  test("a block that offers no choice runs on after a thread offered a choice", () => {
    const result = drive(`
store has_key = false
-> hub

scene hub
  <- side
  choose
    if has_key then
      * Unlock
    end
  end
  After the gated block.
end

scene side
  choose
    * Side one
      Side taken.
  end
  done
end
`);
    expect(result.runtimeErrors).toEqual([]);
    expect(result.lines).toEqual(["After the gated block."]);
    expect(result.choices).toEqual(["Side one"]);
  });

  test("a fallback choice fires when every other choice in the block is unavailable", () => {
    const result = drive(`
store has_key = false
-> main

scene main
  choose
    if has_key then
      * Unlock
    end
    * ->
  then
    You give up on the door.
  end
  You walk away.
end
`);
    expect(result.runtimeErrors).toEqual([]);
    expect(result.lines).toEqual(["You give up on the door.", "You walk away."]);
  });

  test("a choice inside two ifs in a block continues after the block", () => {
    const result = drive(
      `
-> main

scene main
  choose
    if true then
      if true then
        * Deep
      end
    end
    * Shallow
  end
  After.
end
`,
      "Deep",
    );
    expect(result.runtimeErrors).toEqual([]);
    expect(result.offered).toEqual([["Deep", "Shallow"]]);
    expect(result.steps.at(-1)).toEqual(["Deep", "After."]);
  });

  test("a choice outside any choose block does not replay the content after it", () => {
    const result = drive(
      `
-> main

scene main
  if true then
    * Stray
  end
  Middle.
  label mark
  Marked.
end
`,
      "Stray",
    );
    expect(result.steps.at(-1)).toEqual(["Stray"]);
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
