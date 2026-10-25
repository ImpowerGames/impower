// PLAY from a line that ends or redirects the story inside a scene (I-1606).
// A line whose run displays nothing before the story ends starts PLAY as the
// story stands when it reaches the line: on the last beat the run there
// displayed, waiting. A branch that only a divert from outside its scene
// enters is reached by a route from the story's start, with the arguments
// that divert passes.
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle, writtenText } from "./playerHarness";

const DONE = `scene start(x)
  Hello.
  done
end
`;

const FIN = `scene start(x)
  Hello.
  fin
end
`;

const FIN_TOP = `Hello.
fin
`;

// The beat above the `done` in the text is one the run skips.
const SKIPPED = `scene start
  Shown.
  if false then
    Skipped.
  end
  done
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
 *  what the run showed and how the game stood afterwards. */
const playFrom = async (source: string, line: number) => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: source }],
    startFrom: { file: MAIN_URI, line },
    manualClock: true,
  });
  // A run that ends stops the game, which waits a frame this page does not
  // draw.
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

describe("PLAY from a line that ends the story inside a scene", () => {
  it.each([
    // The control: the line that holds the beat.
    ["the scene's first line", DONE, 1, "Hello."],
    ["a done", DONE, 2, "Hello."],
    ["the closing end after a done", DONE, 3, "Hello."],
    ["a fin", FIN, 2, "Hello."],
    ["a top-level fin", FIN_TOP, 1, "Hello."],
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

describe("PLAY inside a branch only a divert from outside its scene enters", () => {
  it.each([
    // The control: the branch's first line, whose argument the route from
    // the story's start binds.
    ["the branch's first line", 3, "Inner 1."],
    ["a tunnel divert", 4, "Visit 2 t."],
    ["a tunnel return", 11, "Aside 3."],
    ["a done after a tunnel's onward divert", 29, "Last 5."],
    // No run reaches it: PLAY jumps to the line above whose jumped run shows
    // a beat.
    ["a done no run reaches", 21, "Never shown."],
  ])("from %s, runs with the divert's arguments", async (_name, line, shown) => {
    const outcome = await playFrom(BRANCHES, line);
    expect(outcome.started).toBe(true);
    expect(outcome.exited).toEqual([]);
    expect(outcome.state).toBe("running");
    expect(outcome.text).toContain(shown);
  }, 120_000);
});
