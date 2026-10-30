import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { SimulationError } from "@impower/sparkdown/src/compiler/types/SimulationError";

export type PlayMethod = typeof PlayMessage.method;

export interface PlayParams {
  program: string;
  startFrom?: { file: string; line: number };
  restarted?: boolean;
}

export interface PlayResult {
  built: boolean;
  compiled?: boolean;
  run?: number;
  errors?: SimulationError[];
}

export class PlayMessage {
  static readonly method = "player/play";
  static readonly type = new MessageProtocolRequestType<
    PlayMethod,
    PlayParams,
    PlayResult
  >(PlayMessage.method);
}

export namespace PlayMessage {
  export interface Request
    extends RequestMessage<PlayMethod, PlayParams, PlayResult> {}
}
