import { MessageProtocolRequestType } from "../../../../protocol/classes/MessageProtocolRequestType";
import { RequestMessage } from "../../../../protocol/types/RequestMessage";
import { ResponseMessage } from "../../../../protocol/types/ResponseMessage";

export type SetGameSimulateChoicesMethod =
  typeof SetGameSimulateChoicesMessage.method;

export interface SetGameSimulateChoicesParams {
  simulateChoices: Record<string, number[]> | null;
}

export interface SetGameSimulateChoicesResult {
  simulateChoices: Record<string, number[]> | null;
}

export class SetGameSimulateChoicesMessage {
  static readonly method = "game/setSimulateChoices";
  static readonly type = new MessageProtocolRequestType<
    SetGameSimulateChoicesMethod,
    SetGameSimulateChoicesParams,
    SetGameSimulateChoicesResult
  >(SetGameSimulateChoicesMessage.method);
}

export namespace SetGameSimulateChoicesMessage {
  export interface Request
    extends RequestMessage<
      SetGameSimulateChoicesMethod,
      SetGameSimulateChoicesParams,
      SetGameSimulateChoicesResult
    > {}
  export interface Response
    extends ResponseMessage<
      SetGameSimulateChoicesMethod,
      SetGameSimulateChoicesResult
    > {}
}
