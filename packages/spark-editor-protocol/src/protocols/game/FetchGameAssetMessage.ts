import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

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
