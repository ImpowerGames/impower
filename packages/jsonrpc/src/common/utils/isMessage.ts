import { Message } from "../types/Message";

export const isMessage = <M extends string, P>(
  obj: any,
  method: M = obj.method
): obj is Message<M, P> => {
  return (
    typeof obj === "object" &&
    typeof obj.jsonrpc === "string" &&
    typeof obj.method === "string" &&
    (method === undefined || obj.method === method)
  );
};
