// The string, number and symbol tables every program a compiler builds reads,
// kept across its compiles. They began as #314's encoding's, which #705
// deleted.
/**
 * String, number and symbol tables shared across compiles.
 *
 * Append-only by construction: an id, once handed out, must stay valid for as
 * long as any cached chunk references it. `generation` is bumped when the
 * table is reseeded, which invalidates every chunk minted against the old one.
 *
 * Symbols are what a statement chunk of the binary program refers to outside
 * itself (docs/engine/binary-program.md, section 2): `symbols` holds each
 * one's qualified name, and `countIds` the dense count id of each symbol of a
 * counted kind (-1 for one that is not counted), which indexes the engine's
 * visits and turns. What a program defines a symbol as belongs to the
 * program's root (`ProgramRoot.kindOf` in `src/program`), since every root
 * reads this one table and an edit can define a name as another kind.
 */
export interface ProgramTable {
  strings: string[];
  stringIds: Map<string, number>;
  numbers: number[];
  numberIds: Map<number, number>;
  symbols: string[];
  symbolIds: Map<string, number>;
  /** Per symbol, its count id, or -1. */
  countIds: number[];
  /** How many count ids the generation has given. */
  counted: number;
  generation: number;
}

export const createProgramTable = (): ProgramTable => ({
  strings: [],
  stringIds: new Map(),
  numbers: [],
  numberIds: new Map(),
  symbols: [],
  symbolIds: new Map(),
  countIds: [],
  counted: 0,
  generation: 0,
});

/** What a reseed did to a table: the generation it started, and for each id
 *  space, the new id of each old id, or -1 for an entry it dropped. */
export interface ProgramTableRemap {
  generation: number;
  strings: Int32Array;
  numbers: Int32Array;
  symbols: Int32Array;
}

/**
 * Reseed a table, dropping entries no longer referenced.
 *
 * The table only grows while a session runs, so strings from deleted content
 * accumulate. Callers reseed when the waste is worth the cost: every cached
 * chunk becomes invalid, because its pointers referred to the old numbering.
 * The symbols in `keep.symbols` are interned again, in the order of their old
 * ids (docs/engine/binary-program.md, section 2, Reseed), each counted symbol
 * with a new dense count id in the same order; every other entry is dropped.
 * The remap says where each old id went: a reseed keeps no string and no
 * number, so those remaps hold -1 throughout, and the chunks the next compile
 * emits again intern what they need.
 *
 * A reseed installs fresh arrays and maps on the table rather than clearing
 * the old ones, so whatever holds the old ones (a root built in the older
 * generation, a buffer already emitted) goes on reading them.
 */
export const reseedProgramTable = (
  table: ProgramTable,
  keep: { symbols?: Iterable<number> } = {},
): ProgramTableRemap => {
  const strings = new Int32Array(table.strings.length).fill(-1);
  const numbers = new Int32Array(table.numbers.length).fill(-1);
  const symbols = new Int32Array(table.symbols.length).fill(-1);
  const oldSymbols = table.symbols;
  const oldCountIds = table.countIds;
  table.strings = [];
  table.stringIds = new Map();
  table.numbers = [];
  table.numberIds = new Map();
  table.symbols = [];
  table.symbolIds = new Map();
  table.countIds = [];
  table.counted = 0;
  const kept = [...new Set(keep.symbols ?? [])]
    .filter((id) => oldSymbols[id] !== undefined)
    .sort((a, b) => a - b);
  for (const id of kept) {
    const name = oldSymbols[id]!;
    symbols[id] = table.symbols.length;
    table.symbolIds.set(name, table.symbols.length);
    table.symbols.push(name);
    table.countIds.push((oldCountIds[id] ?? -1) >= 0 ? table.counted++ : -1);
  }
  table.generation += 1;
  return { generation: table.generation, strings, numbers, symbols };
};
