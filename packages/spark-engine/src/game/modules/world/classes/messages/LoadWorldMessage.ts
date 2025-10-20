import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { LoadWorldParams } from "../../types/LoadWorldParams";

export type LoadWorldMethod = typeof LoadWorldMessage.method;

export class LoadWorldMessage {
  static readonly method = "world/load";
  static readonly type = new MessageProtocolRequestType<
    LoadWorldMethod,
    LoadWorldParams,
    LoadWorldParams
  >(LoadWorldMessage.method);
}

export interface LoadWorldMessageMap extends Record<string, [any, any]> {
  [LoadWorldMessage.method]: [
    ReturnType<typeof LoadWorldMessage.type.request>,
    ReturnType<typeof LoadWorldMessage.type.response>
  ];
}
