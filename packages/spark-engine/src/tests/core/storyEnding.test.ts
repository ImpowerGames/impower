import { describe, expect, it } from "vitest";
import { EventMessage } from "../../game/core/classes/messages/EventMessage";
import { UIModule } from "../../game/modules/ui/classes/UIModule";
import { createHarness, flushMicrotasks } from "../ui/harness/uiTestHarness";

const play = async (source: string) => {
  const h = createHarness(source, 0, {
    autoOpenAll: false,
    beforeConnect: (game) => {
      game.context.system.previewing = undefined;
    },
  });
  await h.ready;
  h.game.start();
  await flushMicrotasks(20);
  return h;
};

const gameMessages = (messages: any[]) =>
  messages.filter(
    (m) => typeof m?.method === "string" && m.method.startsWith("game/"),
  );

const finished = (messages: any[]) =>
  messages.filter((m) => m?.method === "game/finished").map((m) => m.params);

const indicatorHidden = (game: any) =>
  (game.module.ui as any)._state?.style?.continue_indicator?.display === "none";

const endingActive = (game: any): unknown => {
  const table = game.story.variablesState.GetVariableWithName("game");
  return table?.value?.get("ending")?.value?.get("active")?.value;
};

const mounted = (game: any) => (game.module.ui as any)._mountedLayouts as Map<
  string,
  unknown
>;

describe("a story that ends", () => {
  it("ends by fin: hides the continue indicator, opens the ending layout and reports the kind", async () => {
    const h = await play("scene start\n  Hello.\n  fin\nend\n");
    expect(h.game.ending).toBeNull();
    expect(mounted(h.game).has("ending")).toBe(false);
    h.reset();
    h.game.clickedToContinue();
    await flushMicrotasks(20);
    expect(h.game.ending?.kind).toBe("fin");
    expect(finished(h.messages)).toEqual([
      expect.objectContaining({ kind: "fin" }),
    ]);
    expect(finished(h.messages)[0].location?.range.start.line).toBe(2);
    expect(indicatorHidden(h.game)).toBe(true);
    expect(mounted(h.game).has("ending")).toBe(true);
    expect(endingActive(h.game)).toBe(true);
    expect(UIModule.MANAGED_LAYOUTS.has("ending")).toBe(true);
  });

  for (const [name, source, line] of [
    ["a done with nothing to return to", "scene start\n  Hello.\n  done\nend\n", 2],
    ["the closing end of the scene", "scene start\n  Hello.\nend\n", 1],
    [
      "a divert into a scene that ends at once",
      "scene start\n  Hello.\n  -> empty\nend\n\nscene empty\nend\n",
      2,
    ],
  ] as const) {
    it(`runs out at ${name}: holds the frame without the ending layout`, async () => {
      const h = await play(source);
      h.reset();
      h.game.clickedToContinue();
      await flushMicrotasks(20);
      expect(h.game.ending?.kind).toBe("out");
      expect(finished(h.messages)).toEqual([
        expect.objectContaining({ kind: "out" }),
      ]);
      expect(finished(h.messages)[0].location?.range.start.line).toBeGreaterThanOrEqual(line);
      expect(indicatorHidden(h.game)).toBe(true);
      expect(mounted(h.game).has("ending")).toBe(false);
      expect(endingActive(h.game)).toBe(false);
    });
  }

  it("ends by a runtime error: reports the error and its line, without the ending layout", async () => {
    const h = await play(
      'scene start\n  Hello.\n  & error("boom")\n  Goodbye.\nend\n',
    );
    h.reset();
    h.game.clickedToContinue();
    await flushMicrotasks(20);
    expect(h.game.ending?.kind).toBe("error");
    const [params] = finished(h.messages);
    expect(params?.kind).toBe("error");
    expect(params?.error?.message).toContain("boom");
    expect(params?.error?.location.range.start.line).toBe(2);
    expect(
      gameMessages(h.messages).map((m) => m.method).indexOf("game/runtimeError"),
    ).toBeLessThan(
      gameMessages(h.messages).map((m) => m.method).indexOf("game/finished"),
    );
    expect(mounted(h.game).has("ending")).toBe(false);
    expect(endingActive(h.game)).toBe(false);
  });

  it("ignores clicks and advance keys once ended, and reports the ending once", async () => {
    const h = await play("scene start\n  Hello.\n  done\nend\n");
    h.game.clickedToContinue();
    await flushMicrotasks(20);
    h.reset();
    h.game.clickedToContinue();
    h.game.autoAdvancedToContinue();
    for (const type of ["pointerdown", "keydown"]) {
      h.game.connection.receive(
        EventMessage.type.notification({
          type,
          button: 0,
          key: type === "keydown" ? "Enter" : undefined,
          code: type === "keydown" ? "Enter" : undefined,
        } as any),
      );
    }
    await flushMicrotasks(20);
    expect(gameMessages(h.messages)).toEqual([]);
    expect(h.game.ending?.kind).toBe("out");
  });

  it("records neither the ending layout nor game.ending.active in a checkpoint taken at the end", async () => {
    const h = await play("scene start\n  Hello.\n  fin\nend\n");
    h.game.clickedToContinue();
    await flushMicrotasks(20);
    expect(mounted(h.game).has("ending")).toBe(true);
    const saved = JSON.parse(h.game.save());
    const openSet: Array<{ name: string }> = saved?.modules?.ui?.layout ?? [];
    expect(openSet.map((s) => s.name)).not.toContain("ending");
    const checkpoint = h.game.checkpointJson(h.game.newestCheckpoint());
    expect(checkpoint).not.toBeNull();
    const fresh = await play("scene start\n  Hello.\n  fin\nend\n");
    expect(fresh.game.load(checkpoint!)).toBe(true);
    expect(endingActive(fresh.game)).toBe(false);
    expect(
      ((JSON.parse(checkpoint!)?.modules?.ui?.layout ?? []) as Array<{
        name: string;
      }>).map((s) => s.name),
    ).not.toContain("ending");
  });

  it("enters no ended state at a done that ends a thread", async () => {
    const h = await play(
      [
        "scene start",
        "  Before.",
        "  <- side",
        "  After.",
        "  done",
        "end",
        "scene side",
        "  In side.",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    const texts: string[] = [h.game.story.currentText ?? ""];
    for (let i = 0; i < 2; i++) {
      h.game.clickedToContinue();
      expect(h.game.ending).toBeNull();
      texts.push(h.game.story.currentText ?? "");
    }
    expect(texts.map((t) => t.trim())).toEqual(["Before.", "In side.", "After."]);
    expect(finished(h.messages)).toEqual([]);
    h.game.clickedToContinue();
    expect(h.game.ending?.kind).toBe("out");
  });

  it("enters no ended state at a done reached with choices on screen", async () => {
    const h = await play(
      [
        "scene start",
        "  choose",
        "    What now?",
        "    + [Go]",
        "      Gone.",
        "  end",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    expect(h.game.story.currentChoices.length).toBe(1);
    expect(h.game.ending).toBeNull();
    expect(finished(h.messages)).toEqual([]);
    expect(indicatorHidden(h.game)).toBe(false);
  });
});
