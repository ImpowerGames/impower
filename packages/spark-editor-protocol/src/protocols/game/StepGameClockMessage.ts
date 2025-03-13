import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type StepGameClockMethod = typeof StepGameClockMessage.method;

export interface StepGameClockParams {
  deltaMS: number;
}

export class StepGameClockMessage {
  static readonly method = "game/stepClock";
  static readonly type = new MessageProtocolRequestType<
    StepGameClockMethod,
    StepGameClockParams,
    null
  >(StepGameClockMessage.method);
}
