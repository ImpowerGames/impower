import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";
import type { DidChangeTextDocumentParams } from "../../types/DidChangeTextDocumentParams";

export type UpdateCompilerDocumentMethod =
  typeof UpdateCompilerDocumentMessage.method;

export interface UpdateCompilerDocumentParams extends DidChangeTextDocumentParams {}

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
  export interface Request extends RequestMessage<
    UpdateCompilerDocumentMethod,
    UpdateCompilerDocumentParams,
    UpdateCompilerDocumentResult
  > {}
  export interface Response extends ResponseMessage<
    UpdateCompilerDocumentMethod,
    UpdateCompilerDocumentResult
  > {}
}
