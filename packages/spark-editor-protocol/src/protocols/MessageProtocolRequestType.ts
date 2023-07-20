import { RequestMessage, ResponseMessage } from "../types";
import { uuid } from "../utils/uuid";

import { ProtocolRequestType } from "../types/lsp/messages";

export class MessageProtocolRequestType<
  M extends string,
  P,
  R
> extends ProtocolRequestType<P, R, void, void, void> {
  constructor(method: M) {
    super(method);
  }
  isRequest(obj: any): obj is RequestMessage<M, P> {
    return obj.method === this.method && obj.result === undefined;
  }
  isResponse(obj: any): obj is ResponseMessage<M, R> {
    return obj.method === this.method && obj.result !== undefined;
  }
  request(params: P): RequestMessage<M, P> {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id: uuid(),
      params,
    } as RequestMessage<M, P>;
  }
  response(id: number | string, result: R): ResponseMessage<M, R> {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id,
      result,
    } as ResponseMessage<M, R>;
  }
}
