import { ResponseMessage } from "../types/base/ResponseMessage";

export const isResponse = <M extends string, R>(
  obj: any,
  method: M,
  id?: string | number,
): obj is ResponseMessage<M, R> => {
  return (
    obj.method === method &&
    obj.id !== undefined &&
    (id === undefined || obj.id === id) &&
    (obj.result !== undefined || obj.error !== undefined)
  );
};
