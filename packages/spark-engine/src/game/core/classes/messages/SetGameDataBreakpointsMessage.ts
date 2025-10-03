import { MessageProtocolRequestType } from "../../../../protocol/classes/MessageProtocolRequestType";
import { RequestMessage } from "../../../../protocol/types/RequestMessage";
import { ResponseMessage } from "../../../../protocol/types/ResponseMessage";
import { Breakpoint } from "../../types/Breakpoint";

export type SetGameDataBreakpointsMethod =
  typeof SetGameDataBreakpointsMessage.method;

export interface SetGameDataBreakpointsParams {
  dataBreakpoints: { dataId: string }[];
}

export interface SetGameDataBreakpointsResult {
  dataBreakpoints: Breakpoint[];
}

export class SetGameDataBreakpointsMessage {
  static readonly method = "game/setDataBreakpoints";
  static readonly type = new MessageProtocolRequestType<
    SetGameDataBreakpointsMethod,
    SetGameDataBreakpointsParams,
    SetGameDataBreakpointsResult
  >(SetGameDataBreakpointsMessage.method);
}

export namespace SetGameDataBreakpointsMessage {
  export interface Request
    extends RequestMessage<
      SetGameDataBreakpointsMethod,
      SetGameDataBreakpointsParams,
      SetGameDataBreakpointsResult
    > {}
  export interface Response
    extends ResponseMessage<
      SetGameDataBreakpointsMethod,
      SetGameDataBreakpointsResult
    > {}
}
