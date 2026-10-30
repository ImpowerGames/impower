import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";

export type StopPlayMethod = typeof StopPlayMessage.method;

export interface StopPlayParams {
  run?: number;
}

export interface StopPlayResult {
  location: DocumentLocation | null;
  choices?: number;
}

export class StopPlayMessage {
  static readonly method = "player/stopPlay";
  static readonly type = new MessageProtocolRequestType<
    StopPlayMethod,
    StopPlayParams,
    StopPlayResult
  >(StopPlayMessage.method);
}

export namespace StopPlayMessage {
  export interface Request
    extends RequestMessage<StopPlayMethod, StopPlayParams, StopPlayResult> {}
}
