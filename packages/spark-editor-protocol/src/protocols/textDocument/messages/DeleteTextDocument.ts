import { TextDocumentIdentifier } from "../../../types";
import { MessageProtocolRequestType } from "../../MessageProtocolRequestType";

export type DeleteTextDocumentMethod = typeof DeleteTextDocument.method;

export interface DeleteTextDocumentParams {
  /**
   * The document that should be deleted.
   */
  textDocument: TextDocumentIdentifier;
}

export abstract class DeleteTextDocument {
  static readonly method = "textDocument/delete";
  static readonly type = new MessageProtocolRequestType<
    DeleteTextDocumentMethod,
    DeleteTextDocumentParams,
    null
  >(DeleteTextDocument.method);
}
