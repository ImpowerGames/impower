import { RequestMessage } from "../types/RequestMessage";

export const isRequest = <M extends string, R>(
  obj: any,
  method: M = obj.method
): obj is RequestMessage<M, R> => {
  return (
    typeof obj === "object" &&
    typeof obj.jsonrpc === "string" &&
    typeof obj.method === "string" &&
    (method === undefined || obj.method === method) &&
    obj.id !== undefined &&
    obj.result === undefined &&
    obj.error === undefined
  );
};
