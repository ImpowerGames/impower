import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/types/NotificationMessage";
import { DocumentLocation } from "../../types/DocumentLocation";

export type GameExecutedMethod = typeof GameExecutedMessage.method;

export interface GameExecutedParams {
  simulatePath?: string | null;
  startPath?: string | null;
  executedPaths: string[];
  locations: DocumentLocation[];
  choices: { options: string[]; selected: number }[];
  state: "initial" | "running" | "previewing" | "paused";
  restarted?: boolean;
  simulation?: "none" | "simulating" | "success" | "fail";
}

export class GameExecutedMessage {
  static readonly method = "game/executed";
  static readonly type = new MessageProtocolNotificationType<
    GameExecutedMethod,
    GameExecutedParams
  >(GameExecutedMessage.method);
}

export namespace GameExecutedMessage {
  export interface Notification
    extends NotificationMessage<GameExecutedMethod, GameExecutedParams> {}
}
