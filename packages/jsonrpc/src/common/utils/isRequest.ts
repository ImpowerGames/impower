import type { RequestMessage } from "../types/RequestMessage";
import { isMessage } from "./isMessage";

export const isRequest = <M extends string = string, P = unknown, R = unknown>(
  obj: unknown,
  method?: M,
): obj is RequestMessage<M, P, R> =>
  isMessage(obj, method) &&
  "id" in obj &&
  (typeof obj.id === "string" ||
    (typeof obj.id === "number" && Number.isFinite(obj.id))) &&
  !("result" in obj) &&
  !("error" in obj) &&
  !("value" in obj);
