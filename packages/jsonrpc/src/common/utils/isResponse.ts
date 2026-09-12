import type { ResponseMessage } from "../types/ResponseMessage";
import { isMessage } from "./isMessage";

export const isResponse = <M extends string = string, R = unknown>(
  obj: unknown,
  method?: M,
  id?: string | number,
): obj is ResponseMessage<M, R> => {
  if (
    !isMessage(obj, method) ||
    !("id" in obj) ||
    !(
      typeof obj.id === "string" ||
      (typeof obj.id === "number" && Number.isFinite(obj.id))
    ) ||
    (id !== undefined && obj.id !== id) ||
    "value" in obj
  )
    return false;
  if ("result" in obj) return obj.result !== undefined && !("error" in obj);
  if (!("error" in obj)) return false;
  const error = obj.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "number" &&
    "message" in error &&
    typeof error.message === "string"
  );
};
