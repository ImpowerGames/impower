import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { SimulationFailure } from "@impower/sparkdown/src/compiler/types/SimulationFailure";
import type { DocumentLocation } from "../../types/DocumentLocation";
import type { ExecutedLines } from "../../types/ExecutedLines";
import type { PreviewRoute } from "../../types/PreviewRoute";

export type { ExecutedLines, PreviewRoute, SimulationFailure };

export type GameExecutedMethod = typeof GameExecutedMessage.method;

export interface GameExecutedParams {
  simulateFlow?: string | null;
  executedLines?: Record<string, ExecutedLines>;
  firstLocation?: DocumentLocation;
  lastLocation?: DocumentLocation;
  lastExecutedAddress?: ProgramAddress;
  conditions: { selected: boolean }[];
  choices: { options: string[]; selected: number }[];
  state: "initial" | "running" | "previewing" | "paused";
  restarted?: boolean;
  simulation?: "none" | "simulating" | "success" | "fail";
  simulationFailure?: SimulationFailure;
  simulateLocation?: DocumentLocation;
  startLocation?: DocumentLocation;
  route?: PreviewRoute;
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
