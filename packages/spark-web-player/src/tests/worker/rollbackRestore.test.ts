import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { RollBackGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/RollBackGameMessage";
import { RollForwardGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/RollForwardGameMessage";
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SECOND = "The second beat is a little longer than the first.";

const SOURCE = [
  "define theme as audio with",
  '  src = "https://example.com/theme.wav"',
  "end",
  "",
  "define rain as audio with",
  '  src = "https://example.com/rain.wav"',
  "end",
  "",
  "scene start",
  "  ((play music theme))",
  "  The first beat.",
  `  ${SECOND}`,
  "  ((play ambient rain))",
  "  The third beat.",
  "end",
  "",
].join("\n");

const FIRST = SOURCE.split("\n").findIndex((l) => l.includes("The first beat."));

const playing = async () => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: FIRST },
    manualClock: true,
  });
  const c = h.controller as any;
  await h.compile();
  await h.select(FIRST);
  await settle(40);
  expect(await c.startGameAndApp()).toBe(true);
  await settle(40);
  await h.tick(1000 / 60, 120);
  const tap = async () => {
    for (let i = 0; i < 2; i += 1) {
      c._app.emit(
        EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
      );
      await settle(10);
      await h.tick(1000 / 60, 120);
    }
  };
  const letters = () =>
    Array.from(h.overlay.querySelectorAll<HTMLElement>(".text_letter"));
  const shown = () => letters().map((l) => l.textContent).join("");
  const audio = (from: number) =>
    h.toRouter
      .slice(from)
      .filter((m: any) => m.method === "audio/update")
      .flatMap((m: any) =>
        (m.params.updates ?? []).map((u: any) => `${m.params.channel} ${u.control} ${u.key}`),
      );
  return { h, c, tap, letters, shown, audio };
};

describe("a beat the player restores by rollback", () => {
  it("is drawn settled, with its loops as the restored state holds them", async () => {
    const { h, c, tap, letters, shown, audio } = await playing();
    try {
      await tap();
      await tap();
      expect(shown()).toContain("The third beat.");

      const from = h.toRouter.length;
      const back = await c.handleRollBackGame(
        RollBackGameMessage.type.request({ to: "beat" }),
      );
      await settle(20);
      expect(back.result).toMatchObject({ moved: true, restored: { beat: 1 } });
      expect(back.result.run).toBe(c._workerPlay.run);
      expect(shown()).toContain(SECOND);
      expect(shown()).not.toContain("The third beat.");
      expect(letters().length).toBeGreaterThan(0);
      for (const letter of letters()) {
        expect((letter as any).__sdReveal?.effect?.options).toMatchObject({
          delay: 0,
          duration: 0,
        });
      }
      expect(audio(from)).toContain("ambient stop audio.rain");
      expect(audio(from).filter((u: string) => u.startsWith("music"))).toEqual([]);
      expect(audio(from).filter((u: string) => u.startsWith("typewriter start"))).toEqual(
        [],
      );
      expect(
        h.toEditor.filter((m: any) => m.method === "game/rolled").map((m: any) => [
          m.params.restored.beat,
          m.params.run,
        ]),
      ).toEqual([[1, c._workerPlay.run]]);

      const again = h.toRouter.length;
      const forward = await c.handleRollForwardGame(
        RollForwardGameMessage.type.request({ to: "beat" }),
      );
      await settle(20);
      await h.tick(1000 / 60, 10);
      expect(forward.result).toMatchObject({ moved: true, restored: { beat: 2 } });
      expect(shown()).toContain("The third beat.");
      expect(audio(again)).toContain("ambient start audio.rain");
      expect(audio(again).filter((u: string) => u.startsWith("music"))).toEqual([]);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("leaves the ended state when a roll takes an ended story back, and ends again when it plays on", async () => {
    const { h, c, tap, shown } = await playing();
    try {
      await tap();
      await tap();
      await tap();
      expect(c.getGameState()).toMatchObject({ launchState: "ended" });
      expect(c.getGameState().ending).not.toBe(null);

      const back = await c.handleRollBackGame(
        RollBackGameMessage.type.request({ to: "beat" }),
      );
      await settle(20);
      expect(back.result).toMatchObject({ moved: true });
      expect(shown()).toContain(SECOND);
      expect(c.getGameState()).toMatchObject({ launchState: "play", ending: null });
      expect(
        h.toEditor
          .filter((m: any) => m.method === "preview/didChangeGameState")
          .at(-1)?.params,
      ).toMatchObject({ launchState: "play", ending: null });

      await tap();
      await tap();
      expect(c.getGameState()).toMatchObject({ launchState: "ended" });
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("answers a roll it cannot make with the run's reason", async () => {
    const { h, c } = await playing();
    try {
      const back = await c.handleRollBackGame(
        RollBackGameMessage.type.request({ to: "beat" }),
      );
      expect(back.result).toMatchObject({
        moved: false,
        reason: "Nothing to go back to.",
      });
    } finally {
      h.dispose();
    }
  }, 120_000);
});
