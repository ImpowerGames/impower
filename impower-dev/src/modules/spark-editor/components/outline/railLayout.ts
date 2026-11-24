export const OUTLINE_RAIL_ROW = { size: "rail", indent: "row", tone: "muted" } as const;

const RAIL_ROW_HEIGHT = 44;
const RAIL_ROW_GAP = 2;
const RAIL_GROUP_MARGIN = 6;

type Nested = { depth: number };

export const railRowAfter = (row: Nested, next: Nested | undefined) => ({
  depth: next?.depth ?? 0,
  space: (next ? RAIL_ROW_GAP : 0) + RAIL_GROUP_MARGIN * Math.max(0, row.depth - (next?.depth ?? 0)),
});

export const railRowExtent = (rows: readonly Nested[], index: number) =>
  RAIL_ROW_HEIGHT + railRowAfter(rows[index]!, rows[index + 1]).space;
