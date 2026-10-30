import { describe, expect, test } from "vitest";
import {
  compileUI,
  createHarness,
  flushMicrotasks,
} from "./harness/uiTestHarness";

const SCREEN = `layout main with
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

const beatText = (beat: any, target: string): string =>
  (beat?.text?.[target] ?? []).map((e: any) => e.text ?? "").join("");

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


scene start
  KING: Hail!
end
`;
    const harness = createHarness(story);
    await harness.ready;
    harness.jumpToFlow("start");
    const beat = harness.nextBeat();

    expect(beatText(beat, "character_name")).toBe("King Arthur");
    expect(beatText(beat, "character_name")).not.toBe("KING");
    expect(beatText(beat, "dialogue")).toBe("Hail!");

    harness.reset();
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(writtenText(harness, "character_name")).toBe("King Arthur");
  });

  test("falls back to the cue text for an undefined character", async () => {
    const story = `${SCREEN}


scene start
  GUARD: Halt!
end
`;
    const harness = createHarness(story);
    await harness.ready;
    harness.jumpToFlow("start");
    const beat = harness.nextBeat();

    expect(beatText(beat, "character_name")).toBe("GUARD");
    expect(beatText(beat, "dialogue")).toBe("Halt!");
  });

  test("a defined character with no `name` falls back to the cue (not blank)", async () => {
    const story = `define GUARD as character with
  color = red
end

${SCREEN}


scene start
  GUARD: Halt!
end
`;
    const harness = createHarness(story);
    await harness.ready;
    harness.jumpToFlow("start");
    const beat = harness.nextBeat();

    expect(beatText(beat, "character_name")).toBe("GUARD");
    expect(beatText(beat, "dialogue")).toBe("Halt!");
  });

  test("recompiling in place (live edit) refreshes the resolved name", async () => {
    const withName = `define KING as character with
  name = "King Arthur"
end

${SCREEN}


scene start
  KING: Hail!
end
`;
    const withoutName = `define KING as character with
end

${SCREEN}


scene start
  KING: Hail!
end
`;
    const harness = createHarness(withName);
    await harness.ready;
    harness.jumpToFlow("start");
    expect(beatText(harness.nextBeat(), "character_name")).toBe("King Arthur");

    const { program } = compileUI(withoutName);
    harness.game.updateProgram(program as any);
    harness.jumpToFlow("start");
    expect(beatText(harness.nextBeat(), "character_name")).toBe("KING");
  });
});
