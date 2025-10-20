import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseMessage } from "@impower/jsonrpc/src/types/ResponseMessage";

export type FetchGameAssetMethod = typeof FetchGameAssetMessage.method;

export interface FetchGameAssetParams {
  path: string;
}

export interface FetchGameAssetResult {
  transfer: ArrayBuffer[];
}

export class FetchGameAssetMessage {
  static readonly method = "game/fetchAsset";
  static readonly type = new MessageProtocolRequestType<
    FetchGameAssetMethod,
    FetchGameAssetParams,
    FetchGameAssetResult
  >(FetchGameAssetMessage.method);
}

export namespace FetchGameAssetMessage {
  export interface Request
    extends RequestMessage<
      FetchGameAssetMethod,
      FetchGameAssetParams,
      FetchGameAssetResult
    > {}
  export interface Response
    extends ResponseMessage<FetchGameAssetMethod, FetchGameAssetResult> {}
}
