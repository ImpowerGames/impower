import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { DocumentLocation } from "../../types/DocumentLocation";

export type GameAwaitingInteractionMethod =
  typeof GameAwaitingInteractionMessage.method;

export interface GameAwaitingInteractionParams {
  location: DocumentLocation;
}

export class GameAwaitingInteractionMessage {
  static readonly method = "game/awaitingInteraction";
  static readonly type = new MessageProtocolNotificationType<
    GameAwaitingInteractionMethod,
    GameAwaitingInteractionParams
  >(GameAwaitingInteractionMessage.method);
}

export namespace GameAwaitingInteractionMessage {
  export interface Notification extends NotificationMessage<
    GameAwaitingInteractionMethod,
    GameAwaitingInteractionParams
  > {}
}
