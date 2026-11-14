export const UNPLACED = -1;

export const insertedAt = (anchor: number): number => -2 - anchor;

export const insertAnchor = (position: number): number | undefined =>
  position <= -2 ? -2 - position : undefined;
