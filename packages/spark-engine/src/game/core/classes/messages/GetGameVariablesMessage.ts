import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type { Variable } from "../../types/Variable";

export type GetGameVariablesMethod = typeof GetGameVariablesMessage.method;

export interface GetGameVariablesParams {
  scope: "vars" | "defines" | "temps" | "children" | "value";
  value?: any;
  variablesReference?: number;
  threadId?: number;
  frameId?: number;
}

export interface GetGameVariablesResult {
  variables: Variable[];
}

export class GetGameVariablesMessage {
  static readonly method = "game/variables";
  static readonly type = new MessageProtocolRequestType<
    GetGameVariablesMethod,
    GetGameVariablesParams,
    GetGameVariablesResult
  >(GetGameVariablesMessage.method);
}

export namespace GetGameVariablesMessage {
  export interface Request extends RequestMessage<
    GetGameVariablesMethod,
    GetGameVariablesParams,
    GetGameVariablesResult
  > {}
  export type Response = ResponseMessage<
    GetGameVariablesMethod,
    GetGameVariablesResult
  >;
}
