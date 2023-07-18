import {
  RequestMessage,
  ResponseMessage,
  TextDocumentIdentifier,
} from "../../../types";
import { RequestProtocolType } from "../../RequestProtocolType";

export interface WriteTextDocumentParams {
  /**
   * The document that should be written.
   */
  textDocument: TextDocumentIdentifier;
  /**
   * The content to write.
   */
  text: string;
}

export type WriteTextDocumentMethod = typeof WriteTextDocument.type.method;

export interface WriteTextDocumentRequestMessage
  extends RequestMessage<WriteTextDocumentMethod, WriteTextDocumentParams> {
  params: WriteTextDocumentParams;
}

export interface WriteTextDocumentResponseMessage
  extends ResponseMessage<WriteTextDocumentMethod, null> {
  result: null;
}

class WriteTextDocumentProtocolType extends RequestProtocolType<
  WriteTextDocumentRequestMessage,
  WriteTextDocumentResponseMessage,
  WriteTextDocumentParams
> {
  method = "textDocument/write";
}

export abstract class WriteTextDocument {
  static readonly type = new WriteTextDocumentProtocolType();
}
