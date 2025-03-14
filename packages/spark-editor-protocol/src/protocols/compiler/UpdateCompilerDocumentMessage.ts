import type * as LSP from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type UpdateCompilerDocumentMethod =
  typeof UpdateCompilerDocumentMessage.method;

export interface UpdateCompilerDocumentParams
  extends LSP.DidChangeTextDocumentParams {}

export class UpdateCompilerDocumentMessage {
  static readonly method = "compiler/updateDocument";
  static readonly type = new MessageProtocolRequestType<
    UpdateCompilerDocumentMethod,
    UpdateCompilerDocumentParams,
    boolean
  >(UpdateCompilerDocumentMessage.method);
}
