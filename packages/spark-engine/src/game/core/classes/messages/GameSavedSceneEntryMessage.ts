import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { GameSave } from "../../types/GameSave";

export type GameSavedSceneEntryMethod = typeof GameSavedSceneEntryMessage.method;

export interface GameSavedSceneEntryParams {
  save: GameSave;
}

export class GameSavedSceneEntryMessage {
  static readonly method = "game/savedSceneEntry";
  static readonly type = new MessageProtocolNotificationType<
    GameSavedSceneEntryMethod,
    GameSavedSceneEntryParams
  >(GameSavedSceneEntryMessage.method);
}

export namespace GameSavedSceneEntryMessage {
  export interface Notification extends NotificationMessage<
    GameSavedSceneEntryMethod,
    GameSavedSceneEntryParams
  > {}
}
