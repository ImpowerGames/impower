import {
  DidChangeGameStateMessage,
  type CompletionPreviewStatus,
  type GameState,
  type GameStateEnding,
  type GameStatuses,
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
import { endingStatusText } from "@impower/spark-engine/src/game/core/utils/endingStatusText";
import { describeSimulationFailure } from "../../utils/describeSimulationFailure";

export interface PlayerBarState {
  launchState: GameState["launchState"];
  paused: boolean;
  stepping: boolean;
  playing: boolean;
  statuses: GameStatuses;
  executed: GameExecutedParams | null;
  size: GameResizedParams | null;
  runHistory: RunHistoryState;
}

export interface RunHistoryState {
  run: number | null;
  history: GameHistory | null;
  pending: { run: number | null; history: GameHistory } | null;
}

export type RunHistoryInput =
  | { started: number | null }
  | { run: number | null; history: GameHistory | null | undefined };

export const initialRunHistory: RunHistoryState = {
  run: null,
  history: null,
  pending: null,
};

export const foldRunHistory = (
  state: RunHistoryState,
  input: RunHistoryInput,
): RunHistoryState => {
  if ("started" in input) {
    const run = input.started;
    if (run === state.run) {
      return state;
    }
    const adopted = state.pending?.run === run ? state.pending.history : null;
    return { run, history: adopted, pending: null };
  }
  const history = input.history;
  if (history == null) {
    return state;
  }
  return input.run === state.run
    ? { ...state, history }
    : { ...state, pending: { run: input.run, history } };
};

export const NO_STATUSES: GameStatuses = { completion: null, ending: null };

export const initialPlayerBarState: PlayerBarState = {
  launchState: null,
  paused: false,
  stepping: false,
  playing: false,
  statuses: NO_STATUSES,
  executed: null,
  size: null,
  runHistory: initialRunHistory,
};

export type RunButtonState = "run" | "stop" | "run-again";

export const runButtonState = (state: PlayerBarState): RunButtonState =>
  state.launchState === "ended"
    ? "run-again"
    : state.playing
      ? "stop"
      : "run";

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
  run: number | null = null,
): PlayerBarState => {
  if (DidChangeGameStateMessage.type.isNotification(message)) {
    const game = message.params;
    return {
      ...state,
      runHistory: foldRunHistory(state.runHistory, {
        started: game.run ?? null,
      }),
      launchState: game.launchState,
      paused: game.paused,
      stepping: game.stepping,
      playing: game.run != null,
      statuses: game.statuses ?? NO_STATUSES,
    };
  }
  if (
    GameExecutedMessage.type.isNotification(message) ||
    GameRolledMessage.type.isNotification(message)
  ) {
    const executed = GameExecutedMessage.type.isNotification(message)
      ? message.params
      : (message.params.executed ?? state.executed);
    return {
      ...state,
      executed,
      runHistory: foldRunHistory(state.runHistory, {
        run,
        history: message.params.history,
      }),
    };
  }
  if (GameSteppedMessage.type.isNotification(message)) {
    return {
      ...state,
      runHistory: foldRunHistory(state.runHistory, {
        run,
        history: message.params.history,
      }),
    };
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

export const playerStatuses = (
  completion: CompletionPreviewStatus | null,
  hasFrame: boolean,
  ending: GameStateEnding | null,
): GameStatuses => ({
  completion: completion
    ? { text: completionStatusText(completion, hasFrame), status: completion }
    : null,
  ending: ending
    ? {
        text: endingStatusText(ending.kind),
        hover: endingStatusHover(ending),
        kind: ending.kind,
      }
    : null,
});

export const sameStatuses = (a: GameStatuses, b: GameStatuses): boolean =>
  a.completion?.text === b.completion?.text &&
  a.completion?.status === b.completion?.status &&
  a.ending?.text === b.ending?.text &&
  a.ending?.hover === b.ending?.hover &&
  a.ending?.kind === b.ending?.kind;
