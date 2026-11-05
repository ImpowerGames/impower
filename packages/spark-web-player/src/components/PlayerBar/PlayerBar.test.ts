import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DidChangeGameStateMessage,
  type GameState,
} from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import { GameExecutedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import { GameResizedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameResizedMessage";
import PlayerBar, {
  COMPLETION_PREPARING_STATUS_DELAY,
  type PlayerBarProps,
} from "./PlayerBar";
import {
  initialPlayerBarState,
  reducePlayerBar,
  type PlayerBarState,
} from "./playerBarState";
import { HOLD_REPEAT_DELAY_MS, HOLD_REPEAT_INTERVAL_MS } from "./useHoldRepeat";

const WORKSPACE = "file:///project";

const location = (line: number, endLine = line) => ({
  uri: `${WORKSPACE}/main.sd`,
  range: {
    start: { line, character: 0 },
    end: { line: endLine, character: 0 },
  },
});

const gameState = (
  overrides: Partial<GameState> = {},
) =>
  DidChangeGameStateMessage.type.notification({
    mounted: true,
    programLoaded: true,
    programVersion: 1,
    launchState: "preview",
    paused: false,
    stepping: false,
    run: null,
    position: null,
    completion: null,
    ending: null,
    ...overrides,
  });

const executed = GameExecutedMessage.type.notification({
  firstLocation: location(2),
  lastLocation: location(5),
  conditions: [],
  choices: [{ options: ["a", "b"], selected: 1 }],
  state: "previewing",
  simulation: "success",
});

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
  vi.useRealTimers();
});

const mount = (props: Partial<PlayerBarProps> & { state: PlayerBarState }) => {
  act(() => {
    render(h(PlayerBar, { controls: {}, workspace: WORKSPACE, ...props }), container);
  });
  return (selector: string) => container.querySelector<HTMLElement>(selector);
};

const pointer = (type: string) =>
  new (window.PointerEvent ?? MouseEvent)(type, { bubbles: true, button: 0 });

describe("PlayerBar state", () => {
  it("renders the launch state, position, size and ratio from protocol messages", () => {
    let state = reducePlayerBar(initialPlayerBarState, gameState());
    state = reducePlayerBar(state, executed);
    state = reducePlayerBar(
      state,
      GameResizedMessage.type.notification({
        width: 960,
        height: 540,
        aspectRatio: "16:9",
        fit: "auto",
      }),
    );
    const $ = mount({ state });
    expect($("#left-items")!.hidden).toBe(false);
    expect($("#launch-state-icon")!.getAttribute("data-state")).toBe("preview");
    expect($("#launch-label")!.textContent).toBe("main : 3");
    expect($("#execution-info")!.hidden).toBe(false);
    expect($("#connection-label")!.textContent).toBe("→  [ 2 ]  →");
    expect($("#executed-label")!.textContent).toBe("main : 6");
    expect($("#size-label")!.textContent).toBe("960 × 540");
    expect($("#aspect-ratio-label")!.textContent).toBe("(16:9)");
    expect($("#transport-items")).toBeNull();
  });

  it("hides the location until the game has executed and marks a failed simulation", () => {
    const $ = mount({ state: initialPlayerBarState });
    expect($("#left-items")!.hidden).toBe(true);
    expect($("#launch-state-icon")!.hasAttribute("data-state")).toBe(false);
    const failed = reducePlayerBar(
      initialPlayerBarState,
      GameExecutedMessage.type.notification({
        ...executed.params,
        simulation: "fail",
        simulationFailure: "exhausted",
        simulateFlow: "start",
        simulateLocation: location(0),
        startLocation: location(7),
      }),
    );
    mount({ state: failed });
    expect($("#location-items")!.classList.contains("error")).toBe(true);
    expect($("#location-items")!.title).toMatch(/No path through this scene/);
    expect($("#launch-label")!.textContent).toBe("main : 1");
    expect($("#connection-label")!.textContent).toBe("→  [ 2 ]  → 🞪 →");
    expect($("#executed-label")!.textContent).toBe("main : 8");
    mount({ state: failed, routeShown: true });
    expect($("#route-button")!.hidden).toBe(false);
    expect($("#location-items")!.hidden).toBe(true);
  });

  it("shows the ending and completion statuses the game state carries", () => {
    vi.useFakeTimers();
    const ended = reducePlayerBar(
      initialPlayerBarState,
      gameState({
        launchState: "ended",
        run: 3,
        ending: { kind: "error", location: null, error: { message: "boom", location: location(3) } },
      }),
    );
    const $ = mount({ state: ended });
    expect($("#ending-status")!.hidden).toBe(false);
    expect($("#ending-status")!.textContent).toBe("Stopped by an error");
    expect($("#ending-status")!.title).toBe("boom (line 4)");
    expect($("#ending-status")!.getAttribute("data-kind")).toBe("error");

    const preparing = reducePlayerBar(
      initialPlayerBarState,
      gameState({ completion: { request: 1, status: "preparing" } }),
    );
    mount({ state: initialPlayerBarState });
    mount({ state: preparing });
    expect($("#completion-status")!.hidden).toBe(true);
    act(() => {
      vi.advanceTimersByTime(COMPLETION_PREPARING_STATUS_DELAY);
    });
    expect($("#completion-status")!.hidden).toBe(false);
    expect($("#completion-status")!.textContent).toBe("Preparing suggestion preview…");
    mount({
      state: reducePlayerBar(
        initialPlayerBarState,
        gameState({ completion: { request: 1, status: "unavailable" } }),
      ),
    });
    expect($("#completion-status")!.getAttribute("data-state")).toBe("unavailable");
    expect($("#completion-status")!.textContent).toBe("Cannot preview this suggestion yet");
  });
});

describe("PlayerBar controls", () => {
  const playing = (paused: boolean, stepping = false) =>
    reducePlayerBar(
      initialPlayerBarState,
      gameState({ launchState: paused ? "pause" : "play", run: 1, paused, stepping }),
    );

  it("shows only the controls the host enables", () => {
    const $ = mount({ state: playing(false), controls: { skip: true } });
    expect($("[aria-label='Skip back']")).not.toBeNull();
    expect($("[aria-label='Skip forward']")).not.toBeNull();
    expect($("[aria-label='Pause']")).toBeNull();
    mount({ state: initialPlayerBarState, controls: { step: true } });
    expect($("#transport-items")).toBeNull();
    mount({
      state: reducePlayerBar(initialPlayerBarState, gameState({ launchState: "ended", run: 1 })),
      controls: { step: true },
    });
    expect($("[aria-label='Pause']")).toBeNull();
    mount({ state: initialPlayerBarState, controls: { fullscreen: true } });
    expect($("#fullscreen-button")).not.toBeNull();
  });

  it("emits pause, resume, step and fullscreen events", () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const onStep = vi.fn();
    const onToggleFullscreen = vi.fn();
    const handlers = { onPause, onResume, onStep, onToggleFullscreen };
    const controls = { step: true, fullscreen: true };
    const $ = mount({ state: playing(false), controls, ...handlers });
    expect(($("[aria-label='Step Into']") as HTMLButtonElement).disabled).toBe(true);
    $("[aria-label='Pause']")!.click();
    expect(onPause).toHaveBeenCalledTimes(1);
    mount({ state: playing(true), controls, ...handlers });
    $("[aria-label='Resume']")!.click();
    $("[aria-label='Step Into']")!.click();
    $("[aria-label='Step Out']")!.click();
    $("#fullscreen-button")!.click();
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onStep.mock.calls).toEqual([["in"], ["out"]]);
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
    mount({ state: playing(true, true), controls, ...handlers });
    expect(($("[aria-label='Step Out']") as HTMLButtonElement).disabled).toBe(true);
  });

  it("repeats a held skip after 400ms then every 100ms and swallows the release click", () => {
    vi.useFakeTimers();
    const onSkip = vi.fn();
    const $ = mount({ state: initialPlayerBarState, controls: { skip: true }, onSkip });
    const forward = $("[aria-label='Skip forward']")!;
    act(() => {
      forward.dispatchEvent(pointer("pointerdown"));
    });
    expect(onSkip.mock.calls).toEqual([[1]]);
    expect(forward.hasAttribute("data-pressed")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(HOLD_REPEAT_DELAY_MS - 1);
    });
    expect(onSkip).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onSkip).toHaveBeenCalledTimes(2);
    act(() => {
      vi.advanceTimersByTime(HOLD_REPEAT_INTERVAL_MS * 3);
    });
    expect(onSkip).toHaveBeenCalledTimes(5);
    act(() => {
      forward.dispatchEvent(pointer("pointerup"));
      forward.click();
    });
    expect(forward.hasAttribute("data-pressed")).toBe(false);
    act(() => {
      vi.advanceTimersByTime(HOLD_REPEAT_DELAY_MS * 2);
    });
    expect(onSkip).toHaveBeenCalledTimes(5);
    act(() => {
      $("[aria-label='Skip back']")!.click();
    });
    expect(onSkip.mock.calls.at(-1)).toEqual([-1]);
    expect(onSkip).toHaveBeenCalledTimes(6);
  });

  it("stops repeating when the pointer leaves while held", () => {
    vi.useFakeTimers();
    const onSkip = vi.fn();
    const $ = mount({ state: initialPlayerBarState, controls: { skip: true }, onSkip });
    const back = $("[aria-label='Skip back']")!;
    act(() => {
      back.dispatchEvent(pointer("pointerdown"));
      back.dispatchEvent(pointer("pointerleave"));
      vi.advanceTimersByTime(HOLD_REPEAT_DELAY_MS * 2);
    });
    expect(onSkip.mock.calls).toEqual([[-1]]);
    act(() => {
      back.click();
    });
    expect(onSkip).toHaveBeenCalledTimes(2);
  });

  it("keeps a skip press from starting the bar's resize drag", () => {
    const onToolbarPointerDown = vi.fn();
    const $ = mount({ state: initialPlayerBarState, controls: { skip: true, step: true } });
    $("#toolbar")!.addEventListener("pointerdown", onToolbarPointerDown);
    act(() => {
      $("[aria-label='Skip back']")!.dispatchEvent(pointer("pointerdown"));
      $("[aria-label='Skip back']")!.dispatchEvent(pointer("pointerup"));
    });
    expect(onToolbarPointerDown).not.toHaveBeenCalled();
  });
});
