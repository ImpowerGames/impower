import {
  RequestMessage,
  ResponseMessage,
  TextDocumentIdentifier,
} from "../../../types";
import { uuid } from "../../../utils/uuid";

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

export type WriteTextDocumentMethod = typeof WriteTextDocument.method;

export interface WriteTextDocumentRequestMessage
  extends RequestMessage<WriteTextDocumentMethod, WriteTextDocumentParams> {
  params: WriteTextDocumentParams;
}

export interface WriteTextDocumentResponseMessage
  extends ResponseMessage<WriteTextDocumentMethod, null> {
  result: null;
}

export class WriteTextDocument {
  static readonly method = "textDocument/write";
  static isRequest(obj: any): obj is WriteTextDocumentRequestMessage {
    return obj.method === this.method && obj.result === undefined;
  }
  static isResponse(obj: any): obj is WriteTextDocumentResponseMessage {
    return obj.method === this.method && obj.result !== undefined;
  }
  static request(
    params: WriteTextDocumentParams
  ): WriteTextDocumentRequestMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id: uuid(),
      params,
    };
  }
  static response(id: number | string): WriteTextDocumentResponseMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id,
      result: null,
    };
  }
}
