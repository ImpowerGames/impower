import { MessageProtocolRequestType } from "../MessageProtocolRequestType";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export interface GameState {
  mounted: boolean;
  programLoaded: boolean;
  programVersion: number | null;
  launchState: "pause" | "play" | "ended" | "preview" | null;
  position: { uri: string; line: number } | null;
  completion: {
    request: number;
    status: CompletionPreviewStatus;
  } | null;
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
