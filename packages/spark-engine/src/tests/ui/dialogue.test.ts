import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SCREEN = `define HERO as character with
  name = "HERO"
end

layout main with
  textbox {
    character_info {
      character_name {
        text
      }
      character_parenthetical {
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
  return `${SCREEN}\n-> start\n\nscene start\n${body}\nend\n`;
}

describe("dialogue", () => {
  test("animated dialogue line (per-glyph create + per-letter animate)", async () => {
    const harness = createHarness(story(`  HERO: Hi.`));
    await harness.ready;
    harness.jumpToFlow("start");
    harness.reset();
    const beat = harness.nextBeat();
    expect(beat).toBeTruthy();
    await harness.display(beat!, false);
    await flushMicrotasks();
    expect(harness.snapshotWire("ui/")).toMatchSnapshot();
  });

  test("instant dialogue line (no per-letter timing)", async () => {
    const harness = createHarness(story(`  HERO: Hi.`));
    await harness.ready;
    harness.jumpToFlow("start");
    harness.reset();
    const beat = harness.nextBeat();
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(harness.snapshotWire("ui/")).toMatchSnapshot();
  });

  test("character name + parenthetical routing", async () => {
    const harness = createHarness(story(`  HERO (cheerfully): Hi there.`));
    await harness.ready;
    harness.jumpToFlow("start");
    harness.reset();
    const beat = harness.nextBeat();
    expect(Object.keys(beat?.text ?? {}).sort()).toMatchSnapshot("text-targets");
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(harness.snapshotWire("ui/")).toMatchSnapshot("messages");
  });

  test("inline-styled chunks (bold / italic)", async () => {
    const harness = createHarness(
      story(`  HERO: This is **bold** and *italic* text.`),
    );
    await harness.ready;
    harness.jumpToFlow("start");
    harness.reset();
    const beat = harness.nextBeat();
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(harness.snapshotWire("ui/")).toMatchSnapshot();
  });

  test("multi-line dialogue with whitespace + centered alignment", async () => {
    const harness = createHarness(
      story(`  HERO: Line one.\n  ^Centered line.^`),
    );
    await harness.ready;
    harness.jumpToFlow("start");
    harness.reset();
    const beat = harness.nextBeat();
    await harness.display(beat!, true);
    await flushMicrotasks();
    expect(harness.snapshotWire("ui/")).toMatchSnapshot();
  });

  test("a body containing a colon still routes to dialogue (no regex mis-extract)", async () => {
    const harness = createHarness(story(`  HERO: Well: hello.`));
    await harness.ready;
    harness.jumpToFlow("start");
    const beat = harness.nextBeat();
    const dialogueText = (beat?.text?.["dialogue"] ?? [])
      .map((e: any) => e.text ?? "")
      .join("");
    expect(dialogueText).toBe("Well: hello.");
    const nameText = (beat?.text?.["character_name"] ?? [])
      .map((e: any) => e.text ?? "")
      .join("");
    expect(nameText).toBe("HERO");
    expect(beat?.text?.["action"]).toBeUndefined();
  });
});
