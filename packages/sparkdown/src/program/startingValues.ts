/**
 * Starting values in the engine: what a start can take, read from the
 * program and the state its declarations build, and the start of a route
 * with the values the author set for it. The route search, the game's replay
 * of a route and its other starts all start a story through `startStoryAt`,
 * so that each arrives at the same state.
 */
import { JsonSerialisation } from "../runtime/JsonSerialisation";
import type { InkObject } from "../runtime/Object";
import {
  AbstractValue,
  BoolValue,
  FloatValue,
  IntValue,
  NullValue,
  ObjectValue,
  StringValue,
  Value,
} from "../runtime/Value";
import {
  HEADER_WORDS,
  addressOf,
  chunkId,
  codeWords,
  type ProgramChunk,
} from "./ProgramChunk";
import {
  CHOICE_ONCE,
  Op,
  SET_DECLARE,
  SET_GLOBAL,
  flagsOf,
  opOf,
} from "./ProgramInstructions";
import type { ProgramRoot } from "./ProgramRoot";
import { entryParameters } from "./ProgramSave";
import type { ProgramStory } from "./ProgramStory";
import { SymbolKind, countIdOf } from "./ProgramSymbols";
import {
  SEED_KEY,
  TOP_LEVEL_FLOW,
  formatLiteral,
  isLiteralTable,
  literalTypeOf,
  paramKey,
  parseLiteral,
  placeKey,
  storeKey,
  visitsKey,
  type Literal,
  type StartingValueItem,
  type StartingValueListing,
  type StartingValueSet,
} from "./startingValueLiterals";

/** What a listing reads of the scripts besides the program: their order,
 *  each line's text, and the scenes, branches and labels they declare, each
 *  with its line. */
export interface StartingValueSource {
  uris: readonly string[];
  lineText(uri: string, line: number): string | undefined;
  flows: readonly { name: string; uri: string; line: number }[];
}

/** A runtime value as a literal, or nothing for one no literal writes (a
 *  function, or a table with a metatable). */
export const literalOfValue = (
  value: InkObject | null | undefined,
  depth = 0,
): Literal | undefined => {
  if (value == null || value instanceof NullValue) {
    return null;
  }
  if (value instanceof BoolValue) {
    return value.value;
  }
  if (value instanceof IntValue || value instanceof FloatValue) {
    return value.value;
  }
  if (value instanceof StringValue) {
    return value.value;
  }
  if (value instanceof ObjectValue && !value.metatable && depth < 8) {
    const map = value.value as Map<string, AbstractValue>;
    if (map.has("__closure_fn") || map.has("__stdlib_fn")) {
      return undefined;
    }
    const table: Exclude<Literal, null | boolean | number | string> = {
      list: [],
      fields: [],
    };
    for (let i = 1; map.has(String(i)); i++) {
      const item = literalOfValue(map.get(String(i)), depth + 1);
      if (item === undefined) {
        return undefined;
      }
      table.list.push(item);
    }
    for (const [key, field] of map) {
      if (/^[1-9]\d*$/.test(key) && Number(key) <= table.list.length) {
        continue;
      }
      const item = literalOfValue(field, depth + 1);
      if (item === undefined) {
        return undefined;
      }
      table.fields.push([/^-?\d+(\.\d+)?$/.test(key) ? Number(key) : key, item]);
    }
    return table;
  }
  return undefined;
};

/** A literal as the runtime value it makes, a table a fresh one. */
export const valueOfLiteral = (literal: Literal): AbstractValue => {
  if (literal === null) {
    return new NullValue();
  }
  if (isLiteralTable(literal)) {
    const entries = new Map<string, AbstractValue>();
    literal.list.forEach((item, i) => {
      if (item !== null) {
        entries.set(String(i + 1), valueOfLiteral(item));
      }
    });
    for (const [key, item] of literal.fields) {
      const keyString =
        typeof key === "string" ? key : valueOfLiteral(key).toString();
      if (item === null) {
        entries.delete(keyString);
      } else {
        entries.set(keyString, valueOfLiteral(item));
      }
    }
    return new ObjectValue(entries);
  }
  return Value.Create(literal)!;
};

/** The names each `SetVar` of a declaration chunk declares a global under. */
const globalsDeclaredBy = (root: ProgramRoot, chunk: ProgramChunk): string[] => {
  const names: string[] = [];
  for (let at = 0; at < codeWords(chunk); at += 2) {
    const w0 = chunk[HEADER_WORDS + at]!;
    if (
      opOf(w0) === Op.SetVar &&
      (flagsOf(w0) & (SET_DECLARE | SET_GLOBAL)) === (SET_DECLARE | SET_GLOBAL)
    ) {
      names.push(root.table.strings[chunk[HEADER_WORDS + at + 1]!]!);
    }
  }
  return names;
};

/** A table's field, read through its `__index` chain as a define instance
 *  reads its defaults. */
const fieldOf = (table: ObjectValue, field: string): AbstractValue | undefined => {
  let current: ObjectValue | null = table;
  for (let guard = 0; current && guard < 64; guard++) {
    const own = (current.value as Map<string, AbstractValue>).get(field);
    if (own !== undefined) {
      return own;
    }
    const index: AbstractValue | undefined = current.metatable
      ? (current.metatable.value as Map<string, AbstractValue>).get("__index")
      : undefined;
    current = index instanceof ObjectValue ? index : null;
  }
  return undefined;
};

const firstOf = (value: Literal | undefined) =>
  value === undefined ? "nil" : formatLiteral(value);

const typeOf = (value: Literal | undefined) =>
  value === undefined ? undefined : literalTypeOf(value);

/** The text a once-only option is written with on its line. */
export const optionTextOf = (line: string): string => {
  const body = line.replace(/^\s*[*+]+\s*/, "");
  const bracketed = /\[([^\]]*)\]/.exec(body);
  return (bracketed ? bracketed[1]! : body).trim();
};

/** An alternator's first alternative: its first arm written after a `|` on
 *  its own line, or on the first line after it that starts with one. */
const firstAlternativeOf = (
  source: StartingValueSource,
  uri: string,
  line: number,
): string => {
  const own = source.lineText(uri, line) ?? "";
  const bar = own.indexOf("|");
  if (bar >= 0) {
    return own.slice(bar + 1).split(/\||\s\.\./)[0]!.trim();
  }
  for (let next = line + 1; next < line + 50; next++) {
    const text = source.lineText(uri, next);
    if (text === undefined) {
      break;
    }
    const arm = /^\s*\|(.*)$/.exec(text);
    if (arm) {
      return arm[1]!.trim();
    }
  }
  return own.trim();
};

/** The once-only options and alternators of the program, each with its
 *  count id and where it is written. */
const countedPlaces = (
  root: ProgramRoot,
): { countId: number; kind: "option" | "alternator"; uri: string; line: number; column: number }[] => {
  const places: {
    countId: number;
    kind: "option" | "alternator";
    uri: string;
    line: number;
    column: number;
  }[] = [];
  const seen = new Set<number>();
  for (const sequence of root.sequences()) {
    for (const chunk of sequence.arrays.chunks) {
      const words = codeWords(chunk);
      for (let at = 0; at < words; at += 2) {
        const w0 = chunk[HEADER_WORDS + at]!;
        const arg = chunk[HEADER_WORDS + at + 1]!;
        let symbol = -1;
        let kind: "option" | "alternator" | undefined;
        if (opOf(w0) === Op.Choice && flagsOf(w0) & CHOICE_ONCE) {
          const entry = at + 2 + arg;
          const visit = chunk[HEADER_WORDS + entry];
          if (visit !== undefined && opOf(visit) === Op.Visit) {
            symbol = chunk[HEADER_WORDS + entry + 1]!;
            kind = "option";
          }
        } else if (opOf(w0) === Op.Visit && root.kindOf(arg) === SymbolKind.Alternator) {
          symbol = arg;
          kind = "alternator";
        }
        if (!kind) {
          continue;
        }
        const countId = countIdOf(root.table, symbol);
        if (countId < 0 || seen.has(countId)) {
          continue;
        }
        const location = root.locationOf(addressOf(chunkId(chunk), at));
        if (!location) {
          continue;
        }
        seen.add(countId);
        places.push({
          countId,
          kind,
          uri: location.uri,
          line: location.startLine,
          column: location.startColumn,
        });
      }
    }
  }
  return places;
};

/** What a part of a start's listing lists, and how each of its keys is
 *  applied: a store's path, or the count id of what a visits key counts. */
interface ListedPart<T> {
  items: StartingValueItem[];
  targets: Map<string, T>;
}

/** The parts of the listings of a program's starts, kept for its root. The
 *  stores and the counted places are the same for every start. */
interface ListedProgram {
  stores?: ListedPart<string[]>;
  places?: ListedPart<number>;
  flows?: ListedPart<number>;
  starts: Map<string, StartingValueListing>;
}

const listed = new WeakMap<ProgramRoot, ListedProgram>();

const listedProgram = (root: ProgramRoot): ListedProgram => {
  let kept = listed.get(root);
  if (!kept) {
    kept = { starts: new Map() };
    listed.set(root, kept);
  }
  return kept;
};

/** The parameters the start `from` binds, but its `...`. */
const parametersOf = (root: ProgramRoot, from: string): string[] => {
  const flow = from === TOP_LEVEL_FLOW ? undefined : root.flowNamed(from);
  return (flow ? entryParameters(root, flow) : [])
    .filter((param) => !param.vararg)
    .map((param) => param.name);
};

/** The program's stores, in the order the scripts declare them, with a
 *  define's `store` fields and a table store's fields, each with its first
 *  value. */
const storesOf = (
  story: ProgramStory,
  source: StartingValueSource,
): ListedPart<string[]> => {
  const root = story.root!;
  const program = listedProgram(root);
  if (program.stores) {
    return program.stores;
  }
  const items: StartingValueItem[] = [];
  const targets = new Map<string, string[]>();
  const constants = root.tables?.constantNames ?? new Set<string>();
  const variables = story.state.variablesState;
  for (const uri of source.uris) {
    const declarations = root.declarations(uri);
    for (const chunk of declarations?.arrays.chunks ?? []) {
      for (const name of globalsDeclaredBy(root, chunk)) {
        if (constants.has(name) || name.startsWith("$") || targets.has(storeKey(name))) {
          continue;
        }
        const value =
          variables.DefaultGlobal(name) ??
          (variables.GetVariableWithName(name) as InkObject | null);
        if (value instanceof ObjectValue && value.metatable) {
          const define = JsonSerialisation.defineSerializationInfo(value);
          for (const field of define?.storeNames ?? []) {
            const path = `${name}.${field}`;
            const first = literalOfValue(fieldOf(value, field));
            targets.set(storeKey(path), [name, field]);
            items.push({
              key: storeKey(path),
              group: "stores",
              name: path,
              first: firstOf(first),
              type: typeOf(first),
            });
          }
          continue;
        }
        const first = literalOfValue(value);
        if (first === undefined) {
          continue;
        }
        const item: StartingValueItem = {
          key: storeKey(name),
          group: "stores",
          name,
          first: formatLiteral(first),
          type: literalTypeOf(first),
        };
        targets.set(item.key, [name]);
        if (isLiteralTable(first) && first.fields.length > 0) {
          item.fields = [];
          for (const [field, fieldValue] of first.fields) {
            if (typeof field !== "string") {
              continue;
            }
            const key = storeKey(`${name}.${field}`);
            targets.set(key, [name, field]);
            item.fields.push({
              key,
              group: "stores",
              name: `.${field}`,
              first: formatLiteral(fieldValue),
              type: literalTypeOf(fieldValue),
            });
          }
        }
        items.push(item);
      }
    }
  }
  program.stores = { items, targets };
  return program.stores;
};

/** Where a script stands in the order the scripts are listed in. */
const scriptOrder = (source: StartingValueSource, uri: string) => {
  const index = source.uris.indexOf(uri);
  return index < 0 ? source.uris.length : index;
};

/** The program's scenes, branches and labels, by their qualified names. */
const flowsOf = (
  story: ProgramStory,
  source: StartingValueSource,
): ListedPart<number> => {
  const root = story.root!;
  const program = listedProgram(root);
  if (program.flows) {
    return program.flows;
  }
  const items: StartingValueItem[] = [];
  const targets = new Map<string, number>();
  for (const flow of source.flows) {
    const countId = story.state.CountIdOfKey(flow.name, root.generation);
    if (countId < 0) {
      continue;
    }
    const key = visitsKey(flow.name);
    targets.set(key, countId);
    items.push({
      key,
      group: "visits",
      name: flow.name,
      uri: flow.uri,
      line: flow.line,
      first: "0",
      type: "number",
    });
  }
  program.flows = { items, targets };
  return program.flows;
};

/** The program's once-only options and alternators, each by its line and
 *  named by its text or its first alternative. Read from every chunk of the
 *  program, so read only when a listing or a value of one asks for them. */
const placesOf = (
  story: ProgramStory,
  source: StartingValueSource,
): ListedPart<number> & { columns: Map<string, number> } => {
  const root = story.root!;
  const program = listedProgram(root);
  if (program.places) {
    return program.places as ListedPart<number> & { columns: Map<string, number> };
  }
  const items: StartingValueItem[] = [];
  const targets = new Map<string, number>();
  const columns = new Map<string, number>();
  const places = countedPlaces(root).sort(
    (a, b) =>
      scriptOrder(source, a.uri) - scriptOrder(source, b.uri) ||
      a.line - b.line ||
      a.column - b.column,
  );
  let previous: { uri: string; line: number } | undefined;
  let index = 0;
  for (const place of places) {
    index =
      previous && previous.uri === place.uri && previous.line === place.line
        ? index + 1
        : 0;
    previous = place;
    const key = placeKey(place.uri, place.line, index);
    targets.set(key, place.countId);
    columns.set(key, place.column);
    items.push({
      key,
      group: "visits",
      name:
        place.kind === "option"
          ? optionTextOf(source.lineText(place.uri, place.line) ?? "")
          : firstAlternativeOf(source, place.uri, place.line),
      uri: place.uri,
      line: place.line,
      first: "0",
      type: "number",
    });
  }
  const part = { items, targets, columns };
  program.places = part;
  return part;
};

/**
 * What the start `from` (a scene's or a branch's qualified name, or `"0"`
 * for the top-level content) can take, read from a story the program's
 * declarations have run in: the start's parameters, the program's stores
 * with a define's `store` fields and a table store's fields, the scenes,
 * branches and labels, once-only options and alternators it counts, and the
 * seed, each with its first value. Kept for each program and start.
 */
export const startingValueListing = (
  story: ProgramStory,
  from: string,
  source: StartingValueSource,
): StartingValueListing => {
  const program = listedProgram(story.root!);
  const kept = program.starts.get(from);
  if (kept) {
    return kept;
  }
  const items: StartingValueItem[] = parametersOf(story.root!, from).map(
    (name) => ({
      key: paramKey(name),
      group: "parameters",
      name,
      first: "nil",
    }),
  );
  items.push(...storesOf(story, source).items);
  // The visits in script order: a flow before the places on its line.
  const places = placesOf(story, source);
  const visits = [...flowsOf(story, source).items, ...places.items];
  const column = (item: StartingValueItem) => places.columns.get(item.key) ?? -1;
  visits.sort(
    (a, b) =>
      scriptOrder(source, a.uri!) - scriptOrder(source, b.uri!) ||
      a.line! - b.line! ||
      column(a) - column(b),
  );
  items.push(...visits);
  items.push({
    key: SEED_KEY,
    group: "randomization",
    name: "seed",
    first: "0",
    type: "number",
  });
  const listing = { start: from, items };
  program.starts.set(from, listing);
  return listing;
};

/** How a story starts a route: the seed its reset takes, the stores and the
 *  counts set after the reset, and the arguments it enters the start
 *  with. Built for one program (`startPlanOf`). */
export interface StartPlan {
  from: string;
  /** The seed, or null for one drawn from the clock. */
  seed: number | null;
  stores: [path: string[], value: Literal][];
  counts: [countId: number, visits: number][];
  /** The parameters' values in order, up to the last one set; nothing when
   *  none is set. */
  args?: Literal[];
}

/**
 * The plan of a start with the values `set`: each value that parses and
 * whose key resolves, the rest left out, as a route ignores a value whose
 * name or line no longer resolves. An unset seed is `unsetSeed`. It reads
 * of the program only what the keys set ask for: a start with no values
 * reads nothing, and only a value of an option or an alternator reads the
 * program's chunks for them.
 */
export const startPlanOf = (
  story: ProgramStory,
  from: string,
  source: StartingValueSource,
  set: StartingValueSet | undefined,
  unsetSeed: number | null,
): StartPlan => {
  const plan: StartPlan = { from, seed: unsetSeed, stores: [], counts: [] };
  const args: Literal[] = [];
  let lastArg = -1;
  let params: string[] | undefined;
  for (const [key, text] of Object.entries(set ?? {})) {
    const parsed = parseLiteral(text);
    if (!parsed.ok) {
      continue;
    }
    const value = parsed.value;
    const count =
      typeof value === "number" && Number.isInteger(value) && value >= 0
        ? value
        : undefined;
    if (key === SEED_KEY) {
      if (typeof value === "number" && Number.isInteger(value)) {
        plan.seed = value;
      }
    } else if (key.startsWith("param:")) {
      params ??= parametersOf(story.root!, from);
      const param = params.findIndex((name) => paramKey(name) === key);
      if (param >= 0) {
        args[param] = value;
        lastArg = Math.max(lastArg, param);
      }
    } else if (key.startsWith("store:")) {
      const path = storesOf(story, source).targets.get(key);
      if (path) {
        plan.stores.push([path, value]);
      }
    } else if (count !== undefined) {
      const countId = key.startsWith("visits:")
        ? flowsOf(story, source).targets.get(key)
        : placesOf(story, source).targets.get(key);
      if (countId !== undefined) {
        plan.counts.push([countId, count]);
      }
    }
  }
  // A whole table is set before the fields set over it.
  plan.stores.sort((a, b) => a[0].length - b[0].length);
  if (lastArg >= 0) {
    plan.args = Array.from({ length: lastArg + 1 }, (_, i) => args[i] ?? null);
  }
  return plan;
};

/** Whether a plan sets any of its start's parameters. */
export const planSetsParameters = (plan: StartPlan | undefined): boolean =>
  plan?.args !== undefined;

/**
 * Resets the story and starts it at the top of its plan's start with the
 * plan's values: the seed before the declarations run, with its last draw
 * reset, then the stores and the visit counts, a count above zero with the
 * turn before the start as its last visit, then the start entered with the
 * parameters' values as its arguments. A story that was reset with the same
 * seed and has not run since is in the state a reset would build, and is
 * not reset again.
 */
export const startStoryAt = (story: ProgramStory, plan: StartPlan): void => {
  story.resetSeed = plan.seed;
  const reseed = plan.seed !== null && story.state.storySeed !== plan.seed;
  if (story.stateIsPristine && reseed && story.state.previousRandom === 0) {
    // Nothing has drawn from the seed the reset gave it, the declarations
    // included, so the state is the one a reset with the plan's seed builds,
    // and running every declaration again would only arrive back here.
    story.state.storySeed = plan.seed!;
  } else if (!story.stateIsPristine || reseed) {
    story.CancelAsyncContinue();
    story.ResetState();
  }
  applyStartValues(story, plan);
  story.ChoosePathString(
    plan.from,
    true,
    plan.args?.map((literal) => valueOfLiteral(literal)) ?? [],
  );
};

/** Sets a plan's stores and visit counts on a story just reset, before it
 *  moves: a count above zero with the turn before the start as its last
 *  visit. */
export const applyStartValues = (story: ProgramStory, plan: StartPlan): void => {
  const variables = story.state.variablesState;
  for (const [path, literal] of plan.stores) {
    const value = valueOfLiteral(literal);
    if (path.length === 1) {
      variables.SetGlobal(path[0]!, value);
      continue;
    }
    let table = variables.GetVariableWithName(path[0]!) as unknown;
    for (const field of path.slice(1, -1)) {
      table =
        table instanceof ObjectValue
          ? (table.value as Map<string, AbstractValue>).get(field)
          : undefined;
    }
    if (!(table instanceof ObjectValue)) {
      continue;
    }
    variables.WriteBarrier(table);
    const map = table.value as Map<string, AbstractValue>;
    if (value instanceof NullValue) {
      map.delete(path.at(-1)!);
    } else {
      map.set(path.at(-1)!, value);
    }
  }
  const turn = story.state.currentTurnIndex;
  for (const [countId, visits] of plan.counts) {
    story.state.SetCount(countId, visits, visits > 0 ? turn : null);
  }
};
