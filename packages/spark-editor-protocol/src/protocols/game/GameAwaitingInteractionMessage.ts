import { type Location } from "vscode-languageserver-protocol";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type GameAwaitingInteractionMethod =
  typeof GameAwaitingInteractionMessage.method;

export interface GameAwaitingInteractionParams {
  location: Location;
}

export class GameAwaitingInteractionMessage {
  static readonly method = "game/awaitingInteraction";
  static readonly type = new MessageProtocolNotificationType<
    GameAwaitingInteractionMethod,
    GameAwaitingInteractionParams
  >(GameAwaitingInteractionMessage.method);
}

export namespace GameAwaitingInteractionMessage {
  export interface Notification
    extends NotificationMessage<
      GameAwaitingInteractionMethod,
      GameAwaitingInteractionParams
    > {}
}
