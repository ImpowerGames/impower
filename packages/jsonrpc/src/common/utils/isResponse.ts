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
    (id !== undefined && obj.id !== id)
  )
    return false;
  if ("result" in obj && obj.result !== undefined)
    return !("error" in obj) || obj.error === undefined;
  // Classify the envelope, as with an unchecked result payload. Relays must
  // deliver peer failures even when their error payload needs normalization.
  return "error" in obj && obj.error !== undefined;
};
