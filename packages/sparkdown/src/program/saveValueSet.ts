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

export type SavedScope = Record<string, string | null>;

export interface SavedFrame {
  flow?: string;
  scene?: string;
  uri?: string;
  line?: number;
  scopes: SavedScope[];
  scopeFlows: string[];
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

export const savedLocals = (frames: readonly SavedFrame[]): StartingValueSet => {
  const values: StartingValueSet = {};
  frames.forEach((frame, i) => {
    const seen = new Set<string>();
    for (let s = frame.scopes.length - 1; s >= 0; s -= 1) {
      for (const [name, text] of Object.entries(frame.scopes[s]!)) {
        if (seen.has(name)) {
          continue;
        }
        seen.add(name);
        if (text !== null) {
          values[localKey(i, name)] = text;
        }
      }
    }
  });
  return values;
};

export const withSavedLocal = (frame: SavedFrame, name: string, text: string): SavedFrame => {
  for (let s = frame.scopes.length - 1; s >= 0; s -= 1) {
    const scope = frame.scopes[s]!;
    if (Object.hasOwn(scope, name)) {
      if (scope[name] === null) {
        return frame;
      }
      const scopes = frame.scopes.slice();
      scopes[s] = { ...scope, [name]: text };
      return { ...frame, scopes };
    }
  }
  return frame;
};

export const savedParameterOf = (
  frames: readonly SavedFrame[],
  flow: string,
  name: string,
): string | undefined => {
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const frame = frames[i]!;
    const owner = frame.scopeFlows.indexOf(flow);
    const scope = owner < 0 ? undefined : frame.scopes[owner + 1];
    if (scope && Object.hasOwn(scope, name)) {
      return scope[name] ?? undefined;
    }
  }
  return undefined;
};

export const savedValueOf = (
  save: SaveValues,
  start: string,
  key: string,
): string | undefined => {
  if (key.startsWith("param:")) {
    return savedParameterOf(save.frames, start, key.slice("param:".length));
  }
  const value = Object.hasOwn(save.values, key) ? save.values[key] : undefined;
  if (
    key === visitsKey(start) &&
    value !== undefined &&
    save.frames.some((frame) => frame.flow === start || frame.scene === start)
  ) {
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
