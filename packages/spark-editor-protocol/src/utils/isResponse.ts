import { ResponseMessage } from "../types/base/ResponseMessage";

export const isResponse = <M extends string, R>(
  obj: any,
  method: M
): obj is ResponseMessage<M, R> => {
  return obj.method === method && obj.result !== undefined;
};
