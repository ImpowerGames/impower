import { RequestMessage } from "../types/RequestMessage";
import { ResponseError } from "../types/ResponseError";
import { ResponseMessage } from "../types/ResponseMessage";
import { uuid } from "../utils/uuid";

export class MessageProtocolRequestType<M extends string, P, R> {
  method: string;

  constructor(method: M) {
    this.method = method;
  }

  isRequest(obj: any): obj is RequestMessage<M, P> {
    return (
      obj.method === this.method &&
      obj.id !== undefined &&
      obj.result === undefined &&
      obj.error === undefined
    );
  }

  isResponse(obj: any): obj is ResponseMessage<M, R> {
    return (
      obj.method === this.method &&
      obj.id !== undefined &&
      (obj.result !== undefined || obj.error !== undefined)
    );
  }

  request(params: P): RequestMessage<M, P, R> {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id: uuid(),
      params,
    } as RequestMessage<M, P, R>;
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
