import { type Location } from "vscode-languageserver-protocol";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type GameHitBreakpointMethod = typeof GameHitBreakpointMessage.method;

export interface GameHitBreakpointParams {
  location: Location;
}

export class GameHitBreakpointMessage {
  static readonly method = "game/hitBreakpoint";
  static readonly type = new MessageProtocolNotificationType<
    GameHitBreakpointMethod,
    GameHitBreakpointParams
  >(GameHitBreakpointMessage.method);
}

export namespace GameHitBreakpointMessage {
  export interface Notification
    extends NotificationMessage<
      GameHitBreakpointMethod,
      GameHitBreakpointParams
    > {}
}
