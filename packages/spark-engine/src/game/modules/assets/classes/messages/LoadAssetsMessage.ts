import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import { type LoadAssetsParams } from "../../types/LoadAssetsParams";
import { type LoadAssetsResult } from "../../types/LoadAssetsResult";

export type LoadAssetsMethod = typeof LoadAssetsMessage.method;

/** Make these items resident and answer once every one has loaded or failed. */
export class LoadAssetsMessage {
  static readonly method = "assets/load";
  static readonly type = new MessageProtocolRequestType<
    LoadAssetsMethod,
    LoadAssetsParams,
    LoadAssetsResult
  >(LoadAssetsMessage.method);
}

export interface LoadAssetsMessageMap extends Record<string, [any, any]> {
  [LoadAssetsMessage.method]: [
    ReturnType<typeof LoadAssetsMessage.type.request>,
    ReturnType<typeof LoadAssetsMessage.type.response>,
  ];
}
