// A defined character's `name` property is what renders as the speaker name when
// the character is cued in a dialogue statement — NOT the cue identifier. (The
// InterpreterModule resolves the cue to the character define and uses
// characterObj.name, falling back to the cue text when there's no name.)

import { describe, expect, test } from "vitest";
import {
  compileUI,
  createHarness,
  flushMicrotasks,
} from "./harness/uiTestHarness";

const SCREEN = `screen main with
  textbox:
    character_info:
      character_name:
        text
    dialogue:
      text
end
`;

/** Concatenated text of a beat's instructions for a target. */
const beatText = (beat: any, target: string): string =>
  (beat?.text?.[target] ?? []).map((e: any) => e.text ?? "").join("");

/** Concatenated text of the ui/write-text emitted for a target. */
const writtenText = (harness: any, target: string): string => {
  const msg = harness
    .snapshotFiltered("ui/write-text")
    .find((m: any) => m.params?.target === target) as any;
  return (msg?.params?.instructions ?? [])
    .map((i: any) => i.text ?? "")
    .join("");
};

describe("character name in dialogue", () => {
  test("a defined character's `name` renders as the speaker name (not the cue)", async () => {
    const story = `define KING as character with
  name = "King Arthur"
end

${SCREEN}
-> start

scene start
  KING: Hail!
end
`;
    const harness = createHarness(story);
    await harness.ready;
    harness.jumpTo("start");
    const beat = harness.nextBeat();

    expect(beatText(beat, "character_name")).toBe("King Arthur");
    expect(beatText(beat, "character_name")).not.toBe("KING");
    expect(beatText(beat, "dialogue")).toBe("Hail!");

    // End-to-end: the name reaches the renderer via ui/write-text.
    harness.reset();
    await harness.display(beat!, /* instant */ true);
    await flushMicrotasks();
    expect(writtenText(harness, "character_name")).toBe("King Arthur");
  });

  test("falls back to the cue text for an undefined character", async () => {
    const story = `${SCREEN}
-> start

scene start
  GUARD: Halt!
end
`;
    const harness = createHarness(story);
    await harness.ready;
    harness.jumpTo("start");
    const beat = harness.nextBeat();

    // No `define GUARD` → no character object → the cue text is the name.
    expect(beatText(beat, "character_name")).toBe("GUARD");
    expect(beatText(beat, "dialogue")).toBe("Halt!");
  });

  test("a defined character with no `name` falls back to the cue (not blank)", async () => {
    // Without a `name`, the character inherits `name = ""` from the type default;
    // that empty string must not render as a blank speaker — fall back to the cue.
    const story = `define GUARD as character with
  color = red
end

${SCREEN}
-> start

scene start
  GUARD: Halt!
end
`;
    const harness = createHarness(story);
    await harness.ready;
    harness.jumpTo("start");
    const beat = harness.nextBeat();

    expect(beatText(beat, "character_name")).toBe("GUARD");
    expect(beatText(beat, "dialogue")).toBe("Halt!");
  });

  test("recompiling in place (live edit) refreshes the resolved name", async () => {
    const withName = `define KING as character with
  name = "King Arthur"
end

${SCREEN}
-> start

scene start
  KING: Hail!
end
`;
    const withoutName = `define KING as character with
end

${SCREEN}
-> start

scene start
  KING: Hail!
end
`;
    const harness = createHarness(withName);
    await harness.ready;
    harness.jumpTo("start");
    expect(beatText(harness.nextBeat(), "character_name")).toBe("King Arthur");

    // Simulate the editor recompiling the EDITED source into the SAME game
    // (the workspace worker's updateProgram path) — the resolved name must
    // refresh, not keep the previous program's "King Arthur".
    const { program } = compileUI(withoutName);
    harness.game.updateProgram(program as any);
    harness.jumpTo("start");
    expect(beatText(harness.nextBeat(), "character_name")).toBe("KING");
  });
});
