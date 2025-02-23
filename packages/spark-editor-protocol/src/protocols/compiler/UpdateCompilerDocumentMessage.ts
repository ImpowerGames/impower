import { type DidChangeTextDocumentParams } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type UpdateCompilerDocumentMethod =
  typeof UpdateCompilerDocumentMessage.method;

export interface UpdateCompilerDocumentParams
  extends DidChangeTextDocumentParams {}

export class UpdateCompilerDocumentMessage {
  static readonly method = "compiler/updateDocument";
  static readonly type = new MessageProtocolRequestType<
    UpdateCompilerDocumentMethod,
    UpdateCompilerDocumentParams,
    string
  >(UpdateCompilerDocumentMessage.method);
}
