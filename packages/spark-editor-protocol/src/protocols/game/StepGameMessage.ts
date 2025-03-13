import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type StepGameMethod = typeof StepGameMessage.method;

export interface StepGameParams {
  traversal: "in" | "out" | "over";
  reverse?: boolean;
}

export class StepGameMessage {
  static readonly method = "game/step";
  static readonly type = new MessageProtocolRequestType<
    StepGameMethod,
    StepGameParams,
    null
  >(StepGameMessage.method);
}
