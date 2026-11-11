import { afterEach, expect, it } from "vitest";
import { GameRolledMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameRolledMessage";
import { GameSteppedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameSteppedMessage";
import { HISTORY_REASONS } from "@impower/spark-engine/src/game/core/constants/HISTORY_REASONS";
import type { GameHistory, SettledBeat } from "@impower/spark-engine/src/game/core/types/RunHistory";
import { GamePlayerController, setWorkspace } from "../GamePlayerController";
import type { PlayerBarState } from "../components/PlayerBar/playerBarState";

afterEach(() => {
  setWorkspace(undefined as any);
});

const history = (canRollBack: boolean, canRollForward: boolean): GameHistory => ({
  canRollBack,
  canRollForward,
  behindLatest: canRollForward,
  canStepOut: false,
  rollBackRefusal: canRollBack ? null : HISTORY_REASONS.rollBack,
  rollForwardRefusal: canRollForward ? null : HISTORY_REASONS.rollForward,
  stepRefusal: null,
  stepOutRefusal: HISTORY_REASONS.stepOut,
  heldChoices: [],
});

it("gives the player bar the run history from the game's stepped and rolled events", () => {
  setWorkspace({ gameLink: { detach() {} }, programHeld: async () => {} } as any);
  const host = document.createElement("div");
  document.body.append(host);
  const controller = new GamePlayerController(host, {} as any);
  const listeners = new Map<string, (msg: unknown) => void>();
  const game = {
    connection: {
      outgoing: {
        addListener: (method: string, listener: (msg: unknown) => void) => {
          listeners.set(method, listener);
        },
      },
    },
  };
  let bar: PlayerBarState | undefined;
  const unsubscribe = controller.subscribeBar((state) => {
    bar = state;
  });
  try {
    controller.listen(game);
    listeners.get(GameSteppedMessage.method)!(
      GameSteppedMessage.type.notification({
        location: {
          uri: "file:///project/main.sd",
          range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
        },
        history: history(true, false),
      }),
    );
    expect(bar?.history).toEqual(history(true, false));
    listeners.get(GameRolledMessage.method)!(
      GameRolledMessage.type.notification({
        restored: {} as SettledBeat,
        history: history(false, true),
      }),
    );
    expect(bar?.history).toEqual(history(false, true));
  } finally {
    unsubscribe();
    host.remove();
  }
});
