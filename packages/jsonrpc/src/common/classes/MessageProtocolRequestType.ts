import { ProgressResponseMessage } from "../types/ProgressResponseMessage";
import { ProgressValue } from "../types/ProgressValue";
import { RequestMessage } from "../types/RequestMessage";
import { ResponseError } from "../types/ResponseError";
import { ResponseMessage } from "../types/ResponseMessage";
import { isProgressResponse } from "../utils/isProgressResponse";
import { isRequest } from "../utils/isRequest";
import { isResponse } from "../utils/isResponse";
import { uuid } from "../utils/uuid";

export class MessageProtocolRequestType<M extends string, P, R> {
  method: string;

  constructor(method: M) {
    this.method = method;
  }

  is(obj: any): obj is RequestMessage<M, P, R> {
    return this.isRequest(obj);
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
      id: uuid(),
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
