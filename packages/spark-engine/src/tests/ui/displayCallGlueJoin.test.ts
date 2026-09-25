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
  choice 0:
    text
  choice 1:
    text
end
`;

function story(body: string) {
  return `${SCREEN}\n-> start\n\nscene start\n${body}\nend\n`;
}

async function beats(body: string) {
  const harness = createHarness(story(body));
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

const NESTED = `  You see a ..
  if true then
    .. red door.
  end`;

describe("display() glue join", () => {
  test("a continuation inside an if branch keeps its text", async () => {
    expect(await beats(NESTED)).toEqual([
      { target: "action", text: "You see a red door." },
    ]);
  });

  test("a line after a glued pair is its own beat", async () => {
    expect(
      await beats(`  You see a ..\n  .. red door.\n  It is locked.`),
    ).toEqual([
      { target: "action", text: "You see a red door." },
      { target: "action", text: "It is locked." },
    ]);
  });

  test("the first routing wins in a joined dialogue beat", async () => {
    const result = await beats(`  HERO: Wait ..\n  .. right there.`);
    expect(result.find((b) => b.target === "dialogue")?.text).toBe(
      "Wait right there.",
    );
  });

  test("a touching `..` joins with no space", async () => {
    expect(await beats(`  Abso..\n  ..lutely.\n  After.`)).toEqual([
      { target: "action", text: "Absolutely." },
      { target: "action", text: "After." },
    ]);
  });

  // The break's beat waits for a click, and the next line carries on in its
  // box (extendAfterBreak.test.ts), joining with no space.
  test("touching `.. >` then `..` waits, then carries on in the box", async () => {
    expect(await beats(`  Abso.. >\n  ..lutely.\n  After.`)).toEqual([
      { target: "action", text: "Abso" },
      { target: "action", text: "Absolutely." },
      { target: "action", text: "After." },
    ]);
  });

  // What shows between a caption and its choices ends the caption's beat,
  // and the next beat, which the engine carried over from the caption's
  // continue, shows it. That line is not a caption, so it returns at its
  // newline like any line, and the choices come in a beat of their own.
  test("a caption a print follows is a beat of its own", async () => {
    const harness = createHarness(
      story(
        `  choose\n    HERO: Pick one.\n    & print("A voice calls out.")\n    * One\n    * Two\n  end`,
      ),
    );
    await harness.ready;
    harness.jumpTo("start");
    harness.reset();
    const texts = (beat: ReturnType<typeof harness.nextBeat>) =>
      Object.fromEntries(
        Object.entries(beat?.text ?? {}).map(([target, instructions]) => [
          target,
          instructions.map((t) => t.text).join("").trim(),
        ]),
      );
    const first = harness.nextBeat();
    expect(texts(first)).toEqual({
      dialogue: "Pick one.",
      character_name: "HERO",
    });
    expect(first?.choices ?? []).toEqual([]);
    await harness.display(first!, true);
    await flushMicrotasks();
    const second = harness.nextBeat();
    expect(texts(second)).toEqual({ action: "A voice calls out." });
    expect(second?.choices ?? []).toEqual([]);
    await harness.display(second!, true);
    await flushMicrotasks();
    const third = harness.nextBeat();
    expect(texts(third)).toEqual({ "choice 0": "One", "choice 1": "Two" });
    expect(third?.choices).toEqual(["choice 0", "choice 1"]);
  });

  test("a choose block's caption shows with its choices", async () => {
    const harness = createHarness(
      story(`  choose\n    HERO: Pick one.\n    * One\n    * Two\n  end`),
    );
    await harness.ready;
    harness.jumpTo("start");
    harness.reset();
    const beat = harness.nextBeat();
    expect(beat?.choices).toEqual(["choice 0", "choice 1"]);
    const text = Object.fromEntries(
      Object.entries(beat?.text ?? {}).map(([target, instructions]) => [
        target,
        instructions.map((t) => t.text).join("").trim(),
      ]),
    );
    expect(text).toMatchObject({
      dialogue: "Pick one.",
      "choice 0": "One",
      "choice 1": "Two",
    });
  });
});
