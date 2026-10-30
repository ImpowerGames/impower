import type { IMessage } from "../types/IMessage";

export const isMessage = <M extends string = string>(
  obj: unknown,
  method?: M,
): obj is IMessage<M> => {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "jsonrpc" in obj &&
    typeof obj.jsonrpc === "string" &&
    "method" in obj &&
    typeof obj.method === "string" &&
    (method === undefined || obj.method === method)
  );
};
