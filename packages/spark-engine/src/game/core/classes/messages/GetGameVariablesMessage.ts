import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import { Variable } from "../../types/Variable";

export type GetGameVariablesMethod = typeof GetGameVariablesMessage.method;

export interface GetGameVariablesParams {
  scope: "vars" | "lists" | "defines" | "temps" | "children" | "value";
  /**
   * The variable for which to retrieve its children.
   * The `variablesReference` must have been obtained in the current suspended state.
   * */
  value?: any;
  variablesReference?: number;
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
  export interface Request
    extends RequestMessage<
      GetGameVariablesMethod,
      GetGameVariablesParams,
      GetGameVariablesResult
    > {}
  export interface Response
    extends ResponseMessage<GetGameVariablesMethod, GetGameVariablesResult> {}
}
