import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type DeleteSavesMethod = typeof DeleteSavesMessage.method;

export interface DeleteSavesParams {
  ids: string[];
}

export interface DeleteSavesResult {}

export class DeleteSavesMessage {
  static readonly method = "preview/deleteSaves";
  static readonly type = new MessageProtocolRequestType<
    DeleteSavesMethod,
    DeleteSavesParams,
    DeleteSavesResult
  >(DeleteSavesMessage.method);
}

export namespace DeleteSavesMessage {
  export interface Request extends RequestMessage<
    DeleteSavesMethod,
    DeleteSavesParams,
    DeleteSavesResult
  > {}
  export type Response = ResponseMessage<DeleteSavesMethod, DeleteSavesResult>;
}
