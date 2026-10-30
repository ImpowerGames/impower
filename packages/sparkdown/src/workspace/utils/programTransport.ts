import type { SparkProgram } from "../../compiler/types/SparkProgram";

const SHARED_PARTS = ["layers", "folders", "groups"] as const;

interface SharedPart {
  $shared: number;
  value?: unknown;
}

const isShared = (value: unknown): value is SharedPart =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as SharedPart).$shared === "number";

type StructTables = Record<string, Record<string, any> | undefined>;

const mapTable = (
  table: Record<string, any> | undefined,
  mapVocabulary: (vocabulary: any) => any,
) => {
  if (!table || typeof table !== "object") {
    return table;
  }
  let out: Record<string, any> | undefined;
  for (const name of Object.keys(table)) {
    const struct = table[name];
    const vocabulary = struct?.attribute_vocabulary;
    if (vocabulary && typeof vocabulary === "object") {
      out ??= { ...table };
      out[name] = { ...struct, attribute_vocabulary: mapVocabulary(vocabulary) };
    }
  }
  return out ?? table;
};

const mapTables = (
  tables: StructTables | undefined,
  mapVocabulary: (vocabulary: any) => any,
) => {
  if (!tables || typeof tables !== "object") {
    return tables;
  }
  let out: StructTables | undefined;
  for (const type of Object.keys(tables)) {
    const table = tables[type];
    const mapped = mapTable(table, mapVocabulary);
    if (mapped !== table) {
      out ??= { ...tables };
      out[type] = mapped;
    }
  }
  return out ?? tables;
};

const forEachVocabulary = (
  tables: Record<string, any> | undefined,
  depth: 1 | 2,
  visit: (vocabulary: any) => void,
) => {
  if (!tables || typeof tables !== "object") {
    return;
  }
  for (const key of Object.keys(tables)) {
    const value = tables[key];
    if (depth === 2) {
      forEachVocabulary(value, 1, visit);
    } else if (value?.attribute_vocabulary && typeof value.attribute_vocabulary === "object") {
      visit(value.attribute_vocabulary);
    }
  }
};

export class ProgramTransportEncoder {
  protected _ids = new WeakMap<object, number>();
  protected _nextId = 1;
  protected _held = new Set<number>();

  encode<T extends SparkProgram | undefined>(program: T): T {
    if (!program) {
      return program;
    }
    const used = new Set<number>();
    const share = (part: object): SharedPart => {
      let id = this._ids.get(part);
      if (id === undefined) {
        id = this._nextId++;
        this._ids.set(part, id);
      }
      const known = this._held.has(id) || used.has(id);
      used.add(id);
      return known ? { $shared: id } : { $shared: id, value: part };
    };
    const encodeVocabulary = (vocabulary: any) => {
      const out = { ...vocabulary };
      for (const key of SHARED_PARTS) {
        const part = vocabulary[key];
        if (part && typeof part === "object") {
          out[key] = share(part);
        }
      }
      return out;
    };
    const out: SparkProgram = { ...program };
    delete out.chunks;
    if (program.files) {
      out.files = mapTable(program.files, encodeVocabulary) as SparkProgram["files"];
    }
    if (program.context) {
      out.context = mapTables(program.context, encodeVocabulary) as SparkProgram["context"];
    }
    if (program.assets) {
      out.assets = mapTables(program.assets, encodeVocabulary) as SparkProgram["assets"];
    }
    this._held = used;
    return out as T;
  }
}

export class ProgramTransportDecoder {
  protected _held = new Map<number, unknown>();

  decode<T extends SparkProgram | undefined>(program: T): T {
    if (!program) {
      return program;
    }
    const sent = new Map<number, unknown>();
    const vocabularies: any[] = [];
    const collect = (vocabulary: any) => {
      for (const key of SHARED_PARTS) {
        const part = vocabulary[key];
        if (isShared(part) && "value" in part) {
          sent.set(part.$shared, part.value);
        }
      }
      vocabularies.push(vocabulary);
    };
    forEachVocabulary(program.files, 1, collect);
    forEachVocabulary(program.context, 2, collect);
    forEachVocabulary(program.assets, 2, collect);
    const held = new Map<number, unknown>();
    for (const vocabulary of vocabularies) {
      for (const key of SHARED_PARTS) {
        const part = vocabulary[key];
        if (!isShared(part)) {
          continue;
        }
        const id = part.$shared;
        const value = sent.has(id) ? sent.get(id) : this._held.get(id);
        if (value === undefined) {
          throw new Error(
            `Program transport is out of step: vocabulary part ${id} was never sent`,
          );
        }
        vocabulary[key] = value;
        held.set(id, value);
      }
    }
    this._held = held;
    return program;
  }
}
