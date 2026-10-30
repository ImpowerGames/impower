import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ChangeStartingValuesMethod =
  typeof ChangeStartingValuesMessage.method;

export interface ChangeStartingValuesParams {
  start: string;
  changes: Record<string, string | null>;
}

export interface ChangeStartingValuesResult {}

export class ChangeStartingValuesMessage {
  static readonly method = "preview/changeStartingValues";
  static readonly type = new MessageProtocolRequestType<
    ChangeStartingValuesMethod,
    ChangeStartingValuesParams,
    ChangeStartingValuesResult
  >(ChangeStartingValuesMessage.method);
}

export namespace ChangeStartingValuesMessage {
  export interface Request extends RequestMessage<
    ChangeStartingValuesMethod,
    ChangeStartingValuesParams,
    ChangeStartingValuesResult
  > {}
  export type Response = ResponseMessage<
    ChangeStartingValuesMethod,
    ChangeStartingValuesResult
  >;
}
