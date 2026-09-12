import type { IMessage } from "../types/IMessage";

/** Checks the internal envelope, not application payload schemas. */
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
