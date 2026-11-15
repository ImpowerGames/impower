import { afterEach, expect, it } from "vitest";
import { GameShownBeatMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameShownBeatMessage";
import { DidChangeGameStateMessage } from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { GamePlayerController, setWorkspace } from "../GamePlayerController";

afterEach(() => {
  setWorkspace(undefined as any);
});

it("publishes whether the shown beat has finished, once per change, from the game's shown-beat reports (#2104)", () => {
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
  const published: (boolean | undefined)[] = [];
  const receive = (event: Event) => {
    const message = (event as CustomEvent).detail;
    if (DidChangeGameStateMessage.type.isNotification(message)) {
      published.push(message.params.shownBeatFinished);
    }
  };
  window.addEventListener(MessageProtocol.event, receive);
  const shown = (finished: boolean) =>
    listeners.get(GameShownBeatMessage.method)!(
      GameShownBeatMessage.type.notification({ finished }),
    );
  try {
    controller.listen(game);
    expect(controller.getGameState().shownBeatFinished).toBe(false);
    shown(false);
    expect(published).toEqual([]);
    shown(true);
    shown(true);
    expect(controller.getGameState().shownBeatFinished).toBe(true);
    shown(false);
    expect(published).toEqual([true, false]);
    expect(controller.getGameState().shownBeatFinished).toBe(false);
  } finally {
    window.removeEventListener(MessageProtocol.event, receive);
    host.remove();
  }
});
