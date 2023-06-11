export const getCurrentBreakpoint = (
  width: number,
  breakpoints?: {
    xs?: number | null;
    sm?: number | null;
    md?: number | null;
    lg?: number | null;
  }
) => {
  if (width <= (breakpoints?.xs ?? 400)) {
    return "xs";
  }
  if (width <= (breakpoints?.sm ?? 600)) {
    return "sm";
  }
  if (width <= (breakpoints?.md ?? 960)) {
    return "md";
  }
  if (width <= (breakpoints?.lg ?? 1280)) {
    return "lg";
  }
  return "xl";
};
