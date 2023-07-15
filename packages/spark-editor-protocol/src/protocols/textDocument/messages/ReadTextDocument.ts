import {
  RequestMessage,
  ResponseMessage,
  TextDocumentIdentifier,
} from "../../../types";
import { uuid } from "../../../utils/uuid";

export interface ReadTextDocumentParams {
  /**
   * The document that should be read.
   */
  textDocument: TextDocumentIdentifier;
}

export type ReadTextDocumentMethod = typeof ReadTextDocument.method;

export interface ReadTextDocumentRequestMessage
  extends RequestMessage<ReadTextDocumentMethod, ReadTextDocumentParams> {
  params: ReadTextDocumentParams;
}

export interface ReadTextDocumentResponseMessage
  extends ResponseMessage<ReadTextDocumentMethod, string> {
  result: string;
}

export class ReadTextDocument {
  static readonly method = "textDocument/read";
  static isRequest(obj: any): obj is ReadTextDocumentRequestMessage {
    return obj.method === this.method && obj.result === undefined;
  }
  static isResponse(obj: any): obj is ReadTextDocumentResponseMessage {
    return obj.method === this.method && obj.result !== undefined;
  }
  static request(
    params: ReadTextDocumentParams
  ): ReadTextDocumentRequestMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id: uuid(),
      params,
    };
  }
  static response(
    id: number | string,
    result: string
  ): ReadTextDocumentResponseMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id,
      result,
    };
  }
}
