import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { SimulationFailure } from "@impower/sparkdown/src/compiler/types/SimulationFailure";
import type { DocumentLocation } from "../../types/DocumentLocation";
import type { ExecutedLines } from "../../types/ExecutedLines";

export type { ExecutedLines, SimulationFailure };

export type GameExecutedMethod = typeof GameExecutedMessage.method;

export interface GameExecutedParams {
  simulatePath?: string | null;
  startPath?: string | null;
  /** The lines the executed paths cover, by script uri. Absent from the
   *  report of a displayed suggestion. */
  executedLines?: Record<string, ExecutedLines>;
  /** The location of the first executed path that has one. */
  firstLocation?: DocumentLocation;
  /** The location of the last executed path that has one. */
  lastLocation?: DocumentLocation;
  /** The last path executed, located or not. Absent from the report of a
   *  displayed suggestion. */
  lastExecutedPath?: string;
  /** Empty in the report of a displayed suggestion. */
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
