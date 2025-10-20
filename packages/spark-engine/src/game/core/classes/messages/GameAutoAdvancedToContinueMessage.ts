import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/types/NotificationMessage";
import { DocumentLocation } from "../../types/DocumentLocation";

export type GameAutoAdvancedToContinueMethod =
  typeof GameAutoAdvancedToContinueMessage.method;

export interface GameAutoAdvancedToContinueParams {
  location: DocumentLocation;
}

export class GameAutoAdvancedToContinueMessage {
  static readonly method = "game/autoAdvancedToContinue";
  static readonly type = new MessageProtocolNotificationType<
    GameAutoAdvancedToContinueMethod,
    GameAutoAdvancedToContinueParams
  >(GameAutoAdvancedToContinueMessage.method);
}

export namespace GameAutoAdvancedToContinueMessage {
  export interface Notification
    extends NotificationMessage<
      GameAutoAdvancedToContinueMethod,
      GameAutoAdvancedToContinueParams
    > {}
}
