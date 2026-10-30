import { describe, expect, it } from "vitest";
import { EventMessage } from "../../game/core/classes/messages/EventMessage";
import { ErrorType } from "../../game/core/enums/ErrorType";
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

const flatten = (messages: any[]): any[] =>
  messages.flatMap((m) =>
    m?.method === "ui/batch" ? flatten(m.params?.messages ?? []) : [m],
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

  for (const [kind, source] of [
    ["fin", "scene start\n  fin\nend\n"],
    ["out", "scene start\n  done\nend\n"],
  ] as const) {
    it(`keeps a ${kind} ending through a checkpoint the story had already ended in`, async () => {
      const route = await play(source);
      expect(route.game.ending?.kind).toBe(kind);
      const checkpoint = route.game.checkpointJson(route.game.newestCheckpoint());
      expect(checkpoint).not.toBeNull();
      expect(JSON.parse(checkpoint!).ending).toBe(kind);
      const h = createHarness(source, 0, {
        autoOpenAll: false,
        beforeConnect: (game) => {
          game.context.system.previewing = undefined;
        },
      });
      await h.ready;
      h.game.start(checkpoint!);
      await flushMicrotasks(20);
      expect(h.game.ending?.kind).toBe(kind);
      expect(finished(h.messages)).toEqual([expect.objectContaining({ kind })]);
      expect(mounted(h.game).has("ending")).toBe(kind === "fin");
      expect(endingActive(h.game)).toBe(kind === "fin");
    });
  }

  it("keeps a fin ending in a save written after the ending layout's bindings ran", async () => {
    const source =
      'scene start\n  Hello.\n  fin\nend\n\nlayout ending with\n  text "Ended: {game.ending.active}"\nend\n';
    const route = await play(source);
    route.game.clickedToContinue();
    await flushMicrotasks(20);
    route.game.module.ui.refreshLayouts();
    expect(route.game.ending?.kind).toBe("fin");
    expect(route.game.story.ending).toBe("fin");
    const save = route.game.save();
    expect(JSON.parse(save).ending).toBe("fin");
    const h = createHarness(source, 0, {
      autoOpenAll: false,
      beforeConnect: (game) => {
        game.context.system.previewing = undefined;
      },
    });
    await h.ready;
    h.game.start(save);
    await flushMicrotasks(20);
    expect(h.game.ending?.kind).toBe("fin");
    expect(mounted(h.game).has("ending")).toBe(true);
  });

  it("announces a debugger step that reaches the end as the end, not as a step", async () => {
    const h = await play("scene start\n  Hello.\n  fin\nend\n");
    h.reset();
    for (let i = 0; i < 10 && !h.game.ending; i++) {
      h.game.step("over");
    }
    const methods = gameMessages(h.messages).map((m) => m.method);
    expect(h.game.ending?.kind).toBe("fin");
    expect(methods).toContain("game/finished");
    expect(methods.slice(methods.indexOf("game/finished"))).not.toContain(
      "game/stepped",
    );
  });

  it("leaves a held choice on the page when it is clicked after an error ended the story", async () => {
    const h = await play(
      [
        "scene start",
        "  choose",
        "    What now?",
        "    + [Go]",
        "      Gone.",
        "  end",
        "end",
        "",
      ].join("\n"),
    );
    for (let i = 0; i < 20 && h.observedElementIds().length === 0; i++) {
      (h.game as any)._coordinator?.onUpdate({ deltaMS: 50 });
      await flushMicrotasks(5);
    }
    const choice = h.observedElementIds()[0];
    expect(choice).toBeTruthy();
    (h.game as any).Error("boom", ErrorType.Error, null);
    expect(h.game.ending?.kind).toBe("error");
    await flushMicrotasks(20);
    h.reset();
    h.emitEvent("click", choice!);
    await flushMicrotasks(20);
    const sent = flatten(h.messages);
    expect(sent.map((m) => m.method)).not.toContain("ui/unobserve");
    expect(sent.filter((m) => m.params?.element === choice)).toEqual([]);
    expect(gameMessages(h.messages)).toEqual([]);
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
