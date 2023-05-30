import { ClockValue } from "../types/ClockValue";

export const isClockValue = (obj: unknown): obj is ClockValue => {
  if (typeof obj !== "string") {
    return false;
  }
  return (
    obj.endsWith("ms") ||
    obj.endsWith("s") ||
    obj.endsWith("min") ||
    obj.endsWith("h")
  );
};
