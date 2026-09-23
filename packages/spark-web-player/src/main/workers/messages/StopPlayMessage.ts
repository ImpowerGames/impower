import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";

export type StopPlayMethod = typeof StopPlayMessage.method;

export interface StopPlayResult {
  /** Where PLAY's game last executed, read before it went. */
  location: DocumentLocation | null;
}

/** End PLAY's game in the worker. */
export class StopPlayMessage {
  static readonly method = "player/stopPlay";
  static readonly type = new MessageProtocolRequestType<
    StopPlayMethod,
    {},
    StopPlayResult
  >(StopPlayMessage.method);
}

export namespace StopPlayMessage {
  export interface Request
    extends RequestMessage<StopPlayMethod, {}, StopPlayResult> {}
}
