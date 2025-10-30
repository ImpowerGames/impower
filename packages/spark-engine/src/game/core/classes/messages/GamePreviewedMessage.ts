import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import { DocumentLocation } from "../../types/DocumentLocation";

export type GamePreviewedMethod = typeof GamePreviewedMessage.method;

export interface GamePreviewedParams {
  location: DocumentLocation;
  path: string;
}

export class GamePreviewedMessage {
  static readonly method = "game/previewed";
  static readonly type = new MessageProtocolNotificationType<
    GamePreviewedMethod,
    GamePreviewedParams
  >(GamePreviewedMessage.method);
}

export namespace GamePreviewedMessage {
  export interface Notification
    extends NotificationMessage<GamePreviewedMethod, GamePreviewedParams> {}
}
