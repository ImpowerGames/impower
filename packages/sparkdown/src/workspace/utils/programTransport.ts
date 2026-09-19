import type { SparkProgram } from "../../compiler/types/SparkProgram";

/**
 * How a compiled program crosses from the compiler worker to its workspace.
 *
 * A structured clone costs time on both sides of the boundary for every object
 * in the program, and two parts of a large project's program dominate it:
 *
 * - Attribute vocabularies. An illustrated project carries one per layered
 *   portrait (230KB for one), nearly all of its asset bytes, and the same
 *   vocabulary objects come out of every compile until their file changes.
 *   Each is sent once; later programs refer to it by number.
 * - Path locations: tens of thousands of five-number tuples. They are sent as
 *   one typed array and a list of keys, and rebuilt on arrival.
 *
 * The encoder runs in the worker and the decoder in the workspace, one pair per
 * connection, and each program must be decoded in the order it was encoded:
 * the numbers a program refers to are the ones every earlier program sent.
 * After each program both sides keep exactly the vocabulary parts that program
 * used, so what they hold stays in step and never outgrows one program.
 */

/** The parts of an attribute vocabulary worth sending once. */
const SHARED_PARTS = ["layers", "folders", "groups"] as const;

/** Where a vocabulary part was left out of a program because the receiver
 *  holds it, or sent once with `value` for the receiver to keep. */
interface SharedPart {
  $shared: number;
  value?: unknown;
}

interface PackedLocations {
  $packed: "locations";
  keys: string[];
  values: Int32Array;
}

const TUPLE_LENGTH = 5;

const isShared = (value: unknown): value is SharedPart =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as SharedPart).$shared === "number";

const isPacked = (value: unknown): value is PackedLocations =>
  typeof value === "object" &&
  value !== null &&
  (value as PackedLocations).$packed === "locations";

type StructTables = Record<string, Record<string, any> | undefined>;

/** Replace `table[name].attribute_vocabulary` through `mapVocabulary`,
 *  copying only the structs and tables that carry one. */
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

/** Every attribute vocabulary in `tables`, a table of structs or a table of
 *  such tables. */
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

const packLocations = (
  locations: Record<string, number[]>,
): PackedLocations | undefined => {
  const keys = Object.keys(locations);
  const values = new Int32Array(keys.length * TUPLE_LENGTH);
  for (let i = 0; i < keys.length; i++) {
    const tuple = locations[keys[i]!];
    if (!Array.isArray(tuple) || tuple.length !== TUPLE_LENGTH) {
      return undefined;
    }
    for (let j = 0; j < TUPLE_LENGTH; j++) {
      const n = tuple[j];
      if (!Number.isInteger(n) || n! > 0x7fffffff || n! < -0x80000000) {
        return undefined;
      }
      values[i * TUPLE_LENGTH + j] = n!;
    }
  }
  return { $packed: "locations", keys, values };
};

const unpackLocations = (packed: PackedLocations) => {
  const locations: Record<string, number[]> = {};
  const { keys, values } = packed;
  for (let i = 0; i < keys.length; i++) {
    const at = i * TUPLE_LENGTH;
    locations[keys[i]!] = [
      values[at]!,
      values[at + 1]!,
      values[at + 2]!,
      values[at + 3]!,
      values[at + 4]!,
    ];
  }
  return locations;
};

export class ProgramTransportEncoder {
  protected _ids = new WeakMap<object, number>();
  protected _nextId = 1;
  /** The parts the decoder holds: the ones the last program used. */
  protected _held = new Set<number>();

  /** A copy of `program` to send. `program` itself is left as it was. */
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
    if (program.files) {
      out.files = mapTable(program.files, encodeVocabulary) as SparkProgram["files"];
    }
    if (program.context) {
      out.context = mapTables(program.context, encodeVocabulary) as SparkProgram["context"];
    }
    if (program.assets) {
      out.assets = mapTables(program.assets, encodeVocabulary) as SparkProgram["assets"];
    }
    if (program.pathLocations) {
      const packed = packLocations(program.pathLocations);
      if (packed) {
        out.pathLocations = packed as never;
      }
    }
    this._held = used;
    return out as T;
  }
}

export class ProgramTransportDecoder {
  protected _held = new Map<number, unknown>();

  /** Restore, in place, a program `ProgramTransportEncoder.encode` produced. */
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
    if (isPacked(program.pathLocations)) {
      program.pathLocations = unpackLocations(program.pathLocations) as never;
    }
    return program;
  }
}
