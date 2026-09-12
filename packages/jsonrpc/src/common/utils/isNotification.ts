import type { NotificationMessage } from "../types/NotificationMessage";
import { isMessage } from "./isMessage";

export const isNotification = <M extends string = string, P = unknown>(
  obj: unknown,
  method?: M,
): obj is NotificationMessage<M, P> =>
  isMessage(obj, method) &&
  !("id" in obj) &&
  !("result" in obj) &&
  !("error" in obj) &&
  !("value" in obj);
