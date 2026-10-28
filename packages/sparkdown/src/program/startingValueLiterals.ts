/**
 * Starting values: what the author tells the Game Preview a scene's start
 * holds, as the hosts keep them and the player edits them. This module is
 * the part with no engine in it, which the player's page reads as well as
 * the engine: the keys, the literal a value is written as, and the checks a
 * value is given against what the program declares.
 */

/** The values one start takes: each value's key and the literal it is
 *  written as. */
export type StartingValueSet = Record<string, string>;

/** Every start's values, by the start: a scene's qualified name, or `"0"`
 *  for the top-level content. */
export type StartingValues = Record<string, StartingValueSet>;

/** The top-level content's start, as a route names it. */
export const TOP_LEVEL_FLOW = "0";

/** The key of the seed. */
export const SEED_KEY = "seed";

export const paramKey = (name: string) => `param:${name}`;

/** A store's key, by its path: `trust`, a define's field `guide.mood`, or a
 *  table store's field `player.hp`. */
export const storeKey = (path: string) => `store:${path}`;

/** A scene's, a branch's or a label's visits, by its qualified name. */
export const visitsKey = (name: string) => `visits:${name}`;

/**
 * The visits of a counted place with no name, a once-only option or an
 * alternator, by where it is written: its script, its line counting from 0,
 * and which of the line's counted places it is, counting from 0. A place's
 * key follows its line through edits; one whose line was deleted is
 * detached (`detachPlaceKey`) and never resolves.
 */
export const placeKey = (uri: string, line: number, index = 0) =>
  `place:${index}:${line}:${uri}`;

export interface PlaceKey {
  uri: string;
  line: number;
  index: number;
  /** The line it was on was deleted. */
  detached: boolean;
}

export const readPlaceKey = (key: string): PlaceKey | undefined => {
  const match = /^place:(\d+):(~?)(\d+):(.*)$/s.exec(key);
  if (!match) {
    return undefined;
  }
  return {
    index: Number(match[1]),
    detached: match[2] === "~",
    line: Number(match[3]),
    uri: match[4]!,
  };
};

/** The key a place's value moves to when its line moves to `line`, or is
 *  detached when its line was deleted (`line` null). */
export const movePlaceKey = (key: string, line: number | null): string => {
  const place = readPlaceKey(key);
  if (!place) {
    return key;
  }
  return line === null
    ? `place:${place.index}:~${place.line}:${place.uri}`
    : placeKey(place.uri, line, place.index);
};

/** The lines of `uri` that the values of its places are kept on, counting
 *  from 0, in every start. */
export const placeLinesOf = (values: StartingValues, uri: string): number[] => {
  const lines = new Set<number>();
  for (const set of Object.values(values)) {
    for (const key of Object.keys(set)) {
      const place = readPlaceKey(key);
      if (place && !place.detached && place.uri === uri) {
        lines.add(place.line);
      }
    }
  }
  return [...lines].sort((a, b) => a - b);
};

/**
 * Every start's values with the places of `uri` moved: `moves` maps a line a
 * value was kept on to the line it is on now, or to null for a line that was
 * deleted. Answers the same object when nothing moved.
 */
export const movePlaceLines = (
  values: StartingValues,
  uri: string,
  moves: ReadonlyMap<number, number | null>,
): StartingValues => {
  let changed = false;
  const out: StartingValues = {};
  for (const [start, set] of Object.entries(values)) {
    const moved: StartingValueSet = {};
    for (const [key, value] of Object.entries(set)) {
      const place = readPlaceKey(key);
      const to =
        place && !place.detached && place.uri === uri
          ? moves.get(place.line)
          : undefined;
      if (to === undefined || to === place!.line) {
        moved[key] = value;
      } else {
        changed = true;
        moved[movePlaceKey(key, to)] = value;
      }
    }
    out[start] = moved;
  }
  return changed ? out : values;
};

/** Every start's values with one start's changes applied: a key given a
 *  literal is set to it, and a key given null is cleared. A start left with
 *  no values is dropped. */
export const changeStartingValues = (
  values: StartingValues,
  start: string,
  changes: Record<string, string | null>,
): StartingValues => {
  const set: StartingValueSet = { ...values[start] };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) {
      delete set[key];
    } else {
      set[key] = value;
    }
  }
  const out = { ...values };
  if (Object.keys(set).length > 0) {
    out[start] = set;
  } else {
    delete out[start];
  }
  return out;
};

/** Every start's values read from what a host stored: each start's values
 *  that are strings, and nothing else. */
export const startingValuesFrom = (stored: unknown): StartingValues => {
  const out: StartingValues = {};
  if (!stored || typeof stored !== "object") {
    return out;
  }
  for (const [start, set] of Object.entries(stored as object)) {
    if (!set || typeof set !== "object") {
      continue;
    }
    const kept: StartingValueSet = {};
    for (const [key, value] of Object.entries(set as object)) {
      if (typeof value === "string") {
        kept[key] = value;
      }
    }
    if (Object.keys(kept).length > 0) {
      out[start] = kept;
    }
  }
  return out;
};

/* ----- Literals ----- */

/** A table written as a literal: its list entries, then its keyed ones, in
 *  the order they were written. */
export interface LiteralTable {
  list: Literal[];
  fields: [Exclude<Literal, null>, Literal][];
}

/** A value written as a literal: nil, a boolean, a number, a string or a
 *  table of literals. */
export type Literal = null | boolean | number | string | LiteralTable;

export type LiteralType = "nil" | "boolean" | "number" | "string" | "table";

export const isLiteralTable = (value: Literal): value is LiteralTable =>
  value !== null && typeof value === "object";

export const literalTypeOf = (value: Literal): LiteralType =>
  value === null
    ? "nil"
    : typeof value === "boolean"
      ? "boolean"
      : typeof value === "number"
        ? "number"
        : typeof value === "string"
          ? "string"
          : "table";

export type ParsedLiteral =
  | { ok: true; value: Literal }
  | { ok: false; error: string };

const NAME = /[A-Za-z_][A-Za-z0-9_]*/y;
const NUMBER =
  /-?(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:[0-9][0-9_]*(?:\.[0-9_]*)?|\.[0-9][0-9_]*)(?:[eE][+-]?[0-9_]+)?)/y;
const KEYWORDS = new Set(["nil", "true", "false"]);

class LiteralReader {
  at = 0;
  /** How many tables the reader is inside. */
  depth = 0;
  constructor(readonly text: string) {}

  fail(message: string): never {
    throw new LiteralError(message);
  }

  /** Passes whitespace. A comment is no part of a literal. */
  skip() {
    while (this.at < this.text.length && /\s/.test(this.text[this.at]!)) {
      this.at += 1;
    }
    if (this.text.startsWith("--", this.at)) {
      this.fail("expected a value, not a comment");
    }
  }

  peek() {
    this.skip();
    return this.text[this.at];
  }

  eat(char: string) {
    if (this.peek() === char) {
      this.at += 1;
      return true;
    }
    return false;
  }

  match(pattern: RegExp): string | undefined {
    this.skip();
    pattern.lastIndex = this.at;
    const match = pattern.exec(this.text);
    if (!match) {
      return undefined;
    }
    this.at = pattern.lastIndex;
    return match[0];
  }

  value(): Literal {
    const char = this.peek();
    if (char === undefined) {
      // Text that ends inside a table ends before the table does.
      this.fail(
        this.depth > 0 ? "expected } to close the table" : "expected a value",
      );
    }
    if (char === "{") {
      return this.table();
    }
    if (char === '"' || char === "'") {
      return this.quoted(char);
    }
    if (char === "[" && /^\[=*\[/.test(this.text.slice(this.at))) {
      return this.long();
    }
    if (char === "`") {
      this.fail("expected a string in quotes; a backtick string is an expression");
    }
    const number = this.match(NUMBER);
    if (number !== undefined) {
      const n = Number(number.replace(/_/g, "").replace(/^-0[bB]/, "-0b"));
      const value = /^-?0[bB]/.test(number)
        ? (number.startsWith("-") ? -1 : 1) *
          parseInt(number.replace(/^-?0[bB]/, "").replace(/_/g, ""), 2)
        : n;
      if (Number.isNaN(value)) {
        this.fail(`${number} is not a number`);
      }
      return value;
    }
    const name = this.match(NAME);
    if (name === "nil") {
      return null;
    }
    if (name === "true" || name === "false") {
      return name === "true";
    }
    if (name !== undefined) {
      this.fail(`expected a value, not the name ${name}`);
    }
    this.fail(`expected a value, not ${char}`);
  }

  quoted(quote: string): string {
    this.at += 1;
    let out = "";
    for (;;) {
      const char = this.text[this.at];
      if (char === undefined || char === "\n") {
        this.fail(`expected ${quote} to close the string`);
      }
      this.at += 1;
      if (char === quote) {
        return out;
      }
      if (char !== "\\") {
        out += char;
        continue;
      }
      const escape = this.text[this.at];
      this.at += 1;
      switch (escape) {
        case "n":
          out += "\n";
          break;
        case "t":
          out += "\t";
          break;
        case "r":
          out += "\r";
          break;
        case "a":
          out += "\u0007";
          break;
        case "b":
          out += "\b";
          break;
        case "f":
          out += "\f";
          break;
        case "v":
          out += "\v";
          break;
        case "\\":
        case '"':
        case "'":
        case "\n":
          out += escape;
          break;
        case "x": {
          const hex = this.text.slice(this.at, this.at + 2);
          if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
            this.fail("expected two hex digits after \\x");
          }
          out += String.fromCharCode(parseInt(hex, 16));
          this.at += 2;
          break;
        }
        case "u": {
          const match = /^\{([0-9a-fA-F]+)\}/.exec(this.text.slice(this.at));
          if (!match) {
            this.fail("expected \\u{...} with hex digits");
          }
          out += String.fromCodePoint(parseInt(match[1]!, 16));
          this.at += match[0].length;
          break;
        }
        default: {
          const digits = /^[0-9]{1,3}/.exec(this.text.slice(this.at - 1));
          if (!digits) {
            this.fail(`\\${escape ?? ""} is not an escape`);
          }
          out += String.fromCharCode(Number(digits[0]));
          this.at += digits[0].length - 1;
        }
      }
    }
  }

  long(): string {
    const open = /^\[(=*)\[/.exec(this.text.slice(this.at))!;
    const close = `]${open[1]}]`;
    const start = this.at + open[0].length;
    const end = this.text.indexOf(close, start);
    if (end < 0) {
      this.fail(`expected ${close} to close the string`);
    }
    this.at = end + close.length;
    return this.text.slice(start, end).replace(/^\r?\n/, "");
  }

  table(): LiteralTable {
    this.at += 1;
    this.depth += 1;
    const table: LiteralTable = { list: [], fields: [] };
    for (;;) {
      if (this.eat("}")) {
        this.depth -= 1;
        return table;
      }
      if (this.peek() === undefined) {
        this.fail("expected } to close the table");
      }
      if (this.eat("[")) {
        const key = this.value();
        if (!this.eat("]")) {
          this.fail("expected ] after the key");
        }
        if (!this.eat("=")) {
          this.fail("expected = after the key");
        }
        if (key === null) {
          this.fail("a table's key cannot be nil");
        }
        if (typeof key === "number" && Number.isNaN(key)) {
          this.fail("a table's key cannot be NaN");
        }
        table.fields.push([key, this.value()]);
      } else {
        const from = this.at;
        const name = this.match(NAME);
        if (name !== undefined && !KEYWORDS.has(name) && this.eat("=")) {
          table.fields.push([name, this.value()]);
        } else {
          this.at = from;
          table.list.push(this.value());
        }
      }
      if (!this.eat(",") && !this.eat(";") && this.peek() !== "}") {
        if (this.peek() === undefined) {
          this.fail("expected } to close the table");
        }
        this.fail("expected , or } after a table's entry");
      }
    }
  }
}

class LiteralError extends Error {}

/** A value's literal read: the value, or why it is not one. */
export const parseLiteral = (text: string): ParsedLiteral => {
  const reader = new LiteralReader(text);
  try {
    if (reader.peek() === undefined) {
      return { ok: false, error: "expected a value" };
    }
    const value = reader.value();
    if (reader.peek() !== undefined) {
      return {
        ok: false,
        error: `expected the value to end before ${text.slice(reader.at).trim()}`,
      };
    }
    return { ok: true, value };
  } catch (e) {
    if (e instanceof LiteralError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }
};

const quote = (s: string) =>
  `"${s.replace(/[\\"\n\r\t\u0000-\u001f]/g, (c) =>
    c === "\\"
      ? "\\\\"
      : c === '"'
        ? '\\"'
        : c === "\n"
          ? "\\n"
          : c === "\r"
            ? "\\r"
            : c === "\t"
              ? "\\t"
              : `\\${c.charCodeAt(0)}`,
  )}"`;

const formatNumber = (n: number) =>
  Number.isNaN(n)
    ? "0/0"
    : n === Infinity
      ? "math.huge"
      : n === -Infinity
        ? "-math.huge"
        : String(n);

/** A literal written as an author writes it: `nil`, `true`, `3`, `"Ana"`,
 *  `{ name = "Ana", hp = 10 }`. */
export const formatLiteral = (value: Literal): string => {
  if (value === null) {
    return "nil";
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "number") {
    return formatNumber(value);
  }
  if (typeof value === "string") {
    return quote(value);
  }
  const entries = [
    ...value.list.map(formatLiteral),
    ...value.fields.map(([key, field]) =>
      typeof key === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !KEYWORDS.has(key)
        ? `${key} = ${formatLiteral(field)}`
        : `[${formatLiteral(key)}] = ${formatLiteral(field)}`,
    ),
  ];
  return entries.length === 0 ? "{ }" : `{ ${entries.join(", ")} }`;
};

/* ----- What a start can take ----- */

export type StartingValueGroup =
  | "parameters"
  | "stores"
  | "visits"
  | "randomization";

/** One thing a start can take, as the Starting values tab lists it. */
export interface StartingValueItem {
  key: string;
  group: StartingValueGroup;
  /** What the row names it by: a parameter's or a store's name, a field's
   *  `.name`, a flow's or a label's qualified name, an option's text or an
   *  alternator's first alternative, or `seed`. */
  name: string;
  /** The line a place is written on, counting from 0, and its script. */
  uri?: string;
  line?: number;
  /** The value it starts with when nothing is set, as a literal. */
  first: string;
  /** The type a value given it is checked against: the first value's, or
   *  none for a parameter, which takes any value. */
  type?: LiteralType;
  /** A table store's fields, each of which can be set on its own. */
  fields?: StartingValueItem[];
}

/** What a start can take: its parameters, the program's stores, its counted
 *  places and the seed, each with its first value. */
export interface StartingValueListing {
  start: string;
  items: StartingValueItem[];
}

/** Every item of a listing, a table store's fields after it. */
export const listingItems = (
  listing: StartingValueListing | undefined,
): StartingValueItem[] =>
  (listing?.items ?? []).flatMap((item) => [item, ...(item.fields ?? [])]);

export type StartingValueCheck =
  | { status: "ok" }
  | { status: "warning" | "error"; message: string };

const article = (type: LiteralType) => (type === "nil" ? "nil" : `a ${type}`);

/** A value given an item, checked: one that does not parse is an error and
 *  is not kept; one of another type than the item's warns and still
 *  applies; a visit count or a seed must be a whole number. */
export const checkStartingValue = (
  item: StartingValueItem,
  text: string,
): StartingValueCheck => {
  const parsed = parseLiteral(text);
  if (!parsed.ok) {
    return {
      status: "error",
      message: `Not a value yet: ${parsed.error}. It isn't kept until it is one.`,
    };
  }
  if (item.group === "visits" || item.group === "randomization") {
    const n = parsed.value;
    if (typeof n !== "number" || !Number.isInteger(n) || (item.group === "visits" && n < 0)) {
      return {
        status: "error",
        message:
          item.group === "visits"
            ? "Not a count: a visit count is a whole number, 0 or more. It isn't kept until it is one."
            : "Not a seed: a seed is a whole number. It isn't kept until it is one.",
      };
    }
    return { status: "ok" };
  }
  const type = literalTypeOf(parsed.value);
  if (item.type && item.type !== "nil" && type !== item.type) {
    return {
      status: "warning",
      message: `${item.name} starts as ${article(item.type)}. This still applies.`,
    };
  }
  return { status: "ok" };
};

/** Why a value whose key no longer resolves is not used. */
export const unresolvedMessage = (key: string): string => {
  const place = readPlaceKey(key);
  if (place) {
    return `No once-only option or alternator is on line ${place.line + 1} now, so this isn't used. × removes it.`;
  }
  const [kind, ...rest] = key.split(":");
  const name = rest.join(":");
  switch (kind) {
    case "param":
      return `This scene has no parameter named ${name} now, so this isn't used. × removes it.`;
    case "store":
      return `No store is named ${name} now, so this isn't used. × removes it.`;
    case "visits":
      return `No scene, branch or label is named ${name} now, so this isn't used. × removes it.`;
    default:
      return "This isn't in the script now, so it isn't used. × removes it.";
  }
};

/** What a row whose value no longer resolves is named by. */
export const unresolvedName = (key: string): string => {
  const place = readPlaceKey(key);
  if (place) {
    return `line ${place.line + 1}`;
  }
  return key.slice(key.indexOf(":") + 1);
};
