// PLAY and the preview at the `end` that closes a scene or branch with more
// script below it (I-1618). The `end` belongs to the flow it closes, so the
// game starts on the beat on screen when that flow finishes, not on the first
// beat of the flow below it. An empty scene's or branch's header and `end`
// show the story as it stands when a run enters that flow.
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle, writtenText } from "./playerHarness";
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

// The scene binds its parameter and enters its first branch, which ends on
// "First."; nothing enters the second.
const PARAMETER_SCENE_BRANCHES = `-> start(7)
scene start(a)
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

// An empty parameter list takes no parameters, so the scene enters its first
// branch.
const EMPTY_PARAMETER_LIST = `-> start
scene start
  branch first()
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
  ["the end of a scene that binds a parameter and enters its first branch", PARAMETER_SCENE_BRANCHES, 10, "First.", ["Unused.", "Other."]],
  ["the end of a scene whose first branch has an empty parameter list", EMPTY_PARAMETER_LIST, 10, "First.", ["Unused.", "Other."]],
  ["the end of a scene whose first branch has a long empty parameter list", EMPTY_PARAMETER_LIST.replace("first()", `first(${" ".repeat(100)})`), 10, "First.", ["Unused.", "Other."]],
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

// The scene's only branch takes a parameter, so entering the scene enters no
// branch: the scene ends at once.
const UNENTERED_BRANCH = `-> start
scene start
  branch needs(a)
    Unused {a}.
    done
  end
end
scene other
  Other.
end
`;

// The same scene, entered after the story displayed "Before.".
const UNENTERED_AFTER_BEAT = `-> pre
scene pre
  Before.
  -> start
end
scene start
  branch needs(a)
    Unused {a}.
    done
  end
end
scene other
  Other.
end
`;

describe("PLAY and the preview at the end of a scene whose branches it does not enter", () => {
  it("PLAY starts and ends without a branch's beat or the flow below", async () => {
    const outcome = await playFrom(UNENTERED_BRANCH, 6);
    expect(outcome.started).toBe(true);
    expect(outcome.exited).toEqual(["finished"]);
    expect(outcome.text).not.toContain("Unused");
    expect(outcome.text).not.toContain("Other.");
  }, 120_000);

  it("the preview shows no branch's beat and nothing of the flow below", async () => {
    const text = await previewAt(UNENTERED_BRANCH, 6);
    expect(text).not.toContain("Unused");
    expect(text).not.toContain("Other.");
  }, 120_000);

  it("PLAY and the preview wait on the beat the run displayed before the scene", async () => {
    const outcome = await playFrom(UNENTERED_AFTER_BEAT, 10);
    expect(outcome.started).toBe(true);
    expect(outcome.exited).toEqual([]);
    expect(outcome.state).toBe("running");
    expect(outcome.text).toContain("Before.");
    expect(outcome.text).not.toContain("Unused");
    expect(outcome.text).not.toContain("Other.");
    const preview = await previewAt(UNENTERED_AFTER_BEAT, 10);
    expect(preview).toContain("Before.");
    expect(preview).not.toContain("Unused");
    expect(preview).not.toContain("Other.");
  }, 120_000);
});

describe("the preview after the end of a scene whose branches it does not enter", () => {
  it("keeps that point while the cursor is on a line with no address, and shows the next beat selected", async () => {
    const empty = "file:///local/empty.sd";
    const h = await createPlayerHarness({
      files: [
        { uri: MAIN_URI, text: UNENTERED_AFTER_BEAT },
        { uri: empty, text: "// no narrative\n" },
      ],
      startFrom: { file: MAIN_URI, line: 10 },
    });
    try {
      await h.compile();
      await h.select(10);
      await settle(40);
      expect(writtenText(h.toRouter)).toContain("Before.");
      // A line no address stands for keeps the point previewed.
      const before = h.toRouter.length;
      await h.select(0, empty);
      await settle(40);
      expect(writtenText(h.toRouter.slice(before))).not.toContain("Other.");
      // The next beat selected is previewed, not taken for the point kept.
      const kept = h.toRouter.length;
      await h.select(12);
      await settle(40);
      expect(writtenText(h.toRouter.slice(kept))).toContain("Other.");
    } finally {
      h.dispose();
    }
  }, 120_000);
});

// The flow runs off its end past a conditional that shows nothing.
const AFTER_CONDITIONAL = `-> start
scene start
  First.
  if false then
    Skipped.
  end
end
scene other
  Other.
end
`;

// The same in a branch, which a divert enters.
const BRANCH_AFTER_CONDITIONAL = `-> start.inner
scene start
  branch inner
    First.
    if false then
      Skipped.
    end
  end
  branch other
    Other.
  end
end
`;

// The conditional's beat shows, so it is the beat on screen at the end.
const AFTER_TRUE_CONDITIONAL = `-> start
scene start
  First.
  if true then
    Shown.
  end
end
scene other
  Other.
end
`;

// The same flow at the end of the script.
const AFTER_CONDITIONAL_AT_END = `-> start
scene start
  First.
  if false then
    Skipped.
  end
end
`;

describe("PLAY and the preview at the end of a flow that runs off its end", () => {
  it.each([
    ["a scene's end past a conditional that shows nothing", AFTER_CONDITIONAL, 6, "First.", ["Skipped.", "Other."]],
    ["a branch's end past a conditional that shows nothing", BRANCH_AFTER_CONDITIONAL, 7, "First.", ["Skipped.", "Other."]],
    ["a scene's end past a conditional that shows its beat", AFTER_TRUE_CONDITIONAL, 6, "Shown.", ["Other."]],
    ["a scene's end at the end of the script, past a conditional", AFTER_CONDITIONAL_AT_END, 6, "First.", ["Skipped."]],
  ] as const)("at %s, shows the beat the run left on screen", async (_name, source, line, shown, notShown) => {
    const outcome = await playFrom(source, line);
    expect(outcome.started).toBe(true);
    expect(outcome.state).toBe("running");
    expect(outcome.text).toContain(shown);
    const preview = await previewAt(source, line);
    expect(preview).toContain(shown);
    for (const text of notShown) {
      expect(outcome.text).not.toContain(text);
      expect(preview).not.toContain(text);
    }
  }, 120_000);
});
