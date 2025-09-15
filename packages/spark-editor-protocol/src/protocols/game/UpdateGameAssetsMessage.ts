import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type UpdateGameAssetsMethod = typeof UpdateGameAssetsMessage.method;

export interface UpdateGameAssetsParams {
  update: { uri: string; data: ArrayBuffer }[];
  delete: { uri: string }[];
}

export class UpdateGameAssetsMessage {
  static readonly method = "game/updateAssets";
  static readonly type = new MessageProtocolRequestType<
    UpdateGameAssetsMethod,
    UpdateGameAssetsParams,
    {}
  >(UpdateGameAssetsMessage.method);
}
