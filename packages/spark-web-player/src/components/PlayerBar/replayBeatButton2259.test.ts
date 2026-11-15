import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DidChangeGameStateMessage,
  type GameState,
} from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import {
  NO_BEAT_REFUSAL,
  OUTSIDE_EVERY_SCENE_REFUSAL,
} from "../../main/workers/messages/PlayMessage";
import SparkWebPlayer from "../../SparkWebPlayer";
import PlayerBar, { type PlayerBarProps } from "./PlayerBar";
import {
  initialPlayerBarState,
  reducePlayerBar,
  type PlayerBarState,
} from "./playerBarState";

const controllerBar = vi.hoisted(() => ({
  state: null as PlayerBarState | null,
}));

vi.mock("../../GamePlayerController", () => ({
  GamePlayerController: class {
    subscribeBar(listener: (state: PlayerBarState, view: object) => void) {
      listener(controllerBar.state!, { routeShown: false, snapping: false, starting: false });
      return () => {};
    }
    setup() {}
    dispose() {}
  },
  setWorkspace() {},
}));

const gameState = (overrides: Partial<GameState> = {}) =>
  reducePlayerBar(
    initialPlayerBarState,
    DidChangeGameStateMessage.type.notification({
      mounted: true,
      programLoaded: true,
      programVersion: 1,
      launchState: "preview",
      paused: false,
      stepping: false,
      run: null,
      position: null,
      shownBeatDescription: null,
      completion: null,
      ending: null,
      statuses: { completion: null, ending: null },
      beat: { playing: false, refusal: null },
      ...overrides,
    }),
  );

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
});

const mount = (props: Partial<PlayerBarProps> & { state: PlayerBarState }) => {
  const onReplayBeat = vi.fn();
  act(() => {
    render(
      h(PlayerBar, {
        controls: { run: true, replay: true },
        replayShortcut: "Ctrl+Alt+Enter",
        onReplayBeat,
        ...props,
      }),
      container,
    );
  });
  const button = () =>
    container.querySelector<HTMLButtonElement>("#replay-beat-button");
  const click = () => act(() => button()!.click());
  return { button, click, onReplayBeat };
};

describe("the player bar's Replay beat control", () => {
  it("is absent unless the host asks for it", () => {
    const bar = mount({ state: gameState(), controls: { run: true } });
    expect(bar.button()).toBeNull();
  });

  it("sits beside the run button", () => {
    const bar = mount({ state: gameState() });
    expect(bar.button()!.previousElementSibling?.id).toBe("run-button");
  });

  it("plays the shown beat, titled with its shortcut", () => {
    const bar = mount({ state: gameState() });
    expect(bar.button()!.getAttribute("aria-label")).toBe("Replay beat");
    expect(bar.button()!.title).toBe("Replay beat (Ctrl+Alt+Enter)");
    expect(bar.button()!.getAttribute("aria-pressed")).toBe("false");
    expect(bar.button()!.getAttribute("aria-disabled")).toBeNull();
    bar.click();
    expect(bar.onReplayBeat).toHaveBeenCalledTimes(1);
  });

  it("is pressed while its beat plays, and a press restarts the beat", () => {
    const bar = mount({
      state: gameState({ beat: { playing: true, refusal: null } }),
    });
    expect(bar.button()!.getAttribute("aria-pressed")).toBe("true");
    expect(bar.button()!.hasAttribute("data-pressed")).toBe(true);
    bar.click();
    expect(bar.onReplayBeat).toHaveBeenCalledTimes(1);
  });

  it("is disabled with the beat's refusal as its title", () => {
    const refusal =
      "This line is outside every scene. Put the cursor in a scene to play from there.";
    const bar = mount({ state: gameState({ beat: { playing: false, refusal } }) });
    expect(bar.button()!.getAttribute("aria-disabled")).toBe("true");
    expect(bar.button()!.title).toBe(refusal);
    expect(bar.button()!.getAttribute("aria-description")).toBe(refusal);
    bar.click();
    expect(bar.onReplayBeat).not.toHaveBeenCalled();
  });

  it("carries the reason Play From Here gives when the story cannot play", () => {
    const bar = mount({ state: gameState(), runRefusal: "The program has errors." });
    expect(bar.button()!.getAttribute("aria-disabled")).toBe("true");
    expect(bar.button()!.title).toBe("The program has errors.");
    bar.click();
    expect(bar.onReplayBeat).not.toHaveBeenCalled();
  });

  it("is disabled while the game is starting", () => {
    const bar = mount({ state: gameState(), starting: true });
    expect(bar.button()!.title).toBe("The game is starting.");
    expect(bar.button()!.getAttribute("aria-disabled")).toBe("true");
  });

  it("is disabled before the preview has shown a beat", () => {
    const bar = mount({ state: initialPlayerBarState });
    expect(bar.button()!.title).toBe(NO_BEAT_REFUSAL);
    expect(bar.button()!.getAttribute("aria-disabled")).toBe("true");
  });

  it("leaves the bar while the game runs and after it ends", () => {
    expect(mount({ state: gameState({ run: 1, launchState: "play" }) }).button()).toBeNull();
    expect(mount({ state: gameState({ run: 1, launchState: "ended" }) }).button()).toBeNull();
  });
});

describe("the spark-web-player element's Replay beat control", () => {
  const mountElement = async (state: PlayerBarState, title: string) => {
    controllerBar.state = state;
    const element = document.createElement("spark-web-player");
    container.append(element);
    await act(async () => {
      render(
        h(SparkWebPlayer, { toolbar: true, runButton: true, replayButton: true }),
        element,
      );
    });
    await vi.waitFor(() => {
      expect(
        element.querySelector<HTMLElement>("#replay-beat-button")?.title,
      ).toBe(title);
    });
    const requests: unknown[] = [];
    const listen = (e: Event) => {
      const message = (e as CustomEvent).detail;
      if (message?.method === "preview/playBeat") {
        requests.push(message);
      }
    };
    window.addEventListener("jsonrpc", listen);
    const click = () =>
      act(() => element.querySelector<HTMLElement>("#replay-beat-button")!.click());
    return {
      requests,
      click,
      done: () => {
        window.removeEventListener("jsonrpc", listen);
        render(null, element);
      },
    };
  };

  it("asks the player to play the shown beat on each click", async () => {
    const player = await mountElement(gameState(), "Replay beat");
    player.click();
    player.click();
    expect(player.requests).toEqual([
      { jsonrpc: "2.0", method: "preview/playBeat", id: expect.anything(), params: {} },
      { jsonrpc: "2.0", method: "preview/playBeat", id: expect.anything(), params: {} },
    ]);
    player.done();
  });

  it("asks nothing while the shown line has no beat to play", async () => {
    const player = await mountElement(
      gameState({ beat: { playing: false, refusal: OUTSIDE_EVERY_SCENE_REFUSAL } }),
      OUTSIDE_EVERY_SCENE_REFUSAL,
    );
    player.click();
    expect(player.requests).toEqual([]);
    player.done();
  });
});
