import { describe, expect, test } from "vitest";
import { EventMessage } from "../../src/game/core/classes/messages/EventMessage";
import { createHarness, flushMicrotasks, MAIN_URI } from "./harness/uiTestHarness";

type Harness = ReturnType<typeof createHarness>;
type Step = { line: string; waits: boolean; pause?: number; layouts: Record<string, [number, number]> };

const c = (h: Harness): any => (h.game as any)._coordinator;
const shown = (h: Harness): string => Object.entries(c(h)?._instructions?.text ?? {})
  .filter(([target]) => ["dialogue", "action", "note"].includes(target))
  .flatMap(([, events]: [string, any]) => events.map((event: any) => event.text)).join("");
const state = (h: Harness, name: string): [number, number] => [
  h.game.module.ui.streams.entries(name).length,
  (h.game.module.ui as any)._state.streams?.[`${name}/0`]?.reserved ?? 0,
];
const positions = (h: Harness, names: string[]): number[] =>
  names.map((name) => h.game.module.ui.streams.runLines(name));
async function tick(h: Harness, ms = 200) {
  c(h)?.onUpdate({ deltaMS: ms });
  await flushMicrotasks(5);
}
async function press(h: Harness) {
  c(h)?.onMessage(EventMessage.type.notification({ type: "pointerdown", button: 0 } as never));
  await tick(h, 0);
}
async function finish(h: Harness) {
  for (let i = 0; i < 100 && !c(h)?._finishedExecution; i += 1) await tick(h);
}
async function start(source: string) {
  const h = createHarness(source, 0, { autoOpenAll: false });
  await h.ready;
  expect(h.errors).toEqual([]);
  h.game.context.system.previewing = undefined;
  h.game.start();
  await flushMicrotasks(10);
  for (let i = 0; i < 10 && !shown(h); i += 1) await tick(h, 0);
  return h;
}
function step(h: Harness, names: string[]): Step {
  const instructions = c(h)._instructions;
  return {
    line: shown(h),
    waits: !instructions.auto,
    ...(instructions.pause !== undefined ? { pause: instructions.pause } : {}),
    layouts: Object.fromEntries(names.map((name) => [name, state(h, name)])),
  };
}
async function walk(h: Harness, names: string[], last: string): Promise<Step[]> {
  const steps: Step[] = [];
  for (let guard = 0; guard < 400; guard += 1) {
    const current = step(h, names);
    steps.push(current);
    if (current.line === last) {
      return steps;
    }
    await finish(h);
    if (current.waits) {
      await press(h);
    }
    for (let i = 0; i < 100 && shown(h) === current.line; i += 1) await tick(h);
  }
  return steps;
}
const actor = `define RAFFLES as character with
  name = "RAFFLES"
end
`;
const layout = (name: string, templates = "dialogue { text }") => `layout ${name} {
  thread { stream { ${templates} } }
}
`;
const settings = (name: string, pause = "0.6s", advance = "auto") =>
  `stream ${name} { advance = ${advance}; pause = ${pause} }
`;
const lines = (from: number, to: number, last = "") =>
  Array.from({ length: to - from + 1 }, (_, i) =>
    `  RAFFLES: l${from + i}${from + i === to ? last : ""}`).join("\n");

describe("lanes of one run that differ in their settings and lifetimes (I-2743)", () => {
  test("a layout set to advance and one set to wait: every line waits, and only the advancing layout reserves", async () => {
    const h = await start(`${actor}${layout("phone")}${layout("log")}${settings("phone")}
scene start
  [[open phone]]
  [[open log]]
  RAFFLES: one
  RAFFLES: two
  RAFFLES: three >
end
`);
    expect(await walk(h, ["phone", "log"], "three")).toEqual([
      { line: "one", waits: true, layouts: { phone: [3, 2], log: [1, 0] } },
      { line: "two", waits: true, layouts: { phone: [3, 1], log: [2, 0] } },
      { line: "three", waits: true, layouts: { phone: [3, 0], log: [3, 0] } },
    ]);
  });

  test("two advancing layouts with different pauses take the longer pause", async () => {
    const h = await start(`${actor}${layout("phone")}${layout("log")}${settings("phone")}${settings("log", "1.2s")}
scene start
  [[open phone]]
  [[open log]]
  RAFFLES: one
  RAFFLES: two
  RAFFLES: three >
end
`);
    expect(await walk(h, ["phone", "log"], "three")).toEqual([
      { line: "one", waits: false, pause: 1.2, layouts: { phone: [3, 2], log: [3, 2] } },
      { line: "two", waits: false, pause: 1.2, layouts: { phone: [3, 1], log: [3, 1] } },
      { line: "three", waits: true, layouts: { phone: [3, 0], log: [3, 0] } },
    ]);
  });

  test("one layout reaching its hundredth line before the other: the line waits there and only that layout starts a new run", async () => {
    const h = await start(`${actor}${layout("phone")}${layout("log")}${settings("phone")}${settings("log")}
scene start
  [[open phone]]
${lines(1, 97)}
  [[open log]]
${lines(98, 105, " >")}
end
`);
    const steps = await walk(h, ["phone", "log"], "l105");
    expect(steps.filter((s) => s.waits).map((s) => s.line)).toEqual(["l100", "l105"]);
    const at = (line: string) => steps.find((s) => s.line === line)?.layouts;
    expect(at("l97")).toEqual({ phone: [100, 3], log: [0, 0] });
    expect(at("l98")).toEqual({ phone: [100, 2], log: [8, 7] });
    expect(at("l100")).toEqual({ phone: [100, 0], log: [8, 5] });
    expect(at("l101")).toEqual({ phone: [105, 4], log: [8, 4] });
    expect(at("l105")).toEqual({ phone: [105, 0], log: [8, 0] });
    expect(positions(h, ["phone", "log"])).toEqual([0, 0]);
  });

  test("one layout cleared and another closed in the middle of a run", async () => {
    const h = await start(`${actor}${layout("phone")}${layout("log")}${settings("phone")}${settings("log")}
scene start
  [[open phone]]
  [[open log]]
  RAFFLES: one
  RAFFLES: two
  [[clear phone]]
  RAFFLES: three
  RAFFLES: four
  [[close log]]
  RAFFLES: five
  RAFFLES: six >
end
`);
    expect(await walk(h, ["phone", "log"], "six")).toEqual([
      { line: "one", waits: false, pause: 0.6, layouts: { phone: [2, 1], log: [4, 3] } },
      { line: "two", waits: true, layouts: { phone: [2, 0], log: [4, 2] } },
      { line: "three", waits: false, pause: 0.6, layouts: { phone: [4, 3], log: [4, 1] } },
      { line: "four", waits: true, layouts: { phone: [4, 2], log: [4, 0] } },
      { line: "five", waits: false, pause: 0.6, layouts: { phone: [4, 1], log: [0, 0] } },
      { line: "six", waits: true, layouts: { phone: [4, 0], log: [0, 0] } },
    ]);
  });

  test("a layout that opened by itself beside one the script opened", async () => {
    const h = await start(`${actor}${layout("note", "note { text }; dialogue { text }")}${layout("phone")}${settings("phone")}${settings("note", "1s")}
scene start
  [[open phone]]
  @note: one
  RAFFLES: two
  RAFFLES: three >
  RAFFLES: four
  The end.
end
`);
    expect(await walk(h, ["note", "phone"], "The end.")).toEqual([
      { line: "one", waits: false, pause: 1, layouts: { note: [4, 3], phone: [0, 0] } },
      { line: "two", waits: false, pause: 1, layouts: { note: [4, 2], phone: [2, 1] } },
      { line: "three", waits: true, layouts: { note: [4, 1], phone: [2, 0] } },
      { line: "four", waits: true, layouts: { note: [4, 0], phone: [3, 0] } },
      { line: "The end.", waits: true, layouts: { note: [0, 0], phone: [3, 0] } },
    ]);
  });

  test("three layouts at once", async () => {
    const h = await start(`${actor}${layout("phone")}${layout("log")}${layout("chat")}${settings("phone")}${settings("log")}${settings("chat", "1s")}
scene start
  [[open phone]]
  [[open log]]
  [[open chat]]
  RAFFLES: one
  RAFFLES: two
  [[close chat]]
  RAFFLES: three
  RAFFLES: four >
end
`);
    expect(await walk(h, ["phone", "log", "chat"], "four")).toEqual([
      { line: "one", waits: false, pause: 1, layouts: { phone: [4, 3], log: [4, 3], chat: [2, 1] } },
      { line: "two", waits: true, layouts: { phone: [4, 2], log: [4, 2], chat: [2, 0] } },
      { line: "three", waits: false, pause: 0.6, layouts: { phone: [4, 1], log: [4, 1], chat: [0, 0] } },
      { line: "four", waits: true, layouts: { phone: [4, 0], log: [4, 0], chat: [0, 0] } },
    ]);
  });
});

const MIXED = `${actor}${layout("note", "note { text }; dialogue { text }")}${layout("phone")}${settings("phone")}${settings("note")}
scene start
  [[open phone]]
  @note: one
  RAFFLES: two
  RAFFLES: three >
  RAFFLES: four
  RAFFLES: five >
  The end.
end
`;

describe("two lanes in the middle of a run through save, step back and preview (I-2743)", () => {
  test("a save at one lane's wait, in the other lane's run, loads each lane's position", async () => {
    const h = await start(MIXED);
    await walk(h, ["note", "phone"], "three");
    await finish(h);
    expect(positions(h, ["note", "phone"])).toEqual([3, 0]);
    const saved = h.game.saveHere();
    expect(saved).not.toBeNull();
    const loaded = createHarness(MIXED, 0, { autoOpenAll: false });
    await loaded.ready;
    loaded.game.context.system.previewing = undefined;
    expect(loaded.game.loadToResume(saved!.data)).toBe(true);
    loaded.game.start();
    await flushMicrotasks(10);
    expect(shown(loaded)).toBe("three");
    expect(positions(loaded, ["note", "phone"])).toEqual([3, 0]);
    expect([state(loaded, "note"), state(loaded, "phone")]).toEqual([[5, 2], [2, 0]]);
    await finish(loaded);
    await press(loaded);
    expect(shown(loaded)).toBe("four");
    expect(positions(loaded, ["note", "phone"])).toEqual([4, 1]);
    expect([state(loaded, "note"), state(loaded, "phone")]).toEqual([[5, 1], [4, 1]]);
  });

  test("a step back from the second run returns to the wait with each lane's position", async () => {
    const h = await start(MIXED);
    await walk(h, ["note", "phone"], "five");
    expect(positions(h, ["note", "phone"])).toEqual([5, 0]);
    expect((await h.game.rollBack("beat")).moved).toBe(true);
    await flushMicrotasks(10);
    expect(shown(h)).toBe("three");
    expect(positions(h, ["note", "phone"])).toEqual([3, 0]);
    expect([state(h, "note"), state(h, "phone")]).toEqual([[5, 2], [2, 0]]);
  });

  test.each([
    ["two", [2, 1], [[5, 3], [2, 1]]],
    ["four", [4, 1], [[5, 1], [4, 1]]],
  ] as const)("the preview of %s shows each lane's position and room", async (line, expected, room) => {
    const at = MIXED.split("\n").findIndex((text) => text.trim().startsWith(`RAFFLES: ${line}`));
    const h = createHarness(MIXED, at, { autoOpenAll: false, connect: false });
    h.game.setStartFrom({ file: MAIN_URI, line: at });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
    await h.reconnect();
    await flushMicrotasks(10);
    await h.preview(at);
    await flushMicrotasks(30);
    expect(positions(h, ["note", "phone"])).toEqual(expected);
    expect([state(h, "note"), state(h, "phone")]).toEqual(room);
  });
});

describe("layouts and streams named after Object.prototype properties (I-2743)", () => {
  test.each(["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"])("a layout named %s keeps its own settings and run", async (name) => {
    const h = await start(`${actor}${layout(name)}${settings(name)}
scene start
  [[open ${name}]]
  RAFFLES: one
  RAFFLES: two >
end
`);
    expect(positions(h, [name])).toEqual([1]);
    expect(Object.keys((h.game.module.ui as any)._state.streamRuns)).toEqual([name]);
    expect(await walk(h, [name], "two")).toEqual([
      { line: "one", waits: false, pause: 0.6, layouts: { [name]: [2, 1] } },
      { line: "two", waits: true, layouts: { [name]: [2, 0] } },
    ]);
  });

  test.each(["constructor", "toString", "__proto__"])("a click layout named %s beside an advancing one waits at every line", async (name) => {
    const h = await start(`${actor}${layout(name)}${layout("phone")}${settings("phone")}
scene start
  [[open phone]]
  [[open ${name}]]
  RAFFLES: one
  RAFFLES: two >
end
`);
    expect((await walk(h, ["phone", name], "two")).map((s) => s.waits)).toEqual([true, true]);
  });

  test.each(["constructor", "__proto__"])("a loop on a channel named %s, written on a skipped line, plays when a click finishes the run", async (channel) => {
    const h = await start(`${actor}define beep as audio with
  src = "https://example.com/beep.wav"
end
${layout("phone")}${settings("phone")}
scene start
  [[open phone]]
  RAFFLES: one
  ((play ${channel} beep loop))
  RAFFLES: two
  RAFFLES: three >
end
`);
    expect(shown(h)).toBe("one");
    await press(h);
    h.releaseAssets();
    for (let i = 0; i < 5; i += 1) await tick(h, 0);
    expect(shown(h)).toBe("three");
    expect(c(h)._finishedExecution).toBe(true);
    expect([...h.game.module.audio.loopsPlaying()].map(([name, sounds]) => [name, [...sounds.keys()]]))
      .toEqual([[channel, ["audio.beep"]]]);
  });
});
