import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";
import { WriteTextMessage } from "../../game/modules/ui/classes/messages/WriteTextMessage";

const SCREEN = `layout main with
  action {
    text
  }
end
`;

async function beatFor(body: string, instant = true) {
  const harness = createHarness(
    `${SCREEN}\n-> start\n\nscene start\n${body}\nend\n`,
  );
  await harness.ready;
  harness.jumpToFlow("start");
  harness.reset();
  const beat = harness.nextBeat();
  await harness.display(beat!, instant);
  await flushMicrotasks();
  return { harness, beat };
}

describe("display() call → rendered beat (engine wiring)", () => {
  test("a display({target,text}) beat flushes structured text instructions", async () => {
    const { harness, beat } = await beatFor(
      `  & display({ target = "action", text = "Hello." })`,
    );
    expect(Object.keys(beat?.text ?? {})).toEqual(["action"]);
    expect(textOf(beat, "action")).toBe("Hello.");
    const writes = harness.messages.filter(
      (m) => m.method === WriteTextMessage.method,
    );
    expect(writes.length).toBeGreaterThan(0);
  });

  test("consecutive display() calls render as separate beats", async () => {
    const harness = createHarness(
      `${SCREEN}\n-> start\n\nscene start\n` +
        `  & display({ target = "action", text = "first" })\n` +
        `  & display({ target = "action", text = "second" })\n` +
        `end\n`,
    );
    await harness.ready;
    harness.jumpToFlow("start");
    harness.reset();

    const first = harness.nextBeat();
    expect(textOf(first, "action")).toBe("first");

    const second = harness.nextBeat();
    expect(textOf(second, "action")).toBe("second");
  });
});

function textOf(
  beat: { text?: Record<string, { text?: string }[]> } | undefined,
  target: string,
): string {
  return (beat?.text?.[target] ?? [])
    .map((e) => e.text ?? "")
    .join("");
}
