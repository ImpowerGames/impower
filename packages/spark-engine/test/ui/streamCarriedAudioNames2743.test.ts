import { describe, expect, test } from "vitest";
import { EventMessage } from "../../src/game/core/classes/messages/EventMessage";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

type Harness = ReturnType<typeof createHarness>;

const c = (h: Harness): any => (h.game as any)._coordinator;
const shown = (h: Harness): string => Object.entries(c(h)?._instructions?.text ?? {})
  .filter(([target]) => target === "dialogue")
  .flatMap(([, events]: [string, any]) => events.map((event: any) => event.text)).join("");
async function tick(h: Harness, ms = 200) {
  c(h)?.onUpdate({ deltaMS: ms });
  await flushMicrotasks(5);
}

describe("audio carried through a finished run on channels named after Object.prototype properties (I-2743)", () => {
  test.each(["constructor", "__proto__"])("a loop on a channel named %s, written on a skipped line, plays when a click finishes the run", async (channel) => {
    const h = createHarness(`define RAFFLES as character with
  name = "RAFFLES"
end
define beep as audio with
  src = "https://example.com/beep.wav"
end
layout phone {
  thread { stream { dialogue { text } } }
}
stream phone { advance = auto; pause = 0.6s }
scene start
  [[open phone]]
  RAFFLES: one
  ((play ${channel} beep loop))
  RAFFLES: two
  RAFFLES: three >
end
`, 0, { autoOpenAll: false });
    await h.ready;
    expect(h.errors).toEqual([]);
    h.game.context.system.previewing = undefined;
    h.game.start();
    await flushMicrotasks(10);
    for (let i = 0; i < 10 && !shown(h); i += 1) await tick(h, 0);
    expect(shown(h)).toBe("one");
    c(h)?.onMessage(EventMessage.type.notification({ type: "pointerdown", button: 0 } as never));
    await tick(h, 0);
    h.releaseAssets();
    for (let i = 0; i < 5; i += 1) await tick(h, 0);
    expect(shown(h)).toBe("three");
    expect(c(h)._finishedExecution).toBe(true);
    expect([...h.game.module.audio.loopsPlaying()].map(([name, sounds]) => [name, [...sounds.keys()]]))
      .toEqual([[channel, ["audio.beep"]]]);
  });
});
