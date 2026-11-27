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

const wire = (messages: any[]): any[] =>
  messages.flatMap((m: any) =>
    (m?.method === "ui/batch" || m?.method === "ui/beat") &&
    Array.isArray(m.params?.messages)
      ? wire(m.params.messages)
      : [m],
  );

const sent = (h: ReturnType<typeof createHarness>, method: string): any[] =>
  wire(h.messages).filter((m: any) => m?.method === method);

const animateCalls = (h: ReturnType<typeof createHarness>): any[] =>
  sent(h, "ui/animate").filter((m: any) => m.params?.effects?.length);

const played = (call: any): { name: string; duration: string; delay: string }[] =>
  call.params.effects[0].animations.map((a: any) => ({
    name: a.$name,
    duration: a.timing?.duration,
    delay: a.timing?.delay,
  }));

const drive = async (h: ReturnType<typeof createHarness>, instant = false) => {
  const beat = h.nextBeat();
  if (beat) {
    await h.display(beat, instant);
    await flushMicrotasks();
  }
  return beat;
};

describe("several `with` clauses on open, close and navigate lines", () => {
  test("open plays fadein and shake together; close plays fadeout and shake, then removes", async () => {
    const h = createHarness(
      `${MAIN}layout inventory {
  text "Bag"
}

scene start
  [[open inventory with fade over 0.3s with shake over 0.5s]]
  Hello.
  [[close inventory with fade over 0.2s with shake over 0.4s]]
  Bye.
end
`,
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpToFlow("start");
    const ui: any = h.game.module.ui;
    h.reset();
    await drive(h);
    const opened = animateCalls(h);
    expect(opened).toHaveLength(1);
    expect(played(opened[0])).toEqual([
      expect.objectContaining({ name: "fadein", duration: "0.3s" }),
      expect.objectContaining({ name: "shake", duration: "0.5s" }),
    ]);
    await drive(h, true);
    h.reset();
    await drive(h);
    const closed = animateCalls(h);
    expect(closed).toHaveLength(1);
    expect(played(closed[0])).toEqual([
      expect.objectContaining({ name: "fadeout", duration: "0.2s" }),
      expect.objectContaining({ name: "shake", duration: "0.4s" }),
    ]);
    const order = wire(h.messages).map((m: any) => m?.method);
    expect(order.indexOf("ui/animate")).toBeGreaterThanOrEqual(0);
    expect(order.lastIndexOf("ui/destroy")).toBeGreaterThan(order.indexOf("ui/animate"));
    expect(ui._mountedLayouts.has("inventory")).toBe(false);
  });

  test("navigate plays every entry on the layout that enters and the one that leaves", async () => {
    const h = createHarness(
      `${MAIN}screen menu {
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
  [[navigate menu to settings with fade over 0.3s with shake over 0.5s]]
  Bye.
end
`,
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpToFlow("start");
    await drive(h, true);
    await drive(h, true);
    h.reset();
    await drive(h);
    const calls = animateCalls(h);
    const names = calls.map((c) => played(c).map((a) => a.name));
    expect(names).toContainEqual(["fadein", "shake"]);
    expect(names).toContainEqual(["fadeout", "shake"]);
  });

  test("wait holds for the longest entry's after plus length", async () => {
    const h = createHarness(
      `${MAIN}layout inventory {
  text "Bag"
}

scene start
  [[open inventory with fade over 0.3s with shake over 0.5s after 0.4s wait]]
end
`,
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpToFlow("start");
    const beat = h.nextBeat();
    expect(beat!.end).toBeCloseTo(0.9);
  });

  test("one `with` plays the same single animation and timing as before", async () => {
    const h = createHarness(
      `${MAIN}screen menu {
}
layout pause in menu {
  text "Paused"
}
layout settings in menu {
  text "Settings"
}

scene start
  [[open pause with fade over 0.3s after 0.1s]]
  Hello.
  [[navigate menu to settings with fade over 0.4s]]
  Bye.
  [[close settings with fade over 0.2s]]
  End.
end
`,
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpToFlow("start");
    h.reset();
    await drive(h);
    expect(animateCalls(h).map(played)).toEqual([
      [expect.objectContaining({ name: "fadein", duration: "0.3s", delay: "0.1s" })],
    ]);
    await drive(h, true);
    h.reset();
    await drive(h);
    const nav = animateCalls(h).map(played);
    expect(nav).toHaveLength(2);
    expect(nav).toContainEqual([expect.objectContaining({ name: "fadein", duration: "0.4s" })]);
    expect(nav).toContainEqual([expect.objectContaining({ name: "fadeout", duration: "0.4s" })]);
    await drive(h, true);
    h.reset();
    await drive(h);
    expect(animateCalls(h).map(played)).toEqual([
      [expect.objectContaining({ name: "fadeout", duration: "0.2s" })],
    ]);
  });

  test("a style with @show and @hide plays only the line's `with` clauses", async () => {
    const h = createHarness(
      `${MAIN}style bag {
  opacity = 1
  @initial { opacity = 0 }
  @show { transition-duration = 280ms }
  @hide { opacity = 0 }
}
layout inventory {
  bag {
    text "Bag"
  }
}

scene start
  [[open inventory with fade over 0.3s with shake over 0.5s]]
  Hello.
  [[close inventory with fade over 0.2s with shake over 0.4s]]
  Bye.
end
`,
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpToFlow("start");
    const ui: any = h.game.module.ui;
    ui.setMotion(true);
    expect(ui.moving()).toBe(true);
    expect(ui.styled("show")).toBe(true);
    expect(ui.styled("hide")).toBe(true);
    h.reset();
    await drive(h);
    expect(animateCalls(h).map(played)).toEqual([
      [
        expect.objectContaining({ name: "fadein" }),
        expect.objectContaining({ name: "shake" }),
      ],
    ]);
    expect(sent(h, "ui/presence")).toEqual([]);
    await drive(h, true);
    h.reset();
    await drive(h);
    expect(animateCalls(h).map(played)).toEqual([
      [
        expect.objectContaining({ name: "fadeout" }),
        expect.objectContaining({ name: "shake" }),
      ],
    ]);
    expect(sent(h, "ui/presence")).toEqual([]);
  });
});
