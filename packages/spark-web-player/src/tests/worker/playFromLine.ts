import { createPlayerHarness, MAIN_URI, settle, writtenText } from "./playerHarness";

export const BRANCHES = `scene start
  -> outer.inner(1)
end
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

export const playFrom = async (source: string, line: number) => {
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
    const score = h
      .playing()
      ?.programStory.variablesState.GetVariableWithName("score") as {
      value?: unknown;
    } | null;
    const outcome = {
      started,
      state: h.playing()?.state,
      exited: h.toEditor
        .filter((m) => m.method === "game/exited")
        .map((m) => m.params?.reason),
      ended: h.toEditor
        .filter((m) => m.method === "game/ended")
        .map((m) => m.params?.kind),
      text: writtenText(h.toRouter.slice(sentBefore)),
      score: score?.value,
    };
    await h.controller.destroyGameAndApp();
    return outcome;
  } finally {
    h.dispose();
  }
};

export const previewAt = async (source: string, line: number) => {
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
