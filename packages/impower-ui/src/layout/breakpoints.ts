export type Layout = "phone" | "compact" | "desktop";

export type Pointer = "coarse" | "fine";

export type RailDefault = "icons" | "full";

export const layoutMinWidths = {
  compact: 701,
  desktop: 1101,
} as const satisfies Record<Exclude<Layout, "phone">, number>;

export const railFullMinWidth = 1001;

export const layoutQueries = {
  compact: `(min-width: ${layoutMinWidths.compact}px)`,
  desktop: `(min-width: ${layoutMinWidths.desktop}px)`,
} as const satisfies Record<Exclude<Layout, "phone">, string>;

export const railFullQuery = `(min-width: ${railFullMinWidth}px)`;

export const coarsePointerQuery = "(hover: none) and (pointer: coarse)";
