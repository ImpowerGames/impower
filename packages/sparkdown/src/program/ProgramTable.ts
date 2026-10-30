export interface ProgramTable {
  strings: string[];
  stringIds: Map<string, number>;
  numbers: number[];
  numberIds: Map<number, number>;
  symbols: string[];
  symbolIds: Map<string, number>;
  countIds: number[];
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

export interface ProgramTableRemap {
  generation: number;
  strings: Int32Array;
  numbers: Int32Array;
  symbols: Int32Array;
}

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
