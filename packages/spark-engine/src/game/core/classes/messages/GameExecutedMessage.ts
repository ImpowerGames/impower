import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { SimulationFailure } from "@impower/sparkdown/src/compiler/types/SimulationFailure";
import type { DocumentLocation } from "../../types/DocumentLocation";
import type { ExecutedLines } from "../../types/ExecutedLines";

export type { ExecutedLines, SimulationFailure };

export type GameExecutedMethod = typeof GameExecutedMessage.method;

export interface GameExecutedParams {
  /** The flow the route to the start point starts at the top of: a scene's
   *  name, or `"0"` for the top-level content, which keys the choices and
   *  conditions a route favors. */
  simulateFlow?: string | null;
  /** The lines the executed positions cover, by script uri. Absent from the
   *  report of a displayed suggestion. */
  executedLines?: Record<string, ExecutedLines>;
  /** The location of the first executed position that has one. */
  firstLocation?: DocumentLocation;
  /** The location of the last executed position that has one. */
  lastLocation?: DocumentLocation;
  /** The address of the last position executed, located or not, which is
   *  opaque (`ProgramLocator`): a host compares it with another, or asks
   *  where it is. Absent from the report of a displayed suggestion. */
  lastExecutedAddress?: ProgramAddress;
  /** Empty in the report of a displayed suggestion. */
  conditions: { selected: boolean }[];
  choices: { options: string[]; selected: number }[];
  state: "initial" | "running" | "previewing" | "paused";
  restarted?: boolean;
  simulation?: "none" | "simulating" | "success" | "fail";
  /** Only meaningful alongside `simulation: "fail"`, and always sent with it. */
  simulationFailure?: SimulationFailure;
  /** Where the route that failed was to start (the flow `simulateFlow`
   *  names) and to end (the start point), sent with `simulation: "fail"`, for
   *  a page that labels the failure and holds no program. */
  simulateLocation?: DocumentLocation;
  startLocation?: DocumentLocation;
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
