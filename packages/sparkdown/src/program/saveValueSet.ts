import {
  formatLiteral,
  listingItems,
  parseLiteral,
  visitsKey,
  type StartingValueListing,
  type StartingValueSet,
} from "./startingValueLiterals";

export const localKey = (frame: number, name: string) => `local:${frame}:${name}`;

export const readLocalKey = (
  key: string,
): { frame: number; name: string } | undefined => {
  const match = /^local:(\d+):(.*)$/s.exec(key);
  return match ? { frame: Number(match[1]), name: match[2]! } : undefined;
};

export interface SavedFrame {
  flow?: string;
  scene?: string;
  uri?: string;
  line?: number;
  params: Record<string, string>;
}

export interface SaveValues {
  values: StartingValueSet;
  frames: SavedFrame[];
}

export const sameLiteral = (a: string, b: string): boolean => {
  if (a === b) {
    return true;
  }
  const left = parseLiteral(a);
  const right = parseLiteral(b);
  return (
    left.ok && right.ok && formatLiteral(left.value) === formatLiteral(right.value)
  );
};

export const frameIn = (
  save: SaveValues,
  start: string,
): SavedFrame | undefined =>
  save.frames.find((frame) => frame.flow === start) ??
  save.frames.find((frame) => frame.scene === start);

export const savedValueOf = (
  save: SaveValues,
  start: string,
  key: string,
): string | undefined => {
  const frame = frameIn(save, start);
  if (key.startsWith("param:")) {
    const name = key.slice("param:".length);
    return frame && Object.hasOwn(frame.params, name)
      ? frame.params[name]
      : undefined;
  }
  const value = Object.hasOwn(save.values, key) ? save.values[key] : undefined;
  if (frame && key === visitsKey(start) && value !== undefined) {
    const parsed = parseLiteral(value);
    if (parsed.ok && typeof parsed.value === "number") {
      return String(Math.max(0, parsed.value - 1));
    }
  }
  return value;
};

export const saveStartingValues = (
  save: SaveValues,
  listing: StartingValueListing,
): StartingValueSet => {
  const set: StartingValueSet = {};
  for (const item of listingItems(listing)) {
    const value = savedValueOf(save, listing.start, item.key);
    if (value !== undefined && !sameLiteral(value, item.first)) {
      set[item.key] = value;
    }
  }
  return set;
};
