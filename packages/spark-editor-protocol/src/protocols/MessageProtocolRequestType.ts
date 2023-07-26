import { ProtocolRequestType } from "vscode-languageserver-protocol";
import { RequestMessage, ResponseMessage } from "../types";
import { isRequest } from "../utils/isRequest";
import { isResponse } from "../utils/isResponse";
import { uuid } from "../utils/uuid";

export class MessageProtocolRequestType<
  M extends string,
  P,
  R
> extends ProtocolRequestType<P, R, void, void, void> {
  constructor(method: M) {
    super(method);
  }
  isRequest(obj: any): obj is RequestMessage<M, P> {
    return isRequest(obj, this.method);
  }
  isResponse(obj: any): obj is ResponseMessage<M, R> {
    return isResponse(obj, this.method);
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
