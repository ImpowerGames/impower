import { type Location } from "vscode-languageserver-protocol";
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
