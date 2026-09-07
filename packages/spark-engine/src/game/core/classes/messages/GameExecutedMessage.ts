import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { SimulationFailure } from "@impower/sparkdown/src/compiler/types/SimulationFailure";
import type { DocumentLocation } from "../../types/DocumentLocation";

export type { SimulationFailure };

export type GameExecutedMethod = typeof GameExecutedMessage.method;

export interface GameExecutedParams {
  simulatePath?: string | null;
  startPath?: string | null;
  executedPaths: string[];
  locations: DocumentLocation[];
  conditions: { selected: boolean }[];
  choices: { options: string[]; selected: number }[];
  state: "initial" | "running" | "previewing" | "paused";
  restarted?: boolean;
  simulation?: "none" | "simulating" | "success" | "fail";
  /** Only meaningful alongside `simulation: "fail"`, and always sent with it. */
  simulationFailure?: SimulationFailure;
}

export class GameExecutedMessage {
  static readonly method = "game/executed";
  static readonly type = new MessageProtocolNotificationType<
    GameExecutedMethod,
    GameExecutedParams
  >(GameExecutedMessage.method);
}

export namespace GameExecutedMessage {
  export interface Notification extends NotificationMessage<
    GameExecutedMethod,
    GameExecutedParams
  > {}
}
