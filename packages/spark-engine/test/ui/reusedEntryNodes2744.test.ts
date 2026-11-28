import { describe, expect, test } from "vitest";
import { EventMessage } from "../../src/game/core/classes/messages/EventMessage";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SOURCE = `define raffles as character with
  name = "RAFFLES"
end

layout phone {
  thread {
    stream {
      dialogue.bubble {
        text
        continue_indicator { text = ▼ }
      }
    }
  }
}

scene start
  [[open phone]]
  RAFFLES: one
  RAFFLES: two
  RAFFLES: three
  The street is empty.
end
`;

type Harness = ReturnType<typeof createHarness>;

const coordinator = (h: Harness): any => (h.game as any)._coordinator;

function wire(messages: any[]): any[] {
  return messages.flatMap((m: any) =>
    (m?.method === "ui/batch" || m?.method === "ui/beat") && Array.isArray(m.params?.messages)
      ? wire(m.params.messages)
      : [m],
  );
}

const lineText = (h: Harness): string =>
  (coordinator(h)?._instructions?.text?.["dialogue"] ?? []).map((e: any) => e.text).join("");

async function tick(h: Harness) {
  for (let i = 0; i < 10; i += 1) {
    coordinator(h)?.onUpdate({ deltaMS: 100 });
    await flushMicrotasks(5);
  }
}

async function clickTo(h: Harness, line: string) {
  for (let i = 0; i < 10 && lineText(h) !== line; i += 1) {
    await tick(h);
    coordinator(h)?.onMessage(
      EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
    );
    await tick(h);
  }
  expect(lineText(h)).toBe(line);
}

async function start() {
  const h = createHarness(SOURCE, 0, { autoOpenAll: false });
  await h.ready;
  expect(h.errors).toEqual([]);
  h.game.context.system.previewing = undefined;
  h.game.start();
  await tick(h);
  return h;
}

const bubbleIds = (h: Harness): string[] => {
  const ui: any = h.game.module.ui;
  const mount = ui.streams._mounted.get("phone/0")?.[0];
  return (mount?.entries ?? []).flatMap((view: any) =>
    ui.collectNodes(view.group).map((el: any) => el.id),
  );
};

const lastSent = (messages: any[], id: string, kind: "style" | "attributes", key: string) =>
  wire(messages)
    .filter(
      (m: any) =>
        (m?.method === "ui/update" || m?.method === "ui/create") &&
        m.params?.element === id &&
        m.params?.[kind] &&
        key in m.params[kind],
    )
    .map((m: any) => m.params[kind][key])
    .at(-1);

async function giveEntriesALook(h: Harness) {
  const ui: any = h.game.module.ui;
  await ui.style.update("bubble", { "--glow": "1", outline: "1px solid red" });
  await ui.attributes.update("bubble", { class: "dialogue bubble lit" });
  await flushMicrotasks(10);
}

function expectNoLook(h: Harness, since: number) {
  const after = h.messages.slice(since);
  for (const id of bubbleIds(h)) {
    for (const key of ["--glow", "outline"]) {
      const value = lastSent(after, id, "style", key);
      expect(value ?? null, `${id} ${key}`).toBeNull();
    }
    const cls = lastSent(after, id, "attributes", "class");
    expect(cls === undefined || cls === "dialogue bubble", `${id} class ${cls}`).toBe(true);
  }
}

describe("a stream entry keeps no look an update gave it at a later line (I-2744)", () => {
  test("after a step back", async () => {
    const h = await start();
    await clickTo(h, "three");
    await giveEntriesALook(h);
    const since = h.messages.length;
    const back = await h.game.rollBack("beat");
    expect(back.moved).toBe(true);
    await tick(h);
    expect(lineText(h)).toBe("two");
    expect(bubbleIds(h).length).toBeGreaterThan(0);
    expectNoLook(h, since);
  });

  test("after loading a save taken before the update", async () => {
    const h = await start();
    await clickTo(h, "two");
    const saved = h.game.saveHere();
    expect(saved).not.toBeNull();
    await clickTo(h, "three");
    await giveEntriesALook(h);
    const since = h.messages.length;
    expect(h.game.loadToResume(saved!.data)).toBe(true);
    h.game.start();
    await tick(h);
    expect(lineText(h)).toBe("two");
    expect(bubbleIds(h).length).toBeGreaterThan(0);
    expectNoLook(h, since);
  });
});
