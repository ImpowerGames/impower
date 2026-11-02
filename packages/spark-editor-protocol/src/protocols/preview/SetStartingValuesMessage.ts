import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SetStartingValuesMethod = typeof SetStartingValuesMessage.method;

export type StartingValuesParams = Record<string, Record<string, string>>;

export interface SetStartingValuesParams {
  values: StartingValuesParams;
}

export interface SetStartingValuesResult {}

export class SetStartingValuesMessage {
  static readonly method = "preview/setStartingValues";
  static readonly type = new MessageProtocolRequestType<
    SetStartingValuesMethod,
    SetStartingValuesParams,
    SetStartingValuesResult
  >(SetStartingValuesMessage.method);
}

export namespace SetStartingValuesMessage {
  export interface Request extends RequestMessage<
    SetStartingValuesMethod,
    SetStartingValuesParams,
    SetStartingValuesResult
  > {}
  export type Response = ResponseMessage<
    SetStartingValuesMethod,
    SetStartingValuesResult
  >;
}
