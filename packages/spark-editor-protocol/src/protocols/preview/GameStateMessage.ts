import { MessageProtocolRequestType } from "../MessageProtocolRequestType";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";
import type { Location } from "../../types";

export interface GameState {
  mounted: boolean;
  programLoaded: boolean;
  programVersion: number | null;
  launchState: "pause" | "play" | "ended" | "preview" | null;
  paused: boolean;
  stepping: boolean;
  run?: number | null;
  position: { uri: string; line: number } | null;
  completion: {
    request: number;
    status: CompletionPreviewStatus;
  } | null;
  ending: GameStateEnding | null;
  statuses?: GameStatuses;
  beat?: GameStateBeat;
}

export interface GameStateBeat {
  playing: boolean;
  refusal: string | null;
}

export interface GameStatuses {
  completion: {
    text: string;
    status: CompletionPreviewStatus;
  } | null;
  ending: {
    text: string;
    hover: string;
    kind: GameStateEnding["kind"];
  } | null;
}

export interface GameStateEnding {
  kind: "fin" | "out" | "error";
  location: Location | null;
  error?: {
    message: string;
    location: Location;
  };
}

export type CompletionPreviewStatus =
  | "preparing"
  | "showing"
  | "unavailable"
  | "stale";
export class GameStateMessage {
  static readonly method = "preview/gameState";
  static readonly type = new MessageProtocolRequestType<
    typeof GameStateMessage.method, Record<string, never>, GameState
  >(GameStateMessage.method);
}
export class DidChangeGameStateMessage {
  static readonly method = "preview/didChangeGameState";
  static readonly type = new MessageProtocolNotificationType<
    typeof DidChangeGameStateMessage.method, GameState
  >(DidChangeGameStateMessage.method);
}
