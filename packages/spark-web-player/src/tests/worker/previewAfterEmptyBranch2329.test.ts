import { describe, expect, it } from "vitest";
import { previewAt } from "./playFromLine";

const SCRIPT = `scene start
  Outer.
  branch nested
    Inner.
  end
  x = 1

  After.
end

scene opens_on_a_branch
  branch first
  end
  Outer again.
end
`;

describe("the preview in a scene that opens on an empty branch", () => {
  it.each([
    ["the scene's header", 10],
    ["the empty branch's header", 11],
    ["the empty branch's end", 12],
    ["the beat after the empty branch", 13],
  ] as const)(
    "at %s, shows that scene's beat",
    async (_name, line) => {
      const text = await previewAt(SCRIPT, line);
      expect(text).toContain("Outer again.");
      expect(text).not.toContain("Outer.");
    },
    120_000,
  );

  it("after a nested branch's end, shows the beat on that line", async () => {
    const text = await previewAt(SCRIPT, 7);
    expect(text).toContain("After.");
    expect(text).not.toContain("Inner.");
  }, 120_000);
});

const NO_BEAT = `scene start
  Outer.
end

scene only_a_function
  function f()
    return 1
  end
`;

describe("the preview in a scene where no line has a beat", () => {
  it.each([
    ["the scene's header", 4],
    ["the function's header", 5],
    ["the function's body", 6],
    ["the function's end", 7],
  ] as const)(
    "at %s, shows no beat of the scene above",
    async (_name, line) => {
      expect(await previewAt(NO_BEAT, line)).not.toContain("Outer.");
    },
    120_000,
  );
});
