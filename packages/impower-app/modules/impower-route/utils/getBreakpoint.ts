import { Breakpoint } from "../styles/breakpoint";

export const getBreakpoint = (width: number): Breakpoint => {
  if (width <= Breakpoint.xs) {
    return Breakpoint.xs;
  }
  if (width <= Breakpoint.sm) {
    return Breakpoint.sm;
  }
  if (width <= Breakpoint.md) {
    return Breakpoint.md;
  }
  if (width <= Breakpoint.lg) {
    return Breakpoint.lg;
  }
  if (width <= Breakpoint.xl) {
    return Breakpoint.xl;
  }
  return Breakpoint.xl;
};
