import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { SetStartingDisplayModeMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetStartingDisplayModeMessage";
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = [
  "scene start",
  "  The train rattles on.",
  "  Something is wrong.",
  "  choose",
  "    + [Run.]",
  "      You run.",
  "    + [Wait.]",
  "      You wait.",
  "  end",
  "  Cold air.",
  "end",
  "",
].join("\n");

const FIRST = SOURCE.split("\n").findIndex((l) => l.includes("The train"));

const setMode = (c: any, mode: "textbox" | "textstream") =>
  c.handleSetStartingDisplayMode(
    SetStartingDisplayModeMessage.type.request({ mode }),
  );

const harness = async () => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: FIRST },
    manualClock: true,
  });
  const c = h.controller as any;
  const page = () =>
    Array.from(
      h.overlay.querySelectorAll<HTMLElement>(".textstream_column > *"),
    ).map((el) => el.textContent?.trim() ?? "");
  const box = () =>
    Array.from(
      h.overlay.querySelectorAll<HTMLElement>(".layout_textbox .text_letter"),
    )
      .map((l) => l.textContent)
      .join("");
  const send = async (event: Record<string, unknown>) => {
    c._app.emit(EventMessage.type.notification(event as never));
    await settle(10);
    await h.tick(1000 / 60, 120);
  };
  const tap = () => send({ type: "pointerdown", button: 0 });
  const tapUntil = async (done: () => boolean) => {
    for (let i = 0; i < 12 && !done(); i += 1) {
      await tap();
    }
    expect(done()).toBe(true);
  };
  return { h, c, page, box, send, tap, tapUntil };
};

describe("the starting display mode the host sends (#1992)", () => {
  it("redraws the idle preview on the page, and back in the textbox", async () => {
    const { h, c, page, box } = await harness();
    try {
      await h.compile();
      await h.select(FIRST);
      await settle(40);
      expect(page()).toEqual([]);

      await setMode(c, "textstream");
      await settle(40);
      expect(page()).toEqual(["The train rattles on."]);

      await setMode(c, "textbox");
      await settle(40);
      expect(page()).toEqual([]);
      expect(box()).toContain("The train rattles on.");
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("starts a run on the page, continues by number key, and switches mid-run without leaving the run", async () => {
    const { h, c, page, box, send, tapUntil } = await harness();
    try {
      await setMode(c, "textstream");
      await h.compile();
      await h.select(FIRST);
      await settle(40);
      expect(await c.startGameAndApp()).toBe(true);
      await settle(40);
      await h.tick(1000 / 60, 120);
      await tapUntil(() => page().includes("Run.Wait."));
      expect(page().slice(0, 2)).toEqual([
        "The train rattles on.",
        "Something is wrong.",
      ]);

      await send({ type: "keydown", key: "2" });
      await tapUntil(() => page().includes("You wait."));
      expect(page()).toContain("Wait.");

      const run = c._workerPlay.run;
      await setMode(c, "textbox");
      await settle(40);
      await h.tick(1000 / 60, 120);
      expect(c._workerPlay.run).toBe(run);
      expect(page()).toEqual([]);
      expect(box()).toContain("You wait.");

      await tapUntil(() => box().includes("Cold air."));
      expect(c._workerPlay.run).toBe(run);
    } finally {
      h.dispose();
    }
  }, 120_000);
});
