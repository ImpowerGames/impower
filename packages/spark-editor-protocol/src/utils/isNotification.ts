import { NotificationMessage } from "../types/base/NotificationMessage";

export const isNotification = <M extends string, P>(
  obj: any,
  method: M
): obj is NotificationMessage<M, P> => {
  return obj.method === method && obj.id === undefined;
};
