import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const MAIN = `layout main {
  textbox {
    dialogue #clear {
      text
    }
  }
}
`;

const STYLED = `style bag {
  opacity = 1
  @initial { opacity = 0 }
  @show { transition-duration = 280ms }
  @hide { opacity = 0 }
}
`;

const wire = (messages: any[]): any[] =>
  messages.flatMap((m: any) =>
    (m?.method === "ui/batch" || m?.method === "ui/beat") && Array.isArray(m.params?.messages)
      ? wire(m.params.messages)
      : [m],
  );

const sent = (h: ReturnType<typeof createHarness>, method: string): any[] =>
  wire(h.messages).filter((m: any) => m?.method === method);

const played = (h: ReturnType<typeof createHarness>): { name: string; duration: string }[][] =>
  sent(h, "ui/animate")
    .filter((m: any) => m.params?.effects?.length)
    .map((m: any) =>
      m.params.effects[0].animations.map((a: any) => ({ name: a.$name, duration: a.timing?.duration })),
    );

const presences = (h: ReturnType<typeof createHarness>): string[] =>
  sent(h, "ui/presence").flatMap((m: any) => (m.params?.effects ?? []).map((e: any) => e.presence));

const drive = async (h: ReturnType<typeof createHarness>, instant = false) => {
  const beat = h.nextBeat();
  if (beat) {
    await h.display(beat, instant);
    await flushMicrotasks();
  }
  return beat;
};

const start = async (source: string, motion = false) => {
  const h = createHarness(source, 0, { reactive: true, autoOpenAll: false });
  await h.ready;
  h.jumpToFlow("start");
  const ui: any = h.game.module.ui;
  if (motion) {
    ui.setMotion(true);
    expect(ui.moving()).toBe(true);
  }
  return { h, ui };
};

describe("`using` on `open`, `close` and `navigate` (I-2885)", () => {
  test("`using` plays the transition timed by the line, and each `with` beside it", async () => {
    const { h, ui } = await start(`${MAIN}layout inventory {
  text "Bag"
}

scene start
  [[open inventory using fade over 0.3s with shake over 0.5s]]
  Hello.
  [[close inventory using fade]]
  Bye.
end
`);
    h.reset();
    await drive(h);
    expect(played(h)).toEqual([
      [
        { name: "fadein", duration: "0.3s" },
        { name: "shake", duration: "0.5s" },
      ],
    ]);
    await drive(h, true);
    h.reset();
    await drive(h);
    expect(played(h)).toEqual([[{ name: "fadeout", duration: "0.5s" }]]);
    expect(ui._mountedLayouts.has("inventory")).toBe(false);
  });

  test("a layout with no presence styles shows and hides by the built-in `show` and `hide` beside a `with`", async () => {
    const { h } = await start(`${MAIN}layout inventory {
  text "Bag"
}

scene start
  [[open inventory with shake]]
  Hello.
  [[close inventory with shake]]
  Bye.
end
`);
    h.reset();
    await drive(h);
    expect(played(h).map((list) => list.map((a) => a.name))).toEqual([["show", "shake"]]);
    await drive(h, true);
    h.reset();
    await drive(h);
    expect(played(h).map((list) => list.map((a) => a.name))).toEqual([["hide", "shake"]]);
  });

  test("on a styled layout a `with` plays beside the styled arrival and departure", async () => {
    const { h, ui } = await start(
      `${MAIN}${STYLED}layout panel {
  bag {
    text "Bag"
  }
}

scene start
  [[open panel with shake]]
  Hello.
  [[close panel with shake]]
  Bye.
end
`,
      true,
    );
    h.reset();
    await drive(h);
    expect(presences(h)).toEqual(["show"]);
    expect(played(h)).toEqual([[{ name: "shake", duration: "300ms" }]]);
    await drive(h, true);
    h.reset();
    await drive(h);
    expect(presences(h)).toEqual(["hide"]);
    expect(played(h)).toEqual([[{ name: "shake", duration: "300ms" }]]);
    expect(ui._mountedLayouts.has("panel")).toBe(false);
    expect(ui._retiring.size).toBe(0);
  });

  test("on a styled layout `using` takes the place of the styled arrival and departure", async () => {
    const { h } = await start(
      `${MAIN}${STYLED}layout panel {
  bag {
    text "Bag"
  }
}

scene start
  [[open panel using fade]]
  Hello.
  [[close panel using fade]]
  Bye.
end
`,
      true,
    );
    h.reset();
    await drive(h);
    expect(presences(h)).toEqual([]);
    expect(played(h).map((list) => list.map((a) => a.name))).toEqual([["fadein"]]);
    await drive(h, true);
    h.reset();
    await drive(h);
    expect(presences(h)).toEqual([]);
    expect(played(h).map((list) => list.map((a) => a.name))).toEqual([["fadeout"]]);
  });

  test("`navigate … using fade` gives the leaving layout `fadeout` and the arriving layout `fadein`", async () => {
    const { h } = await start(`${MAIN}screen menu {
}
layout pause in menu {
  text "Paused"
}
layout settings in menu {
  text "Settings"
}

scene start
  [[open pause]]
  Hello.
  [[navigate menu to settings using fade]]
  Bye.
end
`);
    await drive(h, true);
    await drive(h, true);
    h.reset();
    await drive(h);
    const names = played(h).map((list) => list.map((a) => a.name));
    expect(names).toHaveLength(2);
    expect(names).toContainEqual(["fadeout"]);
    expect(names).toContainEqual(["fadein"]);
  });

  test("`wait` holds for the `using` transition and every `with`", async () => {
    const { h } = await start(`${MAIN}layout inventory {
  text "Bag"
}

scene start
  [[open inventory using fade over 0.3s with shake over 0.5s after 0.4s wait]]
end
`);
    expect(h.nextBeat()!.end).toBeCloseTo(0.9);
    const later = await start(`${MAIN}layout inventory {
  text "Bag"
}

scene start
  [[open inventory using fade over 2s with shake wait]]
end
`);
    expect(later.h.nextBeat()!.end).toBeCloseTo(2);
  });

  test.each(["presence first", "animations first"])(
    "a styled layout that leaves with a `with` is removed only once its departure and its `with` have both ended (%s)",
    async (order) => {
      const h = createHarness(
        `${MAIN}${STYLED}layout panel {
  bag {
    text "Bag"
  }
}
`,
        0,
        { reactive: true, autoOpenAll: false, holdPresence: true, holdAnimations: true },
      );
      await h.ready;
      const ui: any = h.game.module.ui;
      ui.setMotion(true);
      await ui.openLayout("panel");
      await flushMicrotasks(10);
      h.releasePresence();
      h.releaseAnimations();
      await flushMicrotasks(30);
      const root = ui._mountedLayouts.get("panel").element.id;
      h.reset();
      await ui.closeLayout("panel", [{}, { with: "shake" }]);
      await flushMicrotasks(10);
      const destroyed = () => sent(h, "ui/destroy").filter((m: any) => m.params?.element === root);
      expect(presences(h)).toEqual(["hide"]);
      expect(played(h).map((list) => list.map((a) => a.name))).toEqual([["shake"]]);
      expect(destroyed()).toEqual([]);
      if (order === "presence first") {
        expect(h.releasePresence()).toBe(1);
      } else {
        expect(h.releaseAnimations()).toBe(1);
      }
      await flushMicrotasks(30);
      expect(destroyed()).toEqual([]);
      expect(ui._retiring.size).toBe(1);
      if (order === "presence first") {
        expect(h.releaseAnimations()).toBe(1);
      } else {
        expect(h.releasePresence()).toBe(1);
      }
      await flushMicrotasks(30);
      expect(destroyed()).toHaveLength(1);
      expect(ui._retiring.size).toBe(0);
    },
  );

  test.each([
    ["open", "[[open inventory using screenfade over 2s]]", "waitin"],
    ["close", "[[close inventory using screenfade over 2s]]", "waitout"],
  ])(
    "`%s … using screenfade over 2s` plays its half and its `screen` pulse, each stretched as on a picture line",
    async (verb, line, half) => {
      const { h } = await start(`layout main {
  textbox {
    dialogue #clear {
      text
    }
  }
  screen {
    animation
  }
}
layout inventory {
  text "Bag"
}

scene start
${verb === "close" ? "  [[open inventory]] Opened.\n" : ""}  ${line}
  Done.
end
`);
      if (verb === "close") {
        await drive(h, true);
      }
      h.reset();
      await drive(h);
      const calls = sent(h, "ui/animate").filter((m: any) => m.params?.effects?.length);
      const all = calls.flatMap((m: any) =>
        m.params.effects.flatMap((e: any) => e.animations.map((a: any) => ({ name: a.$name, duration: a.timing?.duration, arm: a.arm }))),
      );
      expect(all).toContainEqual({ name: half, duration: "1s", arm: undefined });
      expect(all).toContainEqual({ name: "blackpulse", duration: "2s", arm: "screen" });
    },
  );

  test("`wait` holds for the longest part of a `using` transition", async () => {
    const { h } = await start(`${MAIN}layout inventory {
  text "Bag"
}

scene start
  [[open inventory using screenfade over 2s wait]]
end
`);
    expect(h.nextBeat()!.end).toBeCloseTo(2);
    const declared = await start(`${MAIN}layout inventory {
  text "Bag"
}

scene start
  [[close inventory using screenfade wait]]
end
`);
    expect(declared.h.nextBeat()!.end).toBeCloseTo(1);
  });

  test("`wait` on a styled layout counts each `with`", async () => {
    const { h } = await start(`${MAIN}${STYLED}layout panel {
  bag {
    text "Bag"
  }
}

scene start
  [[open panel with shake over 1.5s wait]]
end
`);
    expect(h.nextBeat()!.end).toBeCloseTo(1.5);
  });
});
