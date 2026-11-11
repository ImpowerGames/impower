import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DidChangeGameStateMessage,
  type GameState,
} from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import { GameExecutedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import { GameResizedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameResizedMessage";
import { GameRolledMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameRolledMessage";
import { GameSteppedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameSteppedMessage";
import { HISTORY_REASONS } from "@impower/spark-engine/src/game/core/constants/HISTORY_REASONS";
import type { SettledBeat } from "@impower/spark-engine/src/game/core/types/RunHistory";
import PlayerBar, { type PlayerBarProps } from "./PlayerBar";
import {
  initialPlayerBarState,
  reducePlayerBar,
  type PlayerBarState,
} from "./playerBarState";

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

const pointerClick = () =>
  new MouseEvent("click", { bubbles: true, button: 0, detail: 1 });

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
    const $ = mount({ state, controls: { resize: true } });
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
      vi.advanceTimersByTime(149);
    });
    expect($("#completion-status")!.hidden).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
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

  it("disables each skip at its end of the run history with the history's reason", () => {
    const history = (canRollBack: boolean, canRollForward: boolean) => ({
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
    const skips = (state: PlayerBarState) => {
      const $ = mount({ state, controls: { skip: true } });
      return [-1, 1].map((direction) => {
        const button = $(
          `[aria-label='${direction < 0 ? "Skip back" : "Skip forward"}']`,
        ) as HTMLButtonElement;
        return { disabled: button.disabled, title: button.title };
      });
    };
    const back = { disabled: true, title: HISTORY_REASONS.rollBack };
    const forward = { disabled: true, title: HISTORY_REASONS.rollForward };
    const backOpen = { disabled: false, title: "Skip back" };
    const forwardOpen = { disabled: false, title: "Skip forward" };
    const run = playing(true);
    const atFirst = reducePlayerBar(
      run,
      GameExecutedMessage.type.notification({
        ...executed.params,
        history: history(false, false),
      }),
    );
    expect(skips(atFirst)).toEqual([back, forward]);
    const stepped = reducePlayerBar(
      atFirst,
      GameSteppedMessage.type.notification({
        location: location(5),
        history: history(true, false),
      }),
    );
    expect(skips(stepped)).toEqual([backOpen, forward]);
    const between = reducePlayerBar(
      stepped,
      GameRolledMessage.type.notification({
        restored: {} as SettledBeat,
        history: history(true, true),
      }),
    );
    expect(skips(between)).toEqual([backOpen, forwardOpen]);
    const rolledToFirst = reducePlayerBar(
      between,
      GameRolledMessage.type.notification({
        restored: {} as SettledBeat,
        history: history(false, true),
      }),
    );
    expect(skips(rolledToFirst)).toEqual([back, forwardOpen]);
    expect(
      skips(reducePlayerBar(rolledToFirst, gameState({ run: null }))),
    ).toEqual([backOpen, forwardOpen]);
    expect(skips(playing(true))).toEqual([back, forward]);
  });

  it("skips nothing from a press on a skip at its end of the history, nor from a hold that reaches it", () => {
    vi.useFakeTimers();
    const onSkip = vi.fn();
    const at = (canRollBack: boolean) =>
      reducePlayerBar(
        playing(true),
        GameRolledMessage.type.notification({
          restored: {} as SettledBeat,
          history: {
            canRollBack,
            canRollForward: true,
            behindLatest: true,
            canStepOut: false,
            rollBackRefusal: canRollBack ? null : HISTORY_REASONS.rollBack,
            rollForwardRefusal: null,
            stepRefusal: null,
            stepOutRefusal: HISTORY_REASONS.stepOut,
            heldChoices: [],
          },
        }),
      );
    const $ = mount({ state: at(false), controls: { skip: true }, onSkip });
    act(() => {
      $("[aria-label='Skip back']")!.dispatchEvent(pointer("pointerdown"));
      vi.advanceTimersByTime(1000);
      $("[aria-label='Skip back']")!.dispatchEvent(pointer("pointerup"));
    });
    expect(onSkip).not.toHaveBeenCalled();
    mount({ state: at(true), controls: { skip: true }, onSkip });
    act(() => {
      $("[aria-label='Skip back']")!.dispatchEvent(pointer("pointerdown"));
    });
    expect(onSkip).toHaveBeenCalledTimes(1);
    mount({ state: at(false), controls: { skip: true }, onSkip });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("leaves the resize handle and the size readout to a host that owns the display", () => {
    const resized = reducePlayerBar(
      initialPlayerBarState,
      GameResizedMessage.type.notification({
        width: 960,
        height: 540,
        aspectRatio: "16:9",
        fit: "auto",
      }),
    );
    const $ = mount({ state: resized, controls: { resize: true } });
    expect($("#resize-handle")).not.toBeNull();
    expect($("#size-label")!.textContent).toBe("960 × 540");
    mount({ state: resized, controls: {} });
    expect($("#resize-handle")).toBeNull();
    expect($("#size-label")).toBeNull();
    expect($("#aspect-ratio-label")).toBeNull();
    expect($("#fullscreen-button")).toBeNull();
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
      vi.advanceTimersByTime(399);
    });
    expect(onSkip).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onSkip).toHaveBeenCalledTimes(2);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onSkip).toHaveBeenCalledTimes(5);
    act(() => {
      forward.dispatchEvent(pointer("pointerup"));
      forward.dispatchEvent(pointerClick());
    });
    expect(forward.hasAttribute("data-pressed")).toBe(false);
    act(() => {
      vi.advanceTimersByTime(800);
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
      vi.advanceTimersByTime(800);
    });
    expect(onSkip.mock.calls).toEqual([[-1]]);
    act(() => {
      back.click();
    });
    expect(onSkip).toHaveBeenCalledTimes(2);
  });

  it("skips once for a press that leaves the button and comes back before release", () => {
    vi.useFakeTimers();
    const onSkip = vi.fn();
    const $ = mount({ state: initialPlayerBarState, controls: { skip: true }, onSkip });
    const forward = $("[aria-label='Skip forward']")!;
    act(() => {
      forward.dispatchEvent(pointer("pointerdown"));
      forward.dispatchEvent(pointer("pointerleave"));
      forward.dispatchEvent(pointer("pointerenter"));
      vi.advanceTimersByTime(200);
      forward.dispatchEvent(pointer("pointerup"));
      forward.dispatchEvent(pointerClick());
      vi.advanceTimersByTime(800);
    });
    expect(onSkip.mock.calls).toEqual([[1]]);
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
