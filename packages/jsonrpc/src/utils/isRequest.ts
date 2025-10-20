import { RequestMessage } from "../types/RequestMessage";

export const isRequest = <M extends string, R>(
  obj: any,
  method: M = obj.method
): obj is RequestMessage<M, R> => {
  return (
    (method === undefined || obj.method === method) &&
    obj.id !== undefined &&
    obj.result === undefined &&
    obj.error === undefined
  );
};
