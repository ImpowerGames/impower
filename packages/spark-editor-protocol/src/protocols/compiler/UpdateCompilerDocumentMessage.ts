import type * as LSP from "../../types";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type UpdateCompilerDocumentMethod =
  typeof UpdateCompilerDocumentMessage.method;

export interface UpdateCompilerDocumentParams
  extends LSP.DidChangeTextDocumentParams {}

export type UpdateCompilerDocumentResult = boolean;

export class UpdateCompilerDocumentMessage {
  static readonly method = "compiler/updateDocument";
  static readonly type = new MessageProtocolRequestType<
    UpdateCompilerDocumentMethod,
    UpdateCompilerDocumentParams,
    UpdateCompilerDocumentResult
  >(UpdateCompilerDocumentMessage.method);
}

export namespace UpdateCompilerDocumentMessage {
  export interface Request
    extends RequestMessage<
      UpdateCompilerDocumentMethod,
      UpdateCompilerDocumentParams,
      UpdateCompilerDocumentResult
    > {}
  export interface Response
    extends ResponseMessage<
      UpdateCompilerDocumentMethod,
      UpdateCompilerDocumentResult
    > {}
}
