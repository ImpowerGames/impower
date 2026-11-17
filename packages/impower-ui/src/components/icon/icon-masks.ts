export * from "./icon-masks.generated";

type StyleSpec = { [key: string]: string | number | null | undefined | StyleSpec };

const FORCED_COLORS = "@media (forced-colors: active)";

const rule = (value: StyleSpec[string]): StyleSpec =>
  value && typeof value === "object" ? value : {};

export const withIconMaskPaint = <Spec extends StyleSpec>(
  spec: Spec,
  ...selectors: string[]
): Spec => {
  const nested = selectors.find((selector) => selector.includes("&"));
  if (nested) {
    throw new RangeError(`An icon mask selector cannot nest with "&" inside a media query: ${nested}`);
  }
  const painted: StyleSpec = { ...spec };
  for (const selector of selectors) {
    painted[selector] = { ...rule(spec[selector]), backgroundColor: "currentColor" };
  }
  painted[FORCED_COLORS] = {
    ...rule(spec[FORCED_COLORS]),
    [selectors.join(", ")]: {
      forcedColorAdjust: "none",
      backgroundColor: "CanvasText !important",
    },
  };
  return painted as Spec;
};
