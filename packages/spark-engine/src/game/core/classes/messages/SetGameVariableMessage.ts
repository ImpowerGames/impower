import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type { Variable } from "../../types/Variable";

export type SetGameVariableMethod = typeof SetGameVariableMessage.method;

export interface SetGameVariableParams {
  scope: "vars" | "temps";
  name: string;
  value: string;
  threadId?: number;
  frameId?: number;
}

export interface SetGameVariableResult {
  variable: Variable;
}

export class SetGameVariableMessage {
  static readonly method = "game/setVariable";
  static readonly type = new MessageProtocolRequestType<
    SetGameVariableMethod,
    SetGameVariableParams,
    SetGameVariableResult
  >(SetGameVariableMessage.method);
}

export namespace SetGameVariableMessage {
  export interface Request extends RequestMessage<
    SetGameVariableMethod,
    SetGameVariableParams,
    SetGameVariableResult
  > {}
  export type Response = ResponseMessage<
    SetGameVariableMethod,
    SetGameVariableResult
  >;
}
