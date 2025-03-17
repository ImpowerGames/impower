import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type StepGameMethod = typeof StepGameMessage.method;

export interface StepGameParams {
  traversal: "in" | "out" | "over";
  reverse?: boolean;
}

export interface StepGameResult {}

export class StepGameMessage {
  static readonly method = "game/step";
  static readonly type = new MessageProtocolRequestType<
    StepGameMethod,
    StepGameParams,
    StepGameResult
  >(StepGameMessage.method);
}

export namespace StepGameMessage {
  export interface Request
    extends RequestMessage<StepGameMethod, StepGameParams, StepGameResult> {}
  export interface Response
    extends ResponseMessage<StepGameMethod, StepGameResult> {}
}
