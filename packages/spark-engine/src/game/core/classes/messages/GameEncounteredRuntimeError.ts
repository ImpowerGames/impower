import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import { ErrorType } from "../../enums/ErrorType";
import { DocumentLocation } from "../../types/DocumentLocation";
import { GameState } from "../../types/GameState";

export type GameEncounteredRuntimeErrorMethod =
  typeof GameEncounteredRuntimeErrorMessage.method;

export interface GameEncounteredRuntimeErrorParams {
  message: string;
  type: ErrorType;
  location: DocumentLocation;
  state: GameState;
}

export class GameEncounteredRuntimeErrorMessage {
  static readonly method = "game/runtimeError";
  static readonly type = new MessageProtocolNotificationType<
    GameEncounteredRuntimeErrorMethod,
    GameEncounteredRuntimeErrorParams
  >(GameEncounteredRuntimeErrorMessage.method);
}

export namespace GameEncounteredRuntimeErrorMessage {
  export interface Notification
    extends NotificationMessage<
      GameEncounteredRuntimeErrorMethod,
      GameEncounteredRuntimeErrorParams
    > {}
}
