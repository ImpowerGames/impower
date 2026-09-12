import type { NotificationMessage } from "../types/NotificationMessage";
import { isMessage } from "./isMessage";

export const isNotification = <M extends string = string, P = unknown>(
  obj: unknown,
  method?: M,
): obj is NotificationMessage<M, P> =>
  isMessage(obj, method) &&
  (!("id" in obj) || obj.id === undefined) &&
  (!("result" in obj) || obj.result === undefined) &&
  (!("error" in obj) || obj.error === undefined) &&
  (!("value" in obj) || obj.value === undefined);
