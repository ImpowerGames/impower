import { RequestMessage } from "../types/base/RequestMessage";

export const isRequest = <M extends string, R>(
  obj: any,
  method: M
): obj is RequestMessage<M, R> => {
  return obj.method === method && obj.result === undefined;
};
