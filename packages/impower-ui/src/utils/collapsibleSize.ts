export type CollapsibleLimits = {
  min: number;
  max: number;
  collapsed: number;
};

export function collapsibleSize(
  value: number,
  limits: CollapsibleLimits,
): number {
  const ceiling = Math.max(limits.collapsed, limits.max);
  const size = Math.min(ceiling, Math.max(limits.collapsed, value));
  return size < limits.min ? limits.collapsed : Math.round(size);
}

export function collapsibleSizeAfterKey(
  key: string,
  shift: boolean,
  size: number,
  limits: CollapsibleLimits,
  keys: { grow: string; shrink: string },
): number | null {
  const step = shift ? 64 : 16;
  switch (key) {
    case "Home":
      return limits.collapsed;
    case "End":
      return collapsibleSize(limits.max, limits);
    case keys.grow:
      return size === limits.collapsed
        ? collapsibleSize(limits.min, limits)
        : collapsibleSize(size + step, limits);
    case keys.shrink:
      return collapsibleSize(size - step, limits);
    default:
      return null;
  }
}
