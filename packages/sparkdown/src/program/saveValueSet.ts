import {
  formatLiteral,
  isLiteralTable,
  listingItems,
  literalTableFields,
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

const framesIn = (save: SaveValues, start: string): SavedFrame[] =>
  save.frames.filter((frame) => frame.flow === start || frame.scene === start);

export const savedValueOf = (
  save: SaveValues,
  start: string,
  key: string,
): string | undefined => {
  const frames = framesIn(save, start);
  if (key.startsWith("param:")) {
    const name = key.slice("param:".length);
    return frames.findLast((frame) => Object.hasOwn(frame.params, name))?.params[name];
  }
  const frame = frames.at(-1);
  const value = Object.hasOwn(save.values, key) ? save.values[key] : undefined;
  if (frame && key === visitsKey(start) && value !== undefined) {
    const parsed = parseLiteral(value);
    if (parsed.ok && typeof parsed.value === "number") {
      return String(Math.max(0, parsed.value - 1));
    }
  }
  return value;
};

export const withSavedValue = (
  values: Readonly<StartingValueSet>,
  key: string,
  text: string,
): StartingValueSet => {
  const out: StartingValueSet = { ...values, [key]: text };
  if (!key.startsWith("store:")) {
    return out;
  }
  const parsed = parseLiteral(text);
  const prefix = `${key}.`;
  for (const child of Object.keys(out)) {
    const name = child.slice(prefix.length);
    if (!child.startsWith(prefix) || name.includes(".")) {
      continue;
    }
    const field =
      parsed.ok && isLiteralTable(parsed.value)
        ? literalTableFields(parsed.value).get(`s:${name}`)
        : undefined;
    out[child] = field ? formatLiteral(field.value) : "nil";
  }
  const path = key.slice("store:".length);
  const dot = path.lastIndexOf(".");
  const parentKey = `store:${path.slice(0, dot)}`;
  const parent =
    dot > 0 && Object.hasOwn(out, parentKey) ? parseLiteral(out[parentKey]!) : undefined;
  if (parsed.ok && parent?.ok && isLiteralTable(parent.value)) {
    const name = path.slice(dot + 1);
    const entries = parent.value.entries.filter(
      (entry) => !("key" in entry && entry.key === name),
    );
    if (parsed.value !== null) {
      entries.push({ key: name, value: parsed.value });
    }
    out[parentKey] = formatLiteral({ ...parent.value, entries });
  }
  return out;
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
