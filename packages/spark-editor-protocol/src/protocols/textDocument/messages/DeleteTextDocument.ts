import {
  RequestMessage,
  ResponseMessage,
  TextDocumentIdentifier,
} from "../../../types";
import { RequestProtocolType } from "../../RequestProtocolType";

export interface DeleteTextDocumentParams {
  /**
   * The document that should be deleted.
   */
  textDocument: TextDocumentIdentifier;
}

export type DeleteTextDocumentMethod = typeof DeleteTextDocument.type.method;

export interface DeleteTextDocumentRequestMessage
  extends RequestMessage<DeleteTextDocumentMethod, DeleteTextDocumentParams> {
  params: DeleteTextDocumentParams;
}

export interface DeleteTextDocumentResponseMessage
  extends ResponseMessage<DeleteTextDocumentMethod, null> {
  result: null;
}

class DeleteTextDocumentProtocolType extends RequestProtocolType<
  DeleteTextDocumentRequestMessage,
  DeleteTextDocumentResponseMessage,
  DeleteTextDocumentParams
> {
  method = "textDocument/delete";
}

export abstract class DeleteTextDocument {
  static readonly type = new DeleteTextDocumentProtocolType();
}
