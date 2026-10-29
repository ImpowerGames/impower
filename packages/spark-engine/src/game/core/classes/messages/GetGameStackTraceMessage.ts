import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import { type StackFrame } from "../../types/StackFrame";

export type GetGameStackTraceMethod = typeof GetGameStackTraceMessage.method;

export interface GetGameStackTraceParams {
  threadId: number;
  startFrame?: number;
  levels?: number;
}

export interface GetGameStackTraceResult {
  stackFrames: StackFrame[];

  totalFrames?: number;
}

export class GetGameStackTraceMessage {
  static readonly method = "game/stackTrace";
  static readonly type = new MessageProtocolRequestType<
    GetGameStackTraceMethod,
    GetGameStackTraceParams,
    GetGameStackTraceResult
  >(GetGameStackTraceMessage.method);
}

export namespace GetGameStackTraceMessage {
  export interface Request extends RequestMessage<
    GetGameStackTraceMethod,
    GetGameStackTraceParams,
    GetGameStackTraceResult
  > {}
  export type Response = ResponseMessage<
    GetGameStackTraceMethod,
    GetGameStackTraceResult
  >;
}
