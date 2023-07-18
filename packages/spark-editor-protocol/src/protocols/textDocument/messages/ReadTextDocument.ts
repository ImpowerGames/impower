import {
  RequestMessage,
  ResponseMessage,
  TextDocumentIdentifier,
} from "../../../types";
import { RequestProtocolType } from "../../RequestProtocolType";

export interface ReadTextDocumentParams {
  /**
   * The document that should be read.
   */
  textDocument: TextDocumentIdentifier;
}

export type ReadTextDocumentMethod = typeof ReadTextDocument.type.method;

export interface ReadTextDocumentRequestMessage
  extends RequestMessage<ReadTextDocumentMethod, ReadTextDocumentParams> {
  params: ReadTextDocumentParams;
}

export interface ReadTextDocumentResponseMessage
  extends ResponseMessage<ReadTextDocumentMethod, string> {
  result: string;
}

class ReadTextDocumentProtocolType extends RequestProtocolType<
  ReadTextDocumentRequestMessage,
  ReadTextDocumentResponseMessage,
  ReadTextDocumentParams
> {
  method = "textDocument/read";
  override response(
    id: number | string,
    result: string
  ): ReadTextDocumentResponseMessage {
    return {
      ...super.response(id),
      result,
    };
  }
}

export abstract class ReadTextDocument {
  static readonly type = new ReadTextDocumentProtocolType();
}
