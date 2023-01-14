import { RecursivePartial } from "../types/RecursivePartial";
import { augment } from "./augment";

export const clone = <T>(obj: T, preset?: RecursivePartial<T>): T => {
  if (obj == null) {
    return obj;
  }
  const cloned = JSON.parse(JSON.stringify(obj)) as T;
  if (preset) {
    augment(cloned, preset);
  }
  return cloned;
};
