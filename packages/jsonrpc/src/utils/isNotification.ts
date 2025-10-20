import { NotificationMessage } from "../types/NotificationMessage";

export const isNotification = <M extends string, P>(
  obj: any,
  method: M = obj.method
): obj is NotificationMessage<M, P> => {
  return (
    (method === undefined || obj.method === method) && obj.id === undefined
  );
};
