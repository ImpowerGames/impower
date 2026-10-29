import { RESERVED } from "../compiler/utils/luauReservedWords";
import { numberLiteralValue } from "../compiler/utils/numberLiteralValue";
import {
  processLuauEscapes,
  stringLiteralValue,
} from "../compiler/utils/stringLiteralValue";

export type StartingValueSet = Record<string, string>;

export type StartingValues = Record<string, StartingValueSet>;

export const TOP_LEVEL_FLOW = "0";

export const SEED_KEY = "seed";

export const paramKey = (name: string) => `param:${name}`;

export const storeKey = (path: string) => `store:${path}`;

export const visitsKey = (name: string) => `visits:${name}`;

export const placeKey = (uri: string, line: number, index = 0) =>
  `place:${index}:${line}:${uri}`;

export interface PlaceKey {
  uri: string;
  line: number;
  index: number;
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

export const movePlaceKey = (key: string, line: number | null): string => {
  const place = readPlaceKey(key);
  if (!place) {
    return key;
  }
  return line === null
    ? `place:${place.index}:~${place.line}:${place.uri}`
    : placeKey(place.uri, line, place.index);
};

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

export const ownEntry = <T>(
  record: Readonly<Record<string, T>> | undefined,
  key: string,
): T | undefined =>
  record && Object.hasOwn(record, key) ? record[key] : undefined;

const setOwnEntry = <T>(record: Record<string, T>, key: string, value: T) => {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
};

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

export type LiteralEntry =
  | { value: Literal }
  | { key: Exclude<Literal, null>; value: Literal };

export interface LiteralTable {
  entries: LiteralEntry[];
  partial?: boolean;
}

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
const MAX_TABLE_DEPTH = 64;

const numberOf = (token: string): number => {
  const negative = token.startsWith("-");
  const magnitude = numberLiteralValue(
    (negative ? token.slice(1) : token).replace(/_/g, ""),
  );
  return negative ? -magnitude : magnitude;
};

class LiteralReader {
  at = 0;
  depth = 0;
  constructor(readonly text: string) {}

  fail(message: string): never {
    throw new LiteralError(message);
  }

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

  longOpens() {
    this.skip();
    return LONG_OPEN.test(this.text.slice(this.at));
  }

  value(): Literal {
    const char = this.peek();
    if (char === undefined) {
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
        if (name !== undefined && this.eat("=")) {
          if (RESERVED.has(name)) {
            this.fail(
              `${name} is a reserved word, so a key named it is written ["${name}"]`,
            );
          }
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
              : `\\${String(c.charCodeAt(0)).padStart(3, "0")}`,
  )}"`;

const formatNumber = (n: number) =>
  Number.isNaN(n)
    ? "0/0"
    : n === Infinity
      ? "math.huge"
      : n === -Infinity
        ? "-math.huge"
        : Object.is(n, -0)
          ? "-0"
          : String(n);

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
      !RESERVED.has(key)
      ? `${key} = ${formatLiteral(entry.value)}`
      : `[${formatLiteral(key)}] = ${formatLiteral(entry.value)}`;
  });
  if (value.partial) {
    entries.push("…");
  }
  return entries.length === 0 ? "{ }" : `{ ${entries.join(", ")} }`;
};

export type StartingValueGroup =
  | "parameters"
  | "stores"
  | "visits"
  | "randomization";

export interface StartingValueItem {
  key: string;
  group: StartingValueGroup;
  name: string;
  uri?: string;
  line?: number;
  first: string;
  type?: LiteralType;
  declared?: boolean;
  nullable?: boolean;
  fields?: StartingValueItem[];
}

export interface StartingValueListing {
  start: string;
  items: StartingValueItem[];
}

export const listingItems = (
  listing: StartingValueListing | undefined,
): StartingValueItem[] =>
  (listing?.items ?? []).flatMap((item) => [item, ...(item.fields ?? [])]);

export type StartingValueCheck =
  | { status: "ok" }
  | { status: "warning" | "error"; message: string };

const article = (type: LiteralType) => (type === "nil" ? "nil" : `a ${type}`);

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

export const unresolvedName = (key: string): string => {
  const place = readPlaceKey(key);
  if (place) {
    return `line ${place.line + 1}`;
  }
  return key.slice(key.indexOf(":") + 1);
};
