// PLAY and the preview at the `end` that closes a scene or branch with more
// script below it (I-1618). The `end` belongs to the flow it closes, so the
// game starts on the beat on screen when that flow finishes, not on the first
// beat of the flow below it.
import { describe, expect, it } from "vitest";
import { BRANCHES, playFrom, previewAt } from "./playFromLine";

const SCENES = `scene start
  First.
  done
end
scene other
  Other.
end
`;

// The scene runs to its own `done`; nothing enters the branch written
// inside it.
const SCENE_WITH_BRANCH = `scene start
  Main.
  done
  branch unused
    Unused.
    done
  end
end
scene other
  Other.
end
`;

const CASES = [
  // The flow below shows "Other.".
  ["a scene's end", SCENES, 3, "First.", ["Other."]],
  // The branch inside the scene shows "Unused.".
  ["a scene's end below a branch it holds", SCENE_WITH_BRANCH, 7, "Main.", ["Unused.", "Other."]],
  // The line above is the divert the branch leaves by, which shows the beat
  // it leads to; the branch below shows "Visit 2 t.".
  ["the end of a branch that diverts out", BRANCHES, 8, "Second 4 b.", ["Visit"]],
  // No run reaches the `done` above, whose jumped run shows "Never shown.";
  // the branch below shows "Leave 4.".
  ["the end of a branch below a done no run reaches", BRANCHES, 22, "Never shown.", ["Leave"]],
] as const;

describe("PLAY from the end that closes a flow with more script below", () => {
  it.each(CASES)(
    "from %s, waits on the beat its own flow left on screen",
    async (_name, source, line, shown, notShown) => {
      const outcome = await playFrom(source, line);
      expect(outcome.started).toBe(true);
      expect(outcome.exited).toEqual([]);
      expect(outcome.state).toBe("running");
      expect(outcome.text).toContain(shown);
      for (const text of notShown) {
        expect(outcome.text).not.toContain(text);
      }
    },
    120_000,
  );
});

describe("the preview at the end that closes a flow with more script below", () => {
  it.each(CASES)(
    "at %s, shows the beat its own flow left on screen",
    async (_name, source, line, shown, notShown) => {
      const text = await previewAt(source, line);
      expect(text).toContain(shown);
      for (const other of notShown) {
        expect(text).not.toContain(other);
      }
    },
    120_000,
  );
});
