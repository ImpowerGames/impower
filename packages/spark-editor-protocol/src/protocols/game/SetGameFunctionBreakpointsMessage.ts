import { Breakpoint } from "../../../../spark-engine/src/game/core/types/Breakpoint";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SetGameFunctionBreakpointsMethod =
  typeof SetGameFunctionBreakpointsMessage.method;

export interface SetGameFunctionBreakpointsParams {
  functionBreakpoints: { name: string }[];
}

export interface SetGameFunctionBreakpointsResult {
  functionBreakpoints: Breakpoint[];
}

export class SetGameFunctionBreakpointsMessage {
  static readonly method = "game/setFunctionBreakpoints";
  static readonly type = new MessageProtocolRequestType<
    SetGameFunctionBreakpointsMethod,
    SetGameFunctionBreakpointsParams,
    SetGameFunctionBreakpointsResult
  >(SetGameFunctionBreakpointsMessage.method);
}

export namespace SetGameFunctionBreakpointsMessage {
  export interface Request
    extends RequestMessage<
      SetGameFunctionBreakpointsMethod,
      SetGameFunctionBreakpointsParams,
      SetGameFunctionBreakpointsResult
    > {}
  export interface Response
    extends ResponseMessage<
      SetGameFunctionBreakpointsMethod,
      SetGameFunctionBreakpointsResult
    > {}
}
