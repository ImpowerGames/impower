import {
  DidChangeGameStateMessage,
  type CompletionPreviewStatus,
  type GameState,
  type GameStateEnding,
} from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import {
  GameExecutedMessage,
  type GameExecutedParams,
} from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import {
  GameResizedMessage,
  type GameResizedParams,
} from "@impower/spark-engine/src/game/core/classes/messages/GameResizedMessage";
import { GameRolledMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameRolledMessage";
import { GameSteppedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameSteppedMessage";
import { HISTORY_REASONS } from "@impower/spark-engine/src/game/core/constants/HISTORY_REASONS";
import type { GameHistory } from "@impower/spark-engine/src/game/core/types/RunHistory";
import { describeSimulationFailure } from "../../utils/describeSimulationFailure";

export interface PlayerBarState {
  launchState: GameState["launchState"];
  paused: boolean;
  stepping: boolean;
  playing: boolean;
  run: number | null;
  completion: CompletionPreviewStatus | null;
  ending: GameStateEnding | null;
  executed: GameExecutedParams | null;
  size: GameResizedParams | null;
  history: GameHistory | null;
}

export const initialPlayerBarState: PlayerBarState = {
  launchState: null,
  paused: false,
  stepping: false,
  playing: false,
  run: null,
  completion: null,
  ending: null,
  executed: null,
  size: null,
  history: null,
};

export const skipRefusal = (
  history: GameHistory | null | undefined,
  direction: -1 | 1,
): string | undefined =>
  direction < 0
    ? history?.canRollBack
      ? undefined
      : HISTORY_REASONS.rollBack
    : history?.canRollForward
      ? undefined
      : HISTORY_REASONS.rollForward;

export const reducePlayerBar = (
  state: PlayerBarState,
  message: unknown,
): PlayerBarState => {
  if (DidChangeGameStateMessage.type.isNotification(message)) {
    const game = message.params;
    const run = game.run ?? null;
    return {
      ...state,
      run,
      history: run === state.run ? state.history : null,
      launchState: game.launchState,
      paused: game.paused,
      stepping: game.stepping,
      playing: game.run != null,
      completion: game.completion?.status ?? null,
      ending: game.ending,
    };
  }
  if (GameExecutedMessage.type.isNotification(message)) {
    return {
      ...state,
      executed: message.params,
      history: message.params.history ?? state.history,
    };
  }
  if (
    GameSteppedMessage.type.isNotification(message) ||
    GameRolledMessage.type.isNotification(message)
  ) {
    return { ...state, history: message.params.history ?? state.history };
  }
  if (GameResizedMessage.type.isNotification(message)) {
    return { ...state, size: message.params };
  }
  return state;
};

export const clearPlayerBarExecution = (
  state: PlayerBarState,
): PlayerBarState =>
  state.executed == null ? state : { ...state, executed: null };

export interface PlayerBarConnection {
  choices: number[];
  broken: boolean;
  executed: string;
}

export interface PlayerBarLocation {
  failure: string | null;
  launch: string;
  connection: PlayerBarConnection | null;
}

export const relativeScriptPath = (
  uri: string,
  workspace: string | undefined,
) => {
  const path =
    workspace && uri.startsWith(workspace) ? uri.slice(workspace.length + 1) : uri;
  const extIndex = path.lastIndexOf(".");
  return extIndex < 0 ? path : path.slice(0, extIndex);
};

const at = (
  location: { uri: string; range: { start: { line: number }; end: { line: number } } },
  edge: "start" | "end",
  workspace: string | undefined,
) =>
  `${relativeScriptPath(location.uri, workspace)} : ${location.range[edge].line + 1}`;

export const playerBarLocation = (
  executed: GameExecutedParams,
  workspace?: string,
): PlayerBarLocation => {
  const failed = executed.simulation === "fail";
  const first = executed.firstLocation;
  const last = executed.lastLocation;
  const launch =
    executed.simulateFlow != null && failed
      ? executed.simulateLocation
        ? at(executed.simulateLocation, "start", workspace)
        : ""
      : first
        ? at(first, "start", workspace)
        : "";
  const choices = executed.choices.map((choice) => choice.selected + 1);
  const connection =
    executed.startLocation != null && failed
      ? {
          choices,
          broken: true,
          executed: at(executed.startLocation, "end", workspace),
        }
      : last &&
          (first?.uri !== last.uri ||
            first?.range.start.line !== last.range.end.line)
        ? { choices, broken: false, executed: at(last, "end", workspace) }
        : null;
  return {
    failure:
      describeSimulationFailure(executed.simulation, executed.simulationFailure) ??
      null,
    launch,
    connection,
  };
};

export const COMMON_ASPECT_RATIOS = [
  [16, 9],
  [9, 16],
  [4, 3],
  [3, 4],
  [21, 9],
  [1, 1],
] as const;

export const matchAspectRatio = (width: number, height: number) => {
  for (const [w, h] of COMMON_ASPECT_RATIOS) {
    if (Math.round(height) === Math.round((width * h) / w)) {
      return `${w}:${h}`;
    }
  }
  return null;
};

export const completionStatusText = (
  status: CompletionPreviewStatus | null,
  hasFrame: boolean,
) => {
  switch (status) {
    case "preparing":
      return "Preparing suggestion preview…";
    case "showing":
      return "Previewing suggestion";
    case "unavailable":
      return hasFrame
        ? "Cannot preview this suggestion yet — showing the last valid preview"
        : "Cannot preview this suggestion yet";
    case "stale":
      return "Cannot preview the current document — showing the last valid preview";
    default:
      return "";
  }
};

export const endingStatusText = (ending: GameStateEnding): string =>
  ending.kind === "fin"
    ? "End of story"
    : ending.kind === "error"
      ? "Stopped by an error"
      : "Story ran out";

export const endingStatusHover = (ending: GameStateEnding): string => {
  if (ending.kind === "error") {
    const location = ending.error?.location ?? ending.location;
    const message = ending.error?.message ?? "";
    return location
      ? `${message} (line ${location.range.start.line + 1})`
      : message;
  }
  if (ending.kind === "out") {
    const after = ending.location
      ? `Nothing runs after line ${ending.location.range.start.line + 1}.`
      : "Nothing runs after this.";
    return `${after} End the story with fin to show the ending screen.`;
  }
  return "";
};
