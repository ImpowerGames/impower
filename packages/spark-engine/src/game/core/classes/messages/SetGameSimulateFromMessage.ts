import { MessageProtocolRequestType } from "../../../../protocol/classes/MessageProtocolRequestType";
import { RequestMessage } from "../../../../protocol/types/RequestMessage";
import { ResponseMessage } from "../../../../protocol/types/ResponseMessage";

export type SetGameSimulateFromMethod =
  typeof SetGameSimulateFromMessage.method;

export interface SetGameSimulateFromParams {
  simulateFrom: { file: string; line: number };
}

export interface SetGameSimulateFromResult {
  simulateFrom: { file: string; line: number };
}

export class SetGameSimulateFromMessage {
  static readonly method = "game/setSimulateFrom";
  static readonly type = new MessageProtocolRequestType<
    SetGameSimulateFromMethod,
    SetGameSimulateFromParams,
    SetGameSimulateFromResult
  >(SetGameSimulateFromMessage.method);
}

export namespace SetGameSimulateFromMessage {
  export interface Request
    extends RequestMessage<
      SetGameSimulateFromMethod,
      SetGameSimulateFromParams,
      SetGameSimulateFromResult
    > {}
  export interface Response
    extends ResponseMessage<
      SetGameSimulateFromMethod,
      SetGameSimulateFromResult
    > {}
}
