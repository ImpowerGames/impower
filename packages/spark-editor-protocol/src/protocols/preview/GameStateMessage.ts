import { MessageProtocolRequestType } from "../MessageProtocolRequestType";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export interface GameState {
  mounted: boolean;
  programLoaded: boolean;
  programVersion: number | null;
  launchState: "pause" | "play" | "preview" | null;
  /** Source target of the last completed preview update; null while a selection is pending. */
  position: { uri: string; line: number } | null;
  /** The autocomplete suggestion preview while a list is being previewed or
   *  its frame is still on screen; null otherwise. `request` is the newest
   *  `textDocument/previewCompletion` handled. `preparing`: the highlighted
   *  suggestion is being compiled; `showing`: it is on screen; `unavailable`:
   *  it cannot be previewed and the last valid frame stays; `stale`: the list
   *  closed, the real document cannot be previewed, and the last valid frame
   *  stays. */
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
