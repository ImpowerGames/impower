import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

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
