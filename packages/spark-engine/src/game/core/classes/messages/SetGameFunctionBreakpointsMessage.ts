import { MessageProtocolRequestType } from "../../../../protocol/classes/MessageProtocolRequestType";
import { RequestMessage } from "../../../../protocol/types/RequestMessage";
import { ResponseMessage } from "../../../../protocol/types/ResponseMessage";
import { Breakpoint } from "../../types/Breakpoint";

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
