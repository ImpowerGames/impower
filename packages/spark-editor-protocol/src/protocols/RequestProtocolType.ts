import { RequestMessage, ResponseMessage } from "../types";
import { uuid } from "../utils/uuid";

export abstract class RequestProtocolType<
  Request extends RequestMessage,
  Response extends ResponseMessage,
  Params = undefined
> {
  abstract get method(): string;
  isRequest(obj: any): obj is Request {
    return obj.method === this.method && obj.result === undefined;
  }
  isResponse(obj: any): obj is Response {
    return obj.method === this.method && obj.result !== undefined;
  }
  request(params: Params): Request {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id: uuid(),
      params,
    } as Request;
  }
  response(id: number | string, result: any = null): Response {
    return {
      jsonrpc: "2.0",
      method: this.method,
      id,
      result,
    } as Response;
  }
}
