import { tableFromPairs } from "../runtime/evaluation";
import { JsonSerialisation } from "../runtime/JsonSerialisation";
import { VariableAssignment } from "../runtime/VariableAssignment";
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
import { ProgramStory } from "./ProgramStory";
import { flowScopesOf } from "./ProgramStoryState";
import { START_FLOW_NAME, SymbolKind, countIdOf } from "./ProgramSymbols";
import {
  SEED_KEY,
  formatLiteral,
  isLiteralTable,
  literalTableFields,
  literalTypeOf,
  paramKey,
  parseLiteral,
  placeKey,
  storeKey,
  visitsKey,
  type Literal,
  type LiteralTable,
  type LiteralType,
  type StartingValueItem,
  type StartingValueListing,
  type StartingValueSet,
} from "./startingValueLiterals";

export interface StartingValueSource {
  uris: readonly string[];
  lineText(uri: string, line: number): string | undefined;
  flows: readonly { name: string; uri: string; line: number }[];
  storeTypes?: Readonly<Record<string, string>>;
}

const declaredType = (
  annotation: string | undefined,
): { type?: LiteralType; nullable: boolean } | undefined => {
  if (annotation === undefined) {
    return undefined;
  }
  const nullable = annotation.endsWith("?");
  const type = nullable ? annotation.slice(0, -1).trimEnd() : annotation;
  if (/^(number|string|boolean|nil|table)$/.test(type)) {
    return { type: type as LiteralType, nullable };
  }
  if (type.startsWith("{")) {
    let depth = 0;
    for (let i = 0; i < type.length; i += 1) {
      depth += type[i] === "{" ? 1 : type[i] === "}" ? -1 : 0;
      if (depth === 0) {
        return i === type.length - 1
          ? { type: "table", nullable }
          : { nullable: false };
      }
    }
  }
  return { nullable: false };
};

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
    const table: LiteralTable = { entries: [] };
    let position = 1;
    let gap = false;
    for (; map.has(String(position)); position++) {
      const item = literalOfValue(map.get(String(position)), depth + 1);
      if (item === undefined) {
        gap = true;
        table.partial = true;
      } else if (gap) {
        table.entries.push({ key: position, value: item });
      } else {
        table.entries.push({ value: item });
      }
    }
    for (const [key, field] of map) {
      if (/^[1-9]\d*$/.test(key) && Number(key) < position) {
        continue;
      }
      const keyed = /^__(tableid|stdlibfn):/.test(key);
      const item = keyed ? undefined : literalOfValue(field, depth + 1);
      if (item === undefined) {
        table.partial = true;
        continue;
      }
      table.entries.push({
        key: /^-?\d+(\.\d+)?$/.test(key) ? Number(key) : key,
        value: item,
      });
    }
    return table;
  }
  return undefined;
};

export const valueOfLiteral = (literal: Literal): AbstractValue => {
  if (literal === null) {
    return new NullValue();
  }
  if (isLiteralTable(literal)) {
    const pairs: AbstractValue[] = [];
    let position = 1;
    for (const entry of literal.entries) {
      const key = "key" in entry ? entry.key : position++;
      pairs.push(
        typeof key === "string" ? new StringValue(key) : valueOfLiteral(key),
        valueOfLiteral(entry.value),
      );
    }
    return tableFromPairs(pairs, 0);
  }
  return Value.Create(literal)!;
};

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

const scriptNameOf = (
  value: InkObject | null | undefined,
): string | undefined => {
  if (
    !(value instanceof ObjectValue) ||
    !(value.metatable instanceof ObjectValue)
  ) {
    return undefined;
  }
  const meta = value.metatable.value as Map<string, AbstractValue>;
  const own = meta.get("__define");
  const type = meta.get("__defineParent");
  return own instanceof StringValue && type instanceof StringValue
    ? `${type.value}.${own.value}`
    : undefined;
};

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

export const optionTextOf = (line: string): string => {
  const body = line.replace(/^\s*[*+]+\s*/, "");
  const bracketed = /\[([^\]]*)\]/.exec(body);
  return (bracketed ? bracketed[1]! : body).trim();
};

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

interface ListedPart<T> {
  items: StartingValueItem[];
  targets: Map<string, T>;
}

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

export const carryStoreListing = (
  from: ProgramRoot,
  to: ProgramRoot,
  storeTypesBefore: Readonly<Record<string, string>> | undefined,
  storeTypes: Readonly<Record<string, string>> | undefined,
): void => {
  const stores = listed.get(from)?.stores;
  if (
    stores &&
    JSON.stringify(storeTypesBefore ?? null) === JSON.stringify(storeTypes ?? null)
  ) {
    listedProgram(to).stores = stores;
  }
};

const parametersOf = (root: ProgramRoot, from: string): string[] => {
  const flow = root.flowNamed(from);
  return (flow ? entryParameters(root, flow) : [])
    .filter((param) => !param.vararg)
    .map((param) => param.name);
};

const freshStories = new WeakMap<ProgramRoot, ProgramStory>();

const freshStoryOf = (root: ProgramRoot): ProgramStory => {
  let story = freshStories.get(root);
  if (!story) {
    story = new ProgramStory(root);
    if (story.state.previousRandom !== 0 || story.state.storySeed !== 0) {
      story.resetSeed = 0;
      story.ResetState();
    }
    freshStories.set(root, story);
  }
  return story;
};

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
  const variables = freshStoryOf(root).state.variablesState;
  for (const uri of source.uris) {
    const declarations = root.declarations(uri);
    for (const chunk of declarations?.arrays.chunks ?? []) {
      for (const name of globalsDeclaredBy(root, chunk)) {
        if (constants.has(name) || targets.has(storeKey(name))) {
          continue;
        }
        const value =
          variables.DefaultGlobal(name) ??
          (variables.GetVariableWithName(name) as InkObject | null);
        const listedName = name.startsWith("$") ? scriptNameOf(value) : name;
        if (listedName === undefined) {
          continue;
        }
        if (value instanceof ObjectValue && value.metatable) {
          const define = JsonSerialisation.defineSerializationInfo(value);
          for (const field of define?.storeNames ?? []) {
            const path = `${listedName}.${field}`;
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
        const declared = declaredType(
          source.storeTypes && Object.hasOwn(source.storeTypes, name)
            ? source.storeTypes[name]
            : undefined,
        );
        const type = declared ? declared.type : literalTypeOf(first);
        const item: StartingValueItem = {
          key: storeKey(name),
          group: "stores",
          name,
          first: formatLiteral(first),
          ...(type ? { type } : {}),
          ...(declared
            ? { declared: true, ...(declared.nullable ? { nullable: true } : {}) }
            : {}),
        };
        targets.set(item.key, [name]);
        const fields = isLiteralTable(first)
          ? [...literalTableFields(first).values()]
          : [];
        if (fields.length > 0) {
          item.fields = [];
          for (const { key: field, value: fieldValue } of fields) {
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

const scriptOrder = (source: StartingValueSource, uri: string) => {
  const index = source.uris.indexOf(uri);
  return index < 0 ? source.uris.length : index;
};

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

export interface StartPlan {
  from: string;
  seed: number | null;
  stores: [path: string[], value: Literal][];
  counts: [countId: number, visits: number][];
  args?: Literal[];
}

export const startPlanKey = (plan: StartPlan | null | undefined): string =>
  JSON.stringify(plan ?? null, (_key, value) =>
    typeof value === "number" &&
    (!Number.isFinite(value) || Object.is(value, -0))
      ? { number: formatLiteral(value) }
      : value,
  );

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
  plan.stores.sort((a, b) => a[0].length - b[0].length);
  if (lastArg >= 0) {
    plan.args = Array.from({ length: lastArg + 1 }, (_, i) => args[i] ?? null);
  }
  return plan;
};

export const planSetsParameters = (plan: StartPlan | undefined): boolean =>
  plan?.args !== undefined;

export const startStoryAt = (story: ProgramStory, plan: StartPlan): void => {
  story.resetSeed = plan.seed;
  const reseed = plan.seed !== null && story.state.storySeed !== plan.seed;
  if (story.stateIsPristine && reseed && story.state.previousRandom === 0) {
    story.state.storySeed = plan.seed!;
  } else if (!story.stateIsPristine || reseed) {
    story.CancelAsyncContinue();
    story.ResetState();
  }
  applyStartValues(story, plan);
  if (plan.from === START_FLOW_NAME) {
    story.ChooseStart();
    return;
  }
  story.ChoosePathString(
    plan.from,
    true,
    plan.args?.map((literal) => valueOfLiteral(literal)) ?? [],
  );
};

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

export const bindStartArguments = (
  story: ProgramStory,
  plan: StartPlan,
): void => {
  const params = parametersOf(story.root!, plan.from);
  if (params.length === 0) {
    return;
  }
  const scopes = story.state.frame?.temporaryScopes;
  const position = story.state.position;
  const sceneScope =
    scopes &&
    scopes.length > 1 &&
    position &&
    flowScopesOf(story.root!, position.sequence) > 0
      ? scopes[1]
      : undefined;
  params.forEach((name, i) => {
    const value = valueOfLiteral(plan.args?.[i] ?? null);
    if (sceneScope) {
      sceneScope.set(name, value);
    } else {
      story.state.variablesState.Assign(
        new VariableAssignment(name, true, false, false),
        value,
      );
    }
  });
};
