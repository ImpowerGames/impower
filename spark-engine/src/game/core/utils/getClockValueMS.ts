import { ClockValue } from "../types/ClockValue";

export const getClockValueMS = (clockValue: ClockValue): number => {
  return clockValue.endsWith("ms")
    ? Number(clockValue.replace("ms", ""))
    : clockValue.endsWith("s")
    ? Number(clockValue.replace("s", "")) * 1000
    : clockValue.endsWith("min")
    ? Number(clockValue.replace("min", "")) * 1000 * 60
    : clockValue.endsWith("h")
    ? Number(clockValue.replace("h", "")) * 1000 * 60 * 60
    : 0;
};
