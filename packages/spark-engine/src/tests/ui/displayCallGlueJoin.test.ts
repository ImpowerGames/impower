// A glued chain lowers to several `display(<table>)` calls that one engine step
// joins into one beat: routing comes from the first table that names a target
// and the body is the
// step's ordered text, so a continuation reached through control flow (an `if`
// branch, where the base line cannot see it at compile time) keeps its words.

import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SCREEN = `define HERO as character with
  name = "HERO"
end

layout main with
  action:
    text
  dialogue:
    character_info:
      character_name:
        text
    text
end
`;

function story(body: string) {
  return `${SCREEN}\n-> start\n\nscene start\n${body}\nend\n`;
}

async function beats(body: string, experimentalDisplayCalls: boolean) {
  const harness = createHarness(story(body), 0, { experimentalDisplayCalls });
  await harness.ready;
  harness.jumpTo("start");
  harness.reset();
  const out: { target: string; text: string }[] = [];
  let beat = harness.nextBeat();
  while (beat) {
    for (const [target, instructions] of Object.entries(beat.text ?? {})) {
      const text = instructions.map((t) => t.text).join("");
      out.push({ target, text: text.trim() });
    }
    await harness.display(beat, true);
    await flushMicrotasks();
    beat = harness.nextBeat();
  }
  return out;
}

const NESTED = `  You see a
  if true then
    .. red door.
  end`;

describe("display() glue join", () => {
  test("a continuation inside an if branch keeps its text", async () => {
    expect(await beats(NESTED, true)).toEqual([
      { target: "action", text: "You see a red door." },
    ]);
  });

  test("the option-off stream reads the same", async () => {
    expect(await beats(NESTED, false)).toEqual([
      { target: "action", text: "You see a red door." },
    ]);
  });

  test("a line after a glued pair is its own beat", async () => {
    expect(
      await beats(`  You see a ..\n  red door.\n  It is locked.`, true),
    ).toEqual([
      { target: "action", text: "You see a red door." },
      { target: "action", text: "It is locked." },
    ]);
  });

  test("the first routing wins in a joined dialogue beat", async () => {
    const result = await beats(`  HERO: Wait ..\n  right there.`, true);
    expect(result.find((b) => b.target === "dialogue")?.text).toBe(
      "Wait right there.",
    );
  });
});
