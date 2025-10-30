import { NotificationMessage } from "../types/NotificationMessage";

export const isNotification = <M extends string, P>(
  obj: any,
  method: M = obj.method
): obj is NotificationMessage<M, P> => {
  return (
    typeof obj === "object" &&
    typeof obj.jsonrpc === "string" &&
    typeof obj.method === "string" &&
    (method === undefined || obj.method === method) &&
    obj.id === undefined
  );
};
