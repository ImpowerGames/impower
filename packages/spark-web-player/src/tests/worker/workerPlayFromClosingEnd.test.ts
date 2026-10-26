// PLAY and the preview at the `end` that closes a scene or branch with more
// script below it (I-1618). The `end` belongs to the flow it closes, so the
// game starts on the beat on screen when that flow finishes, not on the first
// beat of the flow below it.
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle, writtenText } from "./playerHarness";

const SCENES = `scene start
  First.
  done
end
scene other
  Other.
end
`;

const BRANCHES = `-> outer.inner(1)
scene outer
  branch inner(a)
    Inner {a}.
    -> outer.visit(a + 1, "t") ->
    <- outer.aside(a + 2)
    -> outer.second(a + 3,
      "b")
  end
  branch visit(n, s)
    Visit {n} {s}.
    ->->
  end
  branch aside(m)
    Aside {m}.
    done
  end
  branch second(n, s)
    Second {n} {s}.
    -> outer.leave(n) ->
    Never shown.
    done
  end
  branch leave(k)
    Leave {k}.
    ->-> outer.last(k + 1)
  end
  branch last(z)
    Last {z}.
    done
  end
end
`;

/** PLAY `source` from `line` (zero-based) and a second of frames; answers
 *  what the run wrote after it started and how the game stood. */
const playFrom = async (source: string, line: number) => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: source }],
    startFrom: { file: MAIN_URI, line },
    manualClock: true,
  });
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  try {
    await h.compile();
    await h.select(line);
    await settle(40);
    const sentBefore = h.toRouter.length;
    const started = await h.controller.startGameAndApp();
    await settle(40);
    await h.tick(1000 / 60, 60);
    const outcome = {
      started,
      state: h.playing()?.state,
      exited: h.toEditor
        .filter((m) => m.method === "game/exited")
        .map((m) => m.params?.reason),
      text: writtenText(h.toRouter.slice(sentBefore)),
    };
    await h.controller.destroyGameAndApp();
    return outcome;
  } finally {
    h.dispose();
  }
};

/** The text the first preview of `source` at `line` (zero-based) writes. */
const previewAt = async (source: string, line: number) => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: source }],
    startFrom: { file: MAIN_URI, line },
  });
  try {
    await h.compile();
    await h.select(line);
    await settle(40);
    return writtenText(h.toRouter);
  } finally {
    h.dispose();
  }
};

const CASES = [
  // The flow below shows "Other.".
  ["a scene's end", SCENES, 3, "First.", "Other."],
  // The line above is the divert the branch leaves by, which shows the beat
  // it leads to; the branch below shows "Visit 2 t.".
  ["the end of a branch that diverts out", BRANCHES, 8, "Second 4 b.", "Visit"],
  // No run reaches the `done` above, whose jumped run shows "Never shown.";
  // the branch below shows "Leave 4.".
  ["the end of a branch below a done no run reaches", BRANCHES, 22, "Never shown.", "Leave"],
] as const;

describe("PLAY from the end that closes a flow with more script below", () => {
  it.each(CASES)(
    "from %s, waits on the beat its own flow left on screen",
    async (_name, source, line, shown, below) => {
      const outcome = await playFrom(source, line);
      expect(outcome.started).toBe(true);
      expect(outcome.exited).toEqual([]);
      expect(outcome.state).toBe("running");
      expect(outcome.text).toContain(shown);
      expect(outcome.text).not.toContain(below);
    },
    120_000,
  );
});

describe("the preview at the end that closes a flow with more script below", () => {
  it.each(CASES)(
    "at %s, shows the beat its own flow left on screen",
    async (_name, source, line, shown, below) => {
      const text = await previewAt(source, line);
      expect(text).toContain(shown);
      expect(text).not.toContain(below);
    },
    120_000,
  );
});
