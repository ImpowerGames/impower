import { Breakpoint } from "../../../../spark-engine/src/game/core/types/Breakpoint";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

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
