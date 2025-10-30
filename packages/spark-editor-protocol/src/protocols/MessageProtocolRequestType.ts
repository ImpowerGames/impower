import { ProtocolRequestType } from "vscode-languageserver-protocol";
import { ProgressResponseMessage } from "../types/base/ProgressResponseMessage";
import { ProgressValue } from "../types/base/ProgressValue";
import { RequestMessage } from "../types/base/RequestMessage";
import { ResponseError } from "../types/base/ResponseError";
import { ResponseMessage } from "../types/base/ResponseMessage";
import { isProgressResponse } from "../utils/isProgressResponse";
import { isRequest } from "../utils/isRequest";
import { isResponse } from "../utils/isResponse";

export class MessageProtocolRequestType<
  M extends string,
  P,
  R
> extends ProtocolRequestType<P, R, void, void, void> {
  constructor(method: M) {
    super(method);
  }
  uuid() {
    return crypto.randomUUID();
  }
  is(obj: any): obj is RequestMessage<M, P, R> {
    return isRequest(obj, this.method);
  }
  isRequest(obj: any): obj is RequestMessage<M, P, R> {
    return isRequest(obj, this.method);
  }
  isResponse(obj: any): obj is ResponseMessage<M, R> {
    return isResponse(obj, this.method);
  }
  isProgressResponse(obj: any): obj is ProgressResponseMessage<M> {
    return isProgressResponse(obj, this.method);
  }
  request(params: P): RequestMessage<M, P, R> {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id: this.uuid(),
      params,
    } as RequestMessage<M, P, R>;
  }
  progress(
    id: number | string,
    value: ProgressValue
  ): ProgressResponseMessage<M> {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id,
      value,
    } as ProgressResponseMessage<M>;
  }
  response(id: number | string, result: R): ResponseMessage<M, R> {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id,
      result,
    } as ResponseMessage<M, R>;
  }
  error(id: number | string, error: ResponseError): ResponseMessage<M, R> {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id,
      error,
    } as ResponseMessage<M, R>;
  }
  result(
    result: R,
    transfer?: ArrayBuffer[]
  ): { result: R; transfer?: ArrayBuffer[] } {
    return {
      result,
      transfer,
    };
  }
}
