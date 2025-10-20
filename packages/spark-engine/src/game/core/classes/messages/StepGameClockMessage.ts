import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";

export type StepGameClockMethod = typeof StepGameClockMessage.method;

export interface StepGameClockParams {
  seconds: number;
}

export interface StepGameClockResult {}

export class StepGameClockMessage {
  static readonly method = "game/stepClock";
  static readonly type = new MessageProtocolRequestType<
    StepGameClockMethod,
    StepGameClockParams,
    StepGameClockResult
  >(StepGameClockMessage.method);
}

export namespace StepGameClockMessage {
  export interface Request
    extends RequestMessage<
      StepGameClockMethod,
      StepGameClockParams,
      StepGameClockResult
    > {}
  export interface Response
    extends ResponseMessage<StepGameClockMethod, StepGameClockResult> {}
}
