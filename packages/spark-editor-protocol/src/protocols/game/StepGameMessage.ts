import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type StepGameMethod = typeof StepGameMessage.method;

export interface StepGameParams {
  deltaMS: number;
}

export class StepGameMessage {
  static readonly method = "game/step";
  static readonly type = new MessageProtocolRequestType<
    StepGameMethod,
    StepGameParams,
    null
  >(StepGameMessage.method);
}
