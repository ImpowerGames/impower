import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";
import { type StackFrame } from "../../types/StackFrame";

export type GetGameStackTraceMethod = typeof GetGameStackTraceMessage.method;

export interface GetGameStackTraceParams {
  /** Retrieve the stacktrace for this thread. */
  threadId: number;
  /** The index of the first frame to return; if omitted frames start at 0. */
  startFrame?: number;
  /** The maximum number of frames to return. If levels is not specified or 0, all frames are returned. */
  levels?: number;
}

export interface GetGameStackTraceResult {
  /**
   * The frames of the stack frame. If the array has length zero, there are no
   * stack frames available.
   * This means that there is no location information available.
   */
  stackFrames: StackFrame[];

  /**
   * The total number of frames available in the stack. If omitted or if
   * `totalFrames` is larger than the available frames, a client is expected
   * to request frames until a request returns less frames than requested
   * (which indicates the end of the stack). Returning monotonically
   * increasing `totalFrames` values for subsequent requests can be used to
   * enforce paging in the client.
   */
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
  export interface Request
    extends RequestMessage<
      GetGameStackTraceMethod,
      GetGameStackTraceParams,
      GetGameStackTraceResult
    > {}
  export interface Response
    extends ResponseMessage<GetGameStackTraceMethod, GetGameStackTraceResult> {}
}
