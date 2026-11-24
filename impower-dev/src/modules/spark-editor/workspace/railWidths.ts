import type { Layout } from "@impower/impower-ui/layout";
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
  reserve: RAIL_WIDTH.reserve,
} as const;

export const searchWidensRail = (
  shell: ShellState | undefined,
  layout: Layout,
) => layout === "desktop" && shell?.railWidth === RAIL_WIDTH.collapsed;
