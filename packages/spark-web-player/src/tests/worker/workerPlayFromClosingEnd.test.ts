// PLAY and the preview at the `end` that closes a scene or branch with more
// script below it (I-1618). The `end` belongs to the flow it closes, so the
// game starts on the beat on screen when that flow finishes, not on the first
// beat of the flow below it. An empty scene's or branch's header and `end`
// show the story as it stands when a run enters that flow.
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

// Entering the scene enters its first branch, which ends on "First."; nothing
// enters the second.
const BRANCHES_ONLY = `scene start
  branch first
    First.
    done
  end
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
  // The scene runs nothing of its own before the branch it enters.
  ["the end of a scene that enters its first branch", BRANCHES_ONLY, 9, "First.", ["Unused.", "Other."]],
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

const EMPTY_SCENE = `scene start
end
scene other
  Other.
end
`;

const EMPTY_BRANCH = `scene start
  branch empty
  end
  branch other
    Other.
  end
end
`;

// The story's run shows "First." and then enters the empty scene.
const EMPTY_AFTER_BEAT = `-> start
scene start
  First.
  -> next
end
scene next
end
scene other
  Other.
end
`;

const EMPTY_CASES = [
  ["an empty scene's header", EMPTY_SCENE, 0],
  ["an empty scene's end", EMPTY_SCENE, 1],
  ["the header of a scene that enters an empty branch", EMPTY_BRANCH, 0],
  ["an empty branch's header", EMPTY_BRANCH, 1],
  ["an empty branch's end", EMPTY_BRANCH, 2],
] as const;

describe("PLAY and the preview at an empty scene or branch", () => {
  // No run displays a beat before these flows, so PLAY starts and ends
  // without showing one.
  it.each(EMPTY_CASES)(
    "PLAY from %s starts and ends without the flow below",
    async (_name, source, line) => {
      const outcome = await playFrom(source, line);
      expect(outcome.started).toBe(true);
      expect(outcome.exited).toEqual(["finished"]);
      expect(outcome.text).not.toContain("Other.");
    },
    120_000,
  );

  it.each(EMPTY_CASES)(
    "the preview at %s shows no beat of the flow below",
    async (_name, source, line) => {
      expect(await previewAt(source, line)).not.toContain("Other.");
    },
    120_000,
  );

  it.each([
    ["header", 5],
    ["end", 6],
  ] as const)(
    "PLAY and the preview at the %s of an empty scene a run enters wait on the beat it displayed",
    async (_name, line) => {
      const outcome = await playFrom(EMPTY_AFTER_BEAT, line);
      expect(outcome.started).toBe(true);
      expect(outcome.exited).toEqual([]);
      expect(outcome.state).toBe("running");
      expect(outcome.text).toContain("First.");
      expect(outcome.text).not.toContain("Other.");
      const preview = await previewAt(EMPTY_AFTER_BEAT, line);
      expect(preview).toContain("First.");
      expect(preview).not.toContain("Other.");
    },
    120_000,
  );
});
