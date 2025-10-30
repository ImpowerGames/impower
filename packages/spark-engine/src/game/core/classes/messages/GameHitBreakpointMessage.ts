import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import { DocumentLocation } from "../../types/DocumentLocation";

export type GameHitBreakpointMethod = typeof GameHitBreakpointMessage.method;

export interface GameHitBreakpointParams {
  location: DocumentLocation;
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
