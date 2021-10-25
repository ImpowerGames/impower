export const getTransitionProps = (
  props: {
    easing: string | { enter?: string; exit?: string } | undefined;
    style: React.CSSProperties | undefined;
    timeout: number | { enter?: number; exit?: number };
  },
  options: { mode: "enter" | "exit" }
): {
  duration: number;
  easing: string | undefined;
  delay: string | undefined;
} => {
  const { timeout, easing, style = {} } = props;

  return {
    duration:
      typeof timeout === "number" ? timeout : timeout[options.mode] || 0,
    easing:
      style.transitionTimingFunction ??
      (typeof easing === "object" ? easing[options.mode] : easing),
    delay: style.transitionDelay,
  };
};
