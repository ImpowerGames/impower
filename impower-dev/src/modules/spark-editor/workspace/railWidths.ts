import type { Layout, RailDefault } from "@impower/impower-ui/layout";
import type { ShellState } from "@impower/spark-editor-protocol/src/types";

export const RAIL_WIDTH = {
  default: 232,
  min: 180,
  max: 420,
  collapsed: 76,
  reserve: 624,
} as const;

export const RAIL_COMPACT_WIDTH = {
  full: 190,
  collapsed: 76,
  reserve: 280,
} as const;

export type RailReveal =
  | { railWidth: number | undefined }
  | { railCompactWidth: number };

export const railReveal = (
  shell: ShellState | undefined,
  layout: Layout,
  railDefault: RailDefault,
): RailReveal | null => {
  if (layout === "desktop") {
    return shell?.railWidth === RAIL_WIDTH.collapsed
      ? { railWidth: undefined }
      : null;
  }
  if (layout === "compact") {
    const width =
      shell?.railCompactWidth ??
      (railDefault === "full"
        ? RAIL_COMPACT_WIDTH.full
        : RAIL_COMPACT_WIDTH.collapsed);
    return width === RAIL_COMPACT_WIDTH.collapsed
      ? { railCompactWidth: RAIL_COMPACT_WIDTH.full }
      : null;
  }
  return null;
};
