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

const PARAMETER_SCENE_BRANCHES = `scene start
  -> main(7)
end
scene main(a)
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

const EMPTY_PARAMETER_LIST = `scene start
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
  ["a scene's end", SCENES, 3, "First.", ["Other."]],
  ["a scene's end below a branch it holds", SCENE_WITH_BRANCH, 7, "Main.", ["Unused.", "Other."]],
  ["the end of a scene that enters its first branch", BRANCHES_ONLY, 9, "First.", ["Unused.", "Other."]],
  ["the end of a scene that binds a parameter and enters its first branch", PARAMETER_SCENE_BRANCHES, 12, "First.", ["Unused.", "Other."]],
  ["the end of a scene whose first branch has an empty parameter list", EMPTY_PARAMETER_LIST, 9, "First.", ["Unused.", "Other."]],
  ["the end of a scene whose first branch has a long empty parameter list", EMPTY_PARAMETER_LIST.replace("first()", `first(${" ".repeat(100)})`), 9, "First.", ["Unused.", "Other."]],
  ["the end of a branch that diverts out", BRANCHES, 10, "Second 4 b.", ["Visit"]],
  ["the end of a branch below a done no run reaches", BRANCHES, 24, "Never shown.", ["Leave"]],
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

const EMPTY_AFTER_BEAT = `scene start
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
    ["header", 4],
    ["end", 5],
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

const UNENTERED_BRANCH = `scene start
  branch needs(a)
    Unused {a}.
    done
  end
end
scene other
  Other.
end
`;

const UNENTERED_AFTER_BEAT = `scene start
  Before.
  -> later
end
scene later
  branch needs(a)
    Unused {a}.
    done
  end
end
scene other
  Other.
end
`;

const BRANCHES_DIVERTED_AT_END = `scene start
  -> outer.inner(1)
end
scene outer
  branch inner(a)
    Inner {a}.
    -> outer.last(a)
  end
  branch last(z)
    Last {z}.
    done
  end
end
`;

describe("PLAY and the preview at the end of a scene whose branches it does not enter", () => {
  it("PLAY starts and ends without a branch's beat or the flow below", async () => {
    const outcome = await playFrom(UNENTERED_BRANCH, 5);
    expect(outcome.started).toBe(true);
    expect(outcome.exited).toEqual(["finished"]);
    expect(outcome.text).not.toContain("Unused");
    expect(outcome.text).not.toContain("Other.");
  }, 120_000);

  it("the preview shows no branch's beat and nothing of the flow below", async () => {
    const text = await previewAt(UNENTERED_BRANCH, 5);
    expect(text).not.toContain("Unused");
    expect(text).not.toContain("Other.");
  }, 120_000);

  it("PLAY and the preview wait on the beat the run displayed before the scene", async () => {
    const outcome = await playFrom(UNENTERED_AFTER_BEAT, 9);
    expect(outcome.started).toBe(true);
    expect(outcome.exited).toEqual([]);
    expect(outcome.state).toBe("running");
    expect(outcome.text).toContain("Before.");
    expect(outcome.text).not.toContain("Unused");
    expect(outcome.text).not.toContain("Other.");
    const preview = await previewAt(UNENTERED_AFTER_BEAT, 9);
    expect(preview).toContain("Before.");
    expect(preview).not.toContain("Unused");
    expect(preview).not.toContain("Other.");
  }, 120_000);

  it("PLAY starts and ends at the end of the script, though a divert ran the scene's branches", async () => {
    const outcome = await playFrom(BRANCHES_DIVERTED_AT_END, 12);
    expect(outcome.started).toBe(true);
    expect(outcome.exited).toEqual(["finished"]);
    expect(outcome.text).not.toContain("Inner");
    expect(outcome.text).not.toContain("Last");
    const preview = await previewAt(BRANCHES_DIVERTED_AT_END, 12);
    expect(preview).not.toContain("Inner");
    expect(preview).not.toContain("Last");
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
      startFrom: { file: MAIN_URI, line: 9 },
    });
    try {
      await h.compile();
      await h.select(9);
      await settle(40);
      expect(writtenText(h.toRouter)).toContain("Before.");
      const before = h.toRouter.length;
      await h.select(0, empty);
      await settle(40);
      expect(writtenText(h.toRouter.slice(before))).not.toContain("Other.");
      const kept = h.toRouter.length;
      await h.select(11);
      await settle(40);
      expect(writtenText(h.toRouter.slice(kept))).toContain("Other.");
    } finally {
      h.dispose();
    }
  }, 120_000);
});

const AFTER_CONDITIONAL = `scene start
  First.
  if false then
    Skipped.
  end
end
scene other
  Other.
end
`;

const BRANCH_AFTER_CONDITIONAL = `scene start
  -> main.inner
end
scene main
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

const AFTER_TRUE_CONDITIONAL = `scene start
  First.
  if true then
    Shown.
  end
end
scene other
  Other.
end
`;

const AFTER_CONDITIONAL_AT_END = `scene start
  First.
  if false then
    Skipped.
  end
end
`;

const AFTER_THREAD = `scene start
  First.
  <- side
end
scene side
  Side one.
  Side two.
  done
end
scene other
  Other.
end
`;

describe("PLAY and the preview at the end of a flow that runs off its end", () => {
  it.each([
    ["a scene's end past a conditional that shows nothing", AFTER_CONDITIONAL, 5, "First.", ["Skipped.", "Other."]],
    ["a branch's end past a conditional that shows nothing", BRANCH_AFTER_CONDITIONAL, 9, "First.", ["Skipped.", "Other."]],
    ["a scene's end past a conditional that shows its beat", AFTER_TRUE_CONDITIONAL, 5, "Shown.", ["Other."]],
    ["a scene's end at the end of the script, past a conditional", AFTER_CONDITIONAL_AT_END, 5, "First.", ["Skipped."]],
    ["a scene's end past a thread", AFTER_THREAD, 3, "Side two.", ["Other."]],
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
