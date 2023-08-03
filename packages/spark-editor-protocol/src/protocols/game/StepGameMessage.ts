import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type StepGameMethod = typeof StepGameMessage.method;

export interface StepGameParams {
  deltaMS: number;
}

export namespace StepGameMessage {
  export const method = "game/step";
  export const type = new MessageProtocolRequestType<
    StepGameMethod,
    StepGameParams,
    null
  >(StepGameMessage.method);
}
