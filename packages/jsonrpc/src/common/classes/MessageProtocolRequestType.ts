import type { ProgressResponseMessage } from "../types/ProgressResponseMessage";
import type { ProgressValue } from "../types/ProgressValue";
import type { RequestMessage } from "../types/RequestMessage";
import type { ResponseError } from "../types/ResponseError";
import type {
  ResponseMessage,
  InvalidResponseMessage,
} from "../types/ResponseMessage";
import { isProgressResponse } from "../utils/isProgressResponse";
import { isRequest } from "../utils/isRequest";
import { isResponse } from "../utils/isResponse";
import { uuid } from "../utils/uuid";

export class MessageProtocolRequestType<M extends string, P, R> {
  constructor(public method: M) {}

  uuid() {
    return uuid();
  }

  is(obj: unknown): obj is RequestMessage<M, P, R> {
    return this.isRequest(obj);
  }

  isRequest(obj: unknown): obj is RequestMessage<M, P, R> {
    return isRequest(obj, this.method);
  }

  isResponse(obj: unknown, id?: string | number): obj is ResponseMessage<M, R> {
    return isResponse(obj, this.method, id);
  }

  isProgressResponse(
    obj: unknown,
    id?: string | number,
  ): obj is ProgressResponseMessage<M> {
    return isProgressResponse(obj, this.method, id);
  }

  request(params: P): RequestMessage<M, P, R> {
    return { jsonrpc: "2.0", method: this.method, id: this.uuid(), params };
  }

  progress(
    id: number | string,
    value: ProgressValue,
  ): ProgressResponseMessage<M> {
    return { jsonrpc: "2.0", method: `${this.method}/progress`, id, value };
  }

  response(id: number | string, result: R): ResponseMessage<M, R> {
    return { jsonrpc: "2.0", method: this.method, id, result };
  }

  error(id: number | string, error: ResponseError): InvalidResponseMessage<M> {
    return { jsonrpc: "2.0", method: this.method, id, error };
  }

  result(
    result: R,
    transfer?: ArrayBuffer[],
  ): { result: R; transfer?: ArrayBuffer[] } {
    return { result, transfer };
  }
}
