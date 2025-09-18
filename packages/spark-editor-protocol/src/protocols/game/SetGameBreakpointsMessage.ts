import { Breakpoint } from "../../../../spark-engine/src/game/core/types/Breakpoint";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

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
