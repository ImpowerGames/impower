import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { RollBackGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/RollBackGameMessage";
import { RollForwardGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/RollForwardGameMessage";
import { expect, it } from "vitest";
import { playerBarLocation } from "../../components/PlayerBar/playerBarState";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = [
  "scene start",
  "  The first beat.",
  "  The second beat.",
  "  The third beat.",
  "end",
  "",
].join("\n");

it("moves the bar's executed range and label with the run position on executed, roll back, roll forward and a fork after a roll back", async () => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: 1 },
    manualClock: true,
  });
  const c = h.controller as any;
  try {
    await h.compile();
    await h.select(1);
    await settle(40);
    expect(await c.startGameAndApp()).toBe(true);
    await settle(40);
    await h.tick(1000 / 60, 120);
    const tap = async () => {
      c._app.emit(
        EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
      );
      await settle(10);
      await h.tick(1000 / 60, 120);
    };
    const bar = () => {
      const executed = c._bar.executed;
      const location = executed ? playerBarLocation(executed) : null;
      return {
        lines: executed?.executedLines?.[MAIN_URI]?.ranges,
        label: location ? `${location.launch} > ${location.connection?.executed ?? ""}` : null,
      };
    };
    const seen = [bar()];
    await tap();
    seen.push(bar());
    await tap();
    seen.push(bar());    expect(new Set(seen.map((s) => s.label)).size).toBe(3);

    const rolls: [string, () => Promise<unknown>, number][] = [
      ["roll back", () => c.handleRollBackGame(RollBackGameMessage.type.request({ to: "beat" })), 1],
      ["roll back", () => c.handleRollBackGame(RollBackGameMessage.type.request({ to: "beat" })), 0],
      ["roll forward", () => c.handleRollForwardGame(RollForwardGameMessage.type.request({ to: "beat" })), 1],
      ["roll forward", () => c.handleRollForwardGame(RollForwardGameMessage.type.request({ to: "beat" })), 2],
      ["roll back", () => c.handleRollBackGame(RollBackGameMessage.type.request({ to: "beat" })), 1],
      ["fork", async () => { await tap(); }, 2],
    ];
    const got: [string, unknown][] = [];
    const want: [string, unknown][] = [];
    for (const [name, act, beat] of rolls) {
      await act();
      await settle(20);
      await h.tick(1000 / 60, 10);
      got.push([name, bar()]);
      want.push([name, seen[beat]]);
    }
    expect(got).toEqual(want);
  } finally {
    h.dispose();
  }
}, 120_000);
