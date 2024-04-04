import { getMilliseconds } from "./getMilliseconds";

export const getSeconds = (value: string): number | null | undefined => {
  const ms = getMilliseconds(value);
  if (typeof ms === "number") {
    return ms / 1000;
  }
  return ms;
};
