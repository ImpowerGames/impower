import { ProgressResponseMessage } from "../types/base/ProgressResponseMessage";

export const isProgressResponse = <M extends string>(
  obj: any,
  method: M = obj.method,
  id?: string | number,
): obj is ProgressResponseMessage<M> => {
  return (
    typeof obj === "object" &&
    typeof obj.jsonrpc === "string" &&
    typeof obj.method === "string" &&
    (method === undefined || obj.method === `${method}/progress`) &&
    obj.id !== undefined &&
    (id === undefined || obj.id === id) &&
    obj.value !== undefined
  );
};
