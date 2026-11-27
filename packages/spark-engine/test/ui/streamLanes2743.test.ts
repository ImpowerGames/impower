import { describe, expect, test } from "vitest";
import { EventMessage } from "../../src/game/core/classes/messages/EventMessage";
import { createHarness, flushMicrotasks, MAIN_URI } from "./harness/uiTestHarness";

type Harness = ReturnType<typeof createHarness>;
const c = (h: Harness): any => (h.game as any)._coordinator;
const shown = (h: Harness): string => Object.entries(c(h)?._instructions?.text ?? {})
  .filter(([target]) => ["dialogue", "action", "note"].includes(target))
  .flatMap(([, events]: [string, any]) => events.map((event: any) => event.text)).join("");
const state = (h: Harness, name: string): [number, number] => [
  h.game.module.ui.streams.entries(name).length,
  (h.game.module.ui as any)._state.streams?.[`${name}/0`]?.reserved ?? 0,
];
async function tick(h: Harness, ms = 200) {
  c(h)?.onUpdate({ deltaMS: ms });
  await flushMicrotasks(5);
}
async function press(h: Harness) {
  c(h)?.onMessage(EventMessage.type.notification({ type: "pointerdown", button: 0 } as never));
  await tick(h, 0);
}
async function until(h: Harness, line: string) {
  for (let i = 0; i < 100 && shown(h) !== line; i += 1) await tick(h);
  expect(shown(h)).toBe(line);
}
async function finish(h: Harness) {
  for (let i = 0; i < 100 && !c(h)?._finishedExecution; i += 1) await tick(h);
  expect(c(h)?._finishedExecution).toBe(true);
}
async function play(source: string) {
  const h = createHarness(source, 0, { autoOpenAll: false });
  await h.ready;
  expect(h.errors).toEqual([]);
  h.game.context.system.previewing = undefined;
  h.game.start();
  await flushMicrotasks(10);
  for (let i = 0; i < 10 && !shown(h); i += 1) await tick(h, 0);
  return h;
}
const actor = `define RAFFLES as character with
  name = "RAFFLES"
end
`;
const layout = (name: string, templates = "dialogue { text }") => `layout ${name} {
  thread { stream { ${templates} } }
}
`;
const settings = (name: string) => `stream ${name} { advance = auto; pause = 0.6s }
`;
const both = `${actor}${layout("phone")}${layout("log")}${settings("phone")}${settings("log")}
scene start
  [[open phone]]
  [[open log]]
  RAFFLES: one
  RAFFLES: two
  RAFFLES: three >
  RAFFLES: four
  RAFFLES: five >
end
`;

describe("every open layout that receives a run gathers it by its own rules (I-2743)", () => {
  test("two equal lanes reserve and persist through save, repeat and step back", async () => {
    const h = await play(both);
    expect([state(h, "phone"), state(h, "log")]).toEqual([[3, 2], [3, 2]]);
    await until(h, "three");
    await finish(h);
    const saved = h.game.saveHere();
    expect(saved).not.toBeNull();
    const loaded = createHarness(both, 0, { autoOpenAll: false });
    await loaded.ready;
    loaded.game.context.system.previewing = undefined;
    expect(loaded.game.loadToResume(saved!.data)).toBe(true);
    loaded.game.start();
    await flushMicrotasks(10);
    expect(shown(loaded)).toBe("three");
    expect([state(loaded, "phone"), state(loaded, "log")]).toEqual([[3, 0], [3, 0]]);
    await finish(loaded);
    await press(loaded);
    expect(shown(loaded)).toBe("four");
    expect([state(loaded, "phone"), state(loaded, "log")]).toEqual([[5, 1], [5, 1]]);
    expect((await loaded.game.rollBack("beat")).moved).toBe(true);
    await flushMicrotasks(10);
    expect(shown(loaded)).toBe("three");
    expect([state(loaded, "phone"), state(loaded, "log")]).toEqual([[3, 0], [3, 0]]);
  });

  test("preview reserves both lanes", async () => {
    const at = both.split("\n").findIndex((line) => line.includes("RAFFLES: two"));
    const h = createHarness(both, at, { autoOpenAll: false, connect: false });
    h.game.setStartFrom({ file: MAIN_URI, line: at });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
    await h.reconnect();
    await flushMicrotasks(10);
    await h.preview(at);
    await flushMicrotasks(30);
    expect([state(h, "phone"), state(h, "log")]).toEqual([[3, 1], [3, 1]]);
  });

  test("a non-gathering stream layout named constructor displays normally", async () => {
    const source = `${actor}${layout("constructor")}
scene start
  [[open constructor]]
  RAFFLES: hello
end
`;
    const h = await play(source);
    expect(shown(h)).toBe("hello");
    expect(state(h, "constructor")).toEqual([1, 0]);
  });

  test("a shorter lane stops reservations when its layout is cleared, and its run waits before the clear", async () => {
    const source = `${actor}${layout("phone")}${layout("log")}${settings("phone")}${settings("log")}
scene start
  [[open phone]]
  [[open log]]
  RAFFLES: one
  [[clear log]]
  RAFFLES: two
  RAFFLES: three >
end
`;
    const h = await play(source);
    expect([state(h, "phone"), state(h, "log")]).toEqual([[3, 2], [1, 0]]);
    expect(c(h)._instructions.auto).toBeUndefined();
    await finish(h);
    await press(h);
    expect(shown(h)).toBe("two");
    expect([state(h, "phone"), state(h, "log")]).toEqual([[3, 1], [2, 1]]);
  });

  test("an auto-opened lane keeps its room across a manual primary's wait", async () => {
    const source = `${actor}${layout("note", "note { text }; dialogue { text }")}${layout("phone")}${settings("phone")}
scene start
  [[open phone]]
  @note: one
  RAFFLES: two
  RAFFLES: three >
  RAFFLES: four
  The end.
end
`;
    const h = await play(source);
    expect(state(h, "note")).toEqual([4, 3]);
    await finish(h);
    await press(h);
    expect(shown(h)).toBe("two");
    expect(state(h, "note")).toEqual([4, 2]);
  });

  test("a secondary auto-opened layout does not reset its count at a manual layout's wait", async () => {
    const source = `${actor}${layout("note", "note { text }; dialogue { text }")}${layout("phone")}${settings("phone")}${settings("note")}
scene start
  [[open phone]]
  @note: l1
${Array.from({ length: 98 }, (_, i) => `  RAFFLES: l${i + 2}${i === 97 ? " >" : ""}`).join("\n")}
  [[close phone]]
  @note: l100
  @note: l101
  The end.
end
`;
    const h = await play(source);
    expect(shown(h)).toBe("l1");
    expect(state(h, "note")).toEqual([100, 99]);
    await press(h);
    expect(shown(h)).toBe("l99");
    await finish(h);
    await press(h);
    expect(shown(h)).toBe("l100");
    expect(c(h)._instructions.auto).toBeUndefined();
    expect(state(h, "note")).toEqual([100, 0]);
  });
});
