import { MessageProtocolRequestType } from "../../../../protocol/classes/MessageProtocolRequestType";
import { RequestMessage } from "../../../../protocol/types/RequestMessage";
import { ResponseMessage } from "../../../../protocol/types/ResponseMessage";
import { Breakpoint } from "../../types/Breakpoint";

export type SetGameBreakpointsMethod = typeof SetGameBreakpointsMessage.method;

export interface SetGameBreakpointsParams {
  breakpoints: { file: string; line: number }[];
}

export interface SetGameBreakpointsResult {
  breakpoints: Breakpoint[];
}

export class SetGameBreakpointsMessage {
  static readonly method = "game/setBreakpoints";
  static readonly type = new MessageProtocolRequestType<
    SetGameBreakpointsMethod,
    SetGameBreakpointsParams,
    SetGameBreakpointsResult
  >(SetGameBreakpointsMessage.method);
}

export namespace SetGameBreakpointsMessage {
  export interface Request
    extends RequestMessage<
      SetGameBreakpointsMethod,
      SetGameBreakpointsParams,
      SetGameBreakpointsResult
    > {}
  export interface Response
    extends ResponseMessage<
      SetGameBreakpointsMethod,
      SetGameBreakpointsResult
    > {}
}
