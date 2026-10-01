// #1225: an element's parts may go on over later lines, and an event closure
// may span lines. A closure over several lines runs each of its statements
// when its element is clicked, and a wrapped layout mounts the elements its
// one-line form mounts, with the same message stream.

import { describe, expect, test } from "vitest";
import { createHarness } from "./harness/uiTestHarness";

const hpText = (h: ReturnType<typeof createHarness>): string | undefined => {
  const m = h
    .snapshotFiltered("ui/update")
    .find(
      (x: any) =>
        typeof x.params?.content?.text === "string" &&
        x.params.content.text.startsWith("HP:"),
    ) as any;
  return m?.params?.content?.text;
};

const STATE = `store hp = 100
store clicks = 0
`;

describe("a closure handler over several lines", () => {
  for (const [label, button] of [
    [
      "on the element's line",
      `button.primary "Go" @click={
        hp = hp + 1
        clicks = clicks + 1
        hp = hp * 2
      }`,
    ],
    [
      "on a line of its own, with a block statement in it",
      `button
        .primary
        "Go"
        @click={ -- every statement runs
          hp = hp + 1
          if clicks == 0 then
            clicks = clicks + 1
          end
          hp = hp * 2
        }`,
    ],
  ] as const) {
    test(`${label} runs each statement`, async () => {
      const h = createHarness(
        `${STATE}
layout hud with
  column.panel {
    text "HP: {hp}"
    text "Clicks: {clicks}"
    ${button}
  }
end
`,
        0,
        { reactive: true },
      );
      await h.ready;
      const buttonId = h.observedElementIds()[0];
      expect(buttonId).toBeTruthy();
      h.reset();
      h.emitEvent("click", buttonId!);
      // The first and last statements both ran, in order: (100 + 1) * 2.
      expect(hpText(h)).toBe("HP: 202");
      // And the one between them.
      const clicks = h
        .snapshotFiltered("ui/update")
        .map((m: any) => m.params?.content?.text)
        .find((t: unknown) => typeof t === "string" && t.startsWith("Clicks:"));
      expect(clicks).toBe("Clicks: 1");
    });
  }
});

describe("a wrapped layout mounts as its one-line form", () => {
  test("same elements, names and classes, and the same message stream", async () => {
    const wrapped = createHarness(`${STATE}
layout hud with
  column
    .panel
    #child-gap=8
  {
    text
      .title
      "Inventory"
    button
      .primary
      "Use"
    {
      text "inside"
    }
  }
end
`);
    const oneLine = createHarness(`${STATE}
layout hud with
  column.panel #child-gap=8 {
    text.title "Inventory"
    button.primary "Use" { text "inside" }
  }
end
`);
    await Promise.all([wrapped.ready, oneLine.ready]);
    const created = (h: ReturnType<typeof createHarness>) =>
      h
        .snapshotFiltered("ui/create")
        .map((m: any) => m.params?.name)
        .filter((name: string) => name !== undefined);
    const names = created(wrapped);
    for (const name of ["hud", "column panel", "text title", "button primary"]) {
      expect(names).toContain(name);
    }
    expect(names).toEqual(created(oneLine));
    expect(wrapped.snapshotFiltered("ui/")).toEqual(oneLine.snapshotFiltered("ui/"));
  });
});
