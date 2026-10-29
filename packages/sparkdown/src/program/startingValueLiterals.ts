/**
 * Starting values: what the author tells the Game Preview a scene's start
 * holds, as the hosts keep them and the player edits them. This module is
 * the part with no engine in it, which the player's page reads as well as
 * the engine: the keys, the literal a value is written as, and the checks a
 * value is given against what the program declares.
 */
import { numberLiteralValue } from "../compiler/utils/numberLiteralValue";
import {
  processLuauEscapes,
  stringLiteralValue,
} from "../compiler/utils/stringLiteralValue";

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
    setOwnEntry(out, start, moved);
  }
  return changed ? out : values;
};

/** `record`'s own entry for `key`, never one it inherits: a scene can be
 *  named `toString` or `__proto__`. */
export const ownEntry = <T>(
  record: Readonly<Record<string, T>> | undefined,
  key: string,
): T | undefined =>
  record && Object.hasOwn(record, key) ? record[key] : undefined;

/** Sets `record`'s own entry for `key`, which assigning `__proto__` would
 *  not. */
const setOwnEntry = <T>(record: Record<string, T>, key: string, value: T) => {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
};

/** Every start's values with one start's changes applied: a key given a
 *  literal is set to it, and a key given null is cleared. A start left with
 *  no values is dropped. */
export const changeStartingValues = (
  values: StartingValues,
  start: string,
  changes: Record<string, string | null>,
): StartingValues => {
  const set: StartingValueSet = { ...ownEntry(values, start) };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) {
      delete set[key];
    } else {
      set[key] = value;
    }
  }
  const out = { ...values };
  if (Object.keys(set).length > 0) {
    setOwnEntry(out, start, set);
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
      setOwnEntry(out, start, kept);
    }
  }
  return out;
};

/* ----- Literals ----- */

/** One entry of a table written as a literal: a value the next list
 *  position takes, or a value under a key. */
export type LiteralEntry =
  | { value: Literal }
  | { key: Exclude<Literal, null>; value: Literal };

/** A table written as a literal: its entries in the order they were
 *  written, which is the order a table constructor assigns them in, so a
 *  later entry for the same key wins. */
export interface LiteralTable {
  entries: LiteralEntry[];
  /** Read from a table that also held entries no literal writes (a
   *  function), which `entries` leaves out. */
  partial?: boolean;
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

/** A table's entries by key, as its constructor leaves them: a list entry
 *  under the next position, a later entry replacing an earlier one of the
 *  same key, and a nil value no entry. A table key is a table of its own,
 *  equal to no other key. */
export const literalTableFields = (
  table: LiteralTable,
): Map<string, { key: Exclude<Literal, null>; value: Exclude<Literal, null> }> => {
  const fields = new Map<
    string,
    { key: Exclude<Literal, null>; value: Exclude<Literal, null> }
  >();
  let position = 1;
  for (const [index, entry] of table.entries.entries()) {
    const key = "key" in entry ? entry.key : position++;
    const id =
      typeof key === "string"
        ? `s:${key}`
        : typeof key === "object"
          ? `table:${index}`
          : `${typeof key}:${String(key)}`;
    if (entry.value === null) {
      fields.delete(id);
    } else {
      fields.set(id, { key, value: entry.value });
    }
  }
  return fields;
};

export type ParsedLiteral =
  | { ok: true; value: Literal }
  | { ok: false; error: string };

const NAME = /[A-Za-z_][A-Za-z0-9_]*/y;
const NUMBER =
  /-?(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:[0-9][0-9_]*(?:\.[0-9_]*)?|\.[0-9][0-9_]*)(?:[eE][+-]?[0-9_]+)?)/y;
const UNWRITTEN_NUMBER = /-?math\.huge(?![\w.])|0\/0(?![\w.])/y;
const LONG_OPEN = /^\[(=*)\[/;
const KEYWORDS = new Set(["nil", "true", "false"]);
/** How deep a literal's tables may nest, which keeps the reader, the writer
 *  and the runtime's copy of a value within the call stack. */
const MAX_TABLE_DEPTH = 64;

/** A number's token as its value, as the compiler reads the literal after
 *  its sign (`numberLiteralValue`). */
const numberOf = (token: string): number => {
  const negative = token.startsWith("-");
  const magnitude = numberLiteralValue(
    (negative ? token.slice(1) : token).replace(/_/g, ""),
  );
  return negative ? -magnitude : magnitude;
};

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

  /** Whether a long string (`[[`, `[==[`) opens here. */
  longOpens() {
    this.skip();
    return LONG_OPEN.test(this.text.slice(this.at));
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
    if (this.longOpens()) {
      return this.long();
    }
    if (char === "`") {
      this.fail("expected a string in quotes; a backtick string is an expression");
    }
    // The numbers no digits write, as the writer writes them.
    const unwritten = this.match(UNWRITTEN_NUMBER);
    if (unwritten !== undefined) {
      return unwritten === "0/0"
        ? NaN
        : unwritten.startsWith("-")
          ? -Infinity
          : Infinity;
    }
    const number = this.match(NUMBER);
    if (number !== undefined) {
      const value = numberOf(number);
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

  /** A quoted string, its escapes checked as the language's lexer checks
   *  them and read as the compiler reads them (`processLuauEscapes`). */
  quoted(quote: string): string {
    const start = this.at + 1;
    let at = start;
    for (;;) {
      const char = this.text[at];
      if (char === undefined || char === "\n" || char === "\r") {
        this.fail(`expected ${quote} to close the string`);
      }
      if (char === quote) {
        break;
      }
      if (char === "\\") {
        at = this.escape(at + 1);
        continue;
      }
      at += 1;
    }
    this.at = at + 1;
    return processLuauEscapes(this.text.slice(start, at));
  }

  /** Checks the escape after the backslash at `at - 1`, and answers where
   *  the text after it starts. */
  escape(at: number): number {
    const escape = this.text[at];
    if (escape === undefined) {
      this.fail("expected an escape after \\");
    }
    if ("abfnrtv\\\"'{\n".includes(escape)) {
      return at + 1;
    }
    if (escape === "\r") {
      return this.text[at + 1] === "\n" ? at + 2 : at + 1;
    }
    if (escape === "z") {
      // It skips the whitespace after it, line breaks included.
      let next = at + 1;
      while (next < this.text.length && /[ \t-\r]/.test(this.text[next]!)) {
        next += 1;
      }
      return next;
    }
    if (escape === "x") {
      if (!/^[0-9a-fA-F]{2}/.test(this.text.slice(at + 1))) {
        this.fail("expected two hex digits after \\x");
      }
      return at + 3;
    }
    if (escape === "u") {
      const match = /^\{([0-9a-fA-F]+)\}/.exec(this.text.slice(at + 1));
      if (!match) {
        this.fail("expected \\u{...} with hex digits");
      }
      if (parseInt(match[1]!, 16) > 0x7fffffff) {
        this.fail(`\\u{${match[1]}} is past the last code point`);
      }
      return at + 1 + match[0].length;
    }
    const digits = /^[0-9]{1,3}/.exec(this.text.slice(at));
    if (!digits) {
      this.fail(`\\${escape} is not an escape`);
    }
    if (Number(digits[0]) > 255) {
      this.fail(`\\${digits[0]} is past the last byte, 255`);
    }
    return at + digits[0].length;
  }

  /** A long string, read as the compiler reads one (`stringLiteralValue`). */
  long(): string {
    const open = LONG_OPEN.exec(this.text.slice(this.at))!;
    const close = `]${open[1]}]`;
    const end = this.text.indexOf(close, this.at + open[0].length);
    if (end < 0) {
      this.fail(`expected ${close} to close the string`);
    }
    const text = this.text.slice(this.at, end + close.length);
    this.at = end + close.length;
    return stringLiteralValue(text, true);
  }

  table(): LiteralTable {
    this.at += 1;
    this.depth += 1;
    if (this.depth > MAX_TABLE_DEPTH) {
      this.fail(`expected no more than ${MAX_TABLE_DEPTH} tables inside each other`);
    }
    const table: LiteralTable = { entries: [] };
    for (;;) {
      if (this.eat("}")) {
        this.depth -= 1;
        return table;
      }
      if (this.peek() === undefined) {
        this.fail("expected } to close the table");
      }
      if (this.peek() === "[" && !this.longOpens()) {
        this.at += 1;
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
        table.entries.push({ key, value: this.value() });
      } else {
        const from = this.at;
        const name = this.match(NAME);
        if (name !== undefined && !KEYWORDS.has(name) && this.eat("=")) {
          table.entries.push({ key: name, value: this.value() });
        } else {
          this.at = from;
          table.entries.push({ value: this.value() });
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
              : // Three digits, so a digit after it is not read into it.
                `\\${String(c.charCodeAt(0)).padStart(3, "0")}`,
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
 *  `{ name = "Ana", hp = 10 }`. A table read from a value that held more
 *  than a literal writes (`partial`) ends with `…`. */
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
  const entries = value.entries.map((entry) => {
    if (!("key" in entry)) {
      return formatLiteral(entry.value);
    }
    const { key } = entry;
    return typeof key === "string" &&
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) &&
      !KEYWORDS.has(key)
      ? `${key} = ${formatLiteral(entry.value)}`
      : `[${formatLiteral(key)}] = ${formatLiteral(entry.value)}`;
  });
  if (value.partial) {
    entries.push("…");
  }
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
  /** The type a value given it is checked against: the store's annotation
   *  (`declared`) or, without one, its first value's; none for a
   *  parameter, which takes any value, or for an annotation that is not one
   *  literal type (a union, a named type), which takes any value too. */
  type?: LiteralType;
  /** The type is the store's annotation. */
  declared?: boolean;
  /** The annotation is optional (`number?`), so nil is of its type. */
  nullable?: boolean;
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
  if (
    item.type &&
    // A store that starts as nil, with no annotation, takes any value.
    !(item.type === "nil" && !item.declared) &&
    type !== item.type &&
    !(type === "nil" && item.nullable)
  ) {
    return {
      status: "warning",
      message: item.declared
        ? `${item.name} is declared as ${article(item.type)}. This still applies.`
        : `${item.name} starts as ${article(item.type)}. This still applies.`,
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
