import { ResponseMessage } from "../types/ResponseMessage";

export const isResponse = <M extends string, R>(
  obj: any,
  method: M = obj.method
): obj is ResponseMessage<M, R> => {
  return (
    typeof obj === "object" &&
    typeof obj.jsonrpc === "string" &&
    typeof obj.method === "string" &&
    (method === undefined || obj.method === method) &&
    obj.id !== undefined &&
    (obj.result !== undefined || obj.error !== undefined)
  );
};
