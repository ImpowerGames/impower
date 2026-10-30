import { describe, expect, test } from "vitest";
import { createHarness, type UIHarness } from "./harness/uiTestHarness";

const spanTexts = (msgs: unknown[]): unknown[] =>
  msgs
    .filter((m: any) => m.params?.type === "span")
    .map((m: any) => m.params?.content?.text);

const set = (h: UIHarness, name: string, value: unknown): void =>
  (h.game.story as any).variablesState.$(name, value);

const refresh = (h: UIHarness): void =>
  (h.game.module.ui as any).refreshLayouts();

describe("reactive if/match (Phase 3 I3)", () => {
  test("if/elseif/else mounts the active branch and swaps on state change", async () => {
    const h = createHarness(
      `store dead = false
store hp = 100
layout hud with
  if dead then
    text "GAME OVER"
  elseif hp < 10 then
    text "Low"
  else
    text "OK"
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toContain("OK");

    h.reset();
    set(h, "hp", 5);
    refresh(h);
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toContain("Low");
    expect(h.snapshotFiltered("ui/destroy").length).toBeGreaterThan(0);

    h.reset();
    set(h, "dead", true);
    refresh(h);
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toContain("GAME OVER");
    expect(h.snapshotFiltered("ui/destroy").length).toBeGreaterThan(0);
  });

  test("no churn when the selected branch is unchanged", async () => {
    const h = createHarness(
      `store hp = 100
layout hud with
  if hp < 10 then
    text "Low"
  else
    text "OK"
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    h.reset();
    refresh(h);
    expect(h.snapshotFiltered("ui/create")).toEqual([]);
    expect(h.snapshotFiltered("ui/destroy")).toEqual([]);
  });

  test("match/case/else selects the matching arm and swaps on change", async () => {
    const h = createHarness(
      `store cls = "knight"
layout sheet with
  match cls do
  case "knight"
    text "Knight"
  case "mage"
    text "Mage"
  else
    text "Other"
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toContain("Knight");

    h.reset();
    set(h, "cls", "mage");
    refresh(h);
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toContain("Mage");
    expect(h.snapshotFiltered("ui/destroy").length).toBeGreaterThan(0);

    h.reset();
    set(h, "cls", "rogue");
    refresh(h);
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toContain("Other");
  });

  test("reactive bindings inside a branch update without a branch swap", async () => {
    const h = createHarness(
      `store hp = 100
layout hud with
  if hp > 0 then
    text "HP: {hp}"
  else
    text "DEAD"
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toContain("HP: 100");

    h.reset();
    set(h, "hp", 42);
    refresh(h);
    expect(h.snapshotFiltered("ui/create")).toEqual([]);
    const update = h
      .snapshotFiltered("ui/update")
      .find(
        (m: any) =>
          typeof m.params?.content?.text === "string" &&
          m.params.content.text.startsWith("HP:"),
      ) as any;
    expect(update?.params?.content?.text).toBe("HP: 42");
  });
});
