import { DEFAULT_SIZES } from "../constants/DEFAULT_SIZES";
import { SizeName } from "../types/sizeName";

export const getBreakpointValue = (breakpoint: SizeName) => {
  return DEFAULT_SIZES.indexOf(breakpoint);
};
