import { describe, expect, it } from "vitest";
import { BRANCHES, playFrom, previewAt } from "./playFromLine";

const DONE = `scene start
  Hello.
  done
end
`;

const FIN = `scene start
  Hello.
  fin
end
`;

const SCORED = `store score = 0

scene start
  Shown.
  & score = 2
  done
end
`;

const LAYOUT_ONLY = `layout hud with
  text "Static."
end
scene start
  [[open hud]]
  done
end
`;

const SKIPPED = `scene start
  Shown.
  if false then
    Skipped.
  end
  done
end
`;

describe("PLAY from a line that ends the story inside a scene", () => {
  it.each([
    ["the scene's first line", DONE, 1, "Hello."],
    ["a done", DONE, 2, "Hello."],
    ["the closing end after a done", DONE, 3, "Hello."],
    ["a fin", FIN, 2, "Hello."],
    ["a done below a beat the run skips", SKIPPED, 5, "Shown."],
  ])(
    "from %s, waits on the last beat the run displayed",
    async (_name, source, line, shown) => {
      const outcome = await playFrom(source, line);
      expect(outcome.started).toBe(true);
      expect(outcome.exited).toEqual([]);
      expect(outcome.state).toBe("running");
      expect(outcome.text).toContain(shown);
      expect(outcome.text).not.toContain("Skipped.");
    },
    120_000,
  );
});

describe("PLAY from a line whose run shows nothing starts as the story stands there", () => {
  it("keeps what the lines after the beat on screen did", async () => {
    const outcome = await playFrom(SCORED, 5);
    expect(outcome.started).toBe(true);
    expect(outcome.state).toBe("running");
    expect(outcome.text).toContain("Shown.");
    expect(outcome.score).toBe(2);
  }, 120_000);

  it("waits on a beat on screen that showed no text", async () => {
    const outcome = await playFrom(LAYOUT_ONLY, 5);
    expect(outcome.started).toBe(true);
    expect(outcome.exited).toEqual([]);
    expect(outcome.state).toBe("running");
  }, 120_000);
});

describe("the preview at a line whose run shows nothing", () => {
  it.each([
    ["a done", 2],
    ["the closing end at the end of the script", 3],
  ])("at %s, shows the last beat the run displayed", async (_name, line) => {
    expect(await previewAt(DONE, line)).toContain("Hello.");
  }, 120_000);
});

describe("PLAY inside a branch only a divert from outside its scene enters", () => {
  it.each([
    ["the branch's first line", 5, "Inner 1."],
    ["a tunnel divert", 6, "Visit 2 t."],
    ["a tunnel return", 13, "Aside 3."],
    ["a done after a tunnel's onward divert", 31, "Last 5."],
    ["a done no run reaches", 23, "Never shown."],
  ])("from %s, runs with the divert's arguments", async (_name, line, shown) => {
    const outcome = await playFrom(BRANCHES, line);
    expect(outcome.started).toBe(true);
    expect(outcome.exited).toEqual([]);
    expect(outcome.state).toBe("running");
    expect(outcome.text).toContain(shown);
  }, 120_000);
});
