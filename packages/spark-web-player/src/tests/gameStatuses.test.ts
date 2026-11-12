import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DidChangeGameStateMessage,
  type GameStatuses,
} from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { GameExecutedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import { GamePlayerController, setWorkspace } from "../GamePlayerController";
import SparkWebPlayer from "../SparkWebPlayer";
import type { PlayerBarState } from "../components/PlayerBar/playerBarState";

const URI = "file:///project/main.sd";

const at = (line: number) => ({
  uri: URI,
  range: { start: { line, character: 0 }, end: { line, character: 0 } },
});

let controller: any;
let host: HTMLElement;
let published: GameStatuses[];
let bar: PlayerBarState[];
let unsubscribe: () => void;

const hear = (event: Event) => {
  const message = (event as CustomEvent).detail;
  if (DidChangeGameStateMessage.type.isNotification(message)) {
    published.push(message.params.statuses!);
  }
};

const latest = () => published.at(-1);

beforeEach(() => {
  vi.useFakeTimers();
  setWorkspace({ gameLink: { detach() {} }, programHeld: async () => {} } as any);
  host = document.createElement("div");
  document.body.append(host);
  controller = new GamePlayerController(host, { game: host, viewport: host } as any);
  published = [];
  bar = [];
  unsubscribe = controller.subscribeBar((state: PlayerBarState) => bar.push(state));
  window.addEventListener(MessageProtocol.event, hear);
});

afterEach(() => {
  window.removeEventListener(MessageProtocol.event, hear);
  unsubscribe();
  controller.dispose();
  host.remove();
  setWorkspace(undefined as any);
  vi.useRealTimers();
});

describe("the player's computed statuses", () => {
  it("publishes the preparing status 150ms after it starts and the others at once", () => {
    controller.setCompletionStatus("preparing");
    expect(latest()).toEqual({ completion: null, ending: null });
    vi.advanceTimersByTime(149);
    expect(controller.getGameState().statuses.completion).toBeNull();
    vi.advanceTimersByTime(1);
    expect(latest()!.completion).toEqual({
      text: "Preparing suggestion preview…",
      status: "preparing",
    });

    controller.setCompletionStatus("showing");
    expect(latest()!.completion).toEqual({
      text: "Previewing suggestion",
      status: "showing",
    });
    controller.setCompletionStatus(null);
    expect(latest()!.completion).toBeNull();
  });

  it("drops a preparing status that settles before its delay without ever showing it", () => {
    controller.setCompletionStatus("preparing");
    vi.advanceTimersByTime(100);
    controller.setCompletionStatus("showing");
    vi.advanceTimersByTime(100);
    expect(published.map((statuses) => statuses.completion?.status ?? null)).not.toContain(
      "preparing",
    );
    expect(latest()!.completion?.status).toBe("showing");
  });

  it("words an unavailable suggestion by whether a frame is showing", () => {
    controller.setCompletionStatus("unavailable");
    expect(latest()!.completion!.text).toBe("Cannot preview this suggestion yet");
    controller._workerGame = {};
    controller.updateExecutionLabels(
      GameExecutedMessage.type.notification({
        firstLocation: at(1),
        lastLocation: at(2),
        conditions: [],
        choices: [],
        state: "previewing",
        simulation: "success",
      }).params,
    );
    expect(latest()!.completion!.text).toBe(
      "Cannot preview this suggestion yet — showing the last valid preview",
    );
  });

  it("words each ending with its hover", () => {
    controller.setEndingStatus({ kind: "out", location: at(4) });
    expect(latest()!.ending).toEqual({
      text: "Story ran out",
      hover: "Nothing runs after line 5. End the story with fin to show the ending screen.",
      kind: "out",
    });
    controller.setEndingStatus({
      kind: "error",
      location: null,
      error: { message: "boom", location: at(3) },
    });
    expect(latest()!.ending).toEqual({
      text: "Stopped by an error",
      hover: "boom (line 4)",
      kind: "error",
    });
    controller.setEndingStatus({ kind: "fin", location: at(9) });
    expect(latest()!.ending).toEqual({ text: "End of story", hover: "", kind: "fin" });
    controller.setEndingStatus(null);
    expect(latest()!.ending).toBeNull();
  });

  it("gives its own bar the statuses it sends the host", () => {
    controller.setCompletionStatus("showing");
    controller.setEndingStatus({ kind: "fin", location: at(9) });
    expect(bar.at(-1)!.statuses).toEqual(latest());
  });
});

describe("the player's strip", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    render(null, container);
    container.remove();
  });

  it("renders no strip under a host that shows the statuses itself", () => {
    act(() => {
      render(h(SparkWebPlayer, { toolbar: true, hostDisplay: true }), container);
    });
    expect(container.querySelector("#toolbar")).toBeNull();
    expect(container.querySelector("#game")).not.toBeNull();
    expect(container.querySelector("#save-note")).not.toBeNull();
  });

  it("keeps the strip with both statuses and the saves holder when no host shows them", () => {
    act(() => {
      render(h(SparkWebPlayer, { toolbar: true }), container);
    });
    expect(container.querySelector("#toolbar")).not.toBeNull();
    expect(container.querySelector("#completion-status")).not.toBeNull();
    expect(container.querySelector("#ending-status")).not.toBeNull();
    expect(container.querySelector("#saves-button")).not.toBeNull();
  });
});
