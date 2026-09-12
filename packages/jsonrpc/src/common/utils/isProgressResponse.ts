import type { ProgressResponseMessage } from "../types/ProgressResponseMessage";
import { isMessage } from "./isMessage";

/** Accept the old bare method as well as the canonical /progress method. */
export const isProgressResponse = <M extends string = string>(
  obj: unknown,
  method?: M,
  id?: string | number,
): obj is ProgressResponseMessage<M> =>
  isMessage(obj) &&
  (method === undefined ||
    obj.method === method ||
    obj.method === `${method}/progress`) &&
  "id" in obj &&
  (typeof obj.id === "string" ||
    (typeof obj.id === "number" && Number.isFinite(obj.id))) &&
  (id === undefined || obj.id === id) &&
  "value" in obj &&
  obj.value !== undefined &&
  !("result" in obj) &&
  !("error" in obj) &&
  !("params" in obj);
