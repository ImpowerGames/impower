import type { ProgramTable } from "./ProgramTable";

export const SymbolKind = {
  Scene: 1,
  Branch: 2,
  Function: 3,
  Label: 4,
  Alternator: 5,
  Choice: 6,
} as const;

export type SymbolKindValue = (typeof SymbolKind)[keyof typeof SymbolKind];

export const UNDEFINED_KIND = -1;

export type SequenceKind = SymbolKindValue | typeof UNDEFINED_KIND;

export const START_FLOW_NAME = "start";

export const ANONYMOUS_FUNCTION_LABEL = "<anonymous>";

export const NUMBERED_SYNTHETIC_NAME = /^__synth\$[^$]*\$\d+$/;

export const NUMBERED_SYNTHETIC_NAMES = /__synth\$[^$\s]*\$\d+/g;

const GENERATED_LABEL_PART = /^__[A-Za-z]\w*\$/;

export const readableSymbolLabel = (label: string): string =>
  label
    .split(".")
    .map((part) =>
      GENERATED_LABEL_PART.test(part) ? ANONYMOUS_FUNCTION_LABEL : part,
    )
    .join(".");

export const internSymbol = (
  table: ProgramTable,
  name: string,
  counted = true,
): number => {
  let id = table.symbolIds.get(name);
  if (id === undefined) {
    id = table.symbols.length;
    table.symbols.push(name);
    table.symbolIds.set(name, id);
    table.countIds.push(counted ? table.counted++ : -1);
  }
  return id;
};

export const snapshotTable = (table: ProgramTable): ProgramTable => ({
  ...table,
});

export const countIdOf = (table: ProgramTable, id: number): number =>
  table.countIds[id] ?? -1;

const ANONYMOUS = "\u0000";

export const anonymousSymbol = (table: ProgramTable): number => {
  const id = table.symbols.length;
  const entry = `${ANONYMOUS}${id}`;
  table.symbols.push(entry);
  table.symbolIds.set(entry, id);
  table.countIds.push(table.counted++);
  return id;
};

export const isAnonymousSymbol = (table: ProgramTable, id: number): boolean =>
  table.symbols[id]?.startsWith(ANONYMOUS) ?? false;

export const renumberAnonymousSymbols = (table: ProgramTable): void => {
  table.symbols.forEach((entry, id) => {
    const renamed = `${ANONYMOUS}${id}`;
    if (entry.startsWith(ANONYMOUS) && entry !== renamed) {
      table.symbolIds.delete(entry);
      table.symbols[id] = renamed;
      table.symbolIds.set(renamed, id);
    }
  });
};

export const internString = (table: ProgramTable, text: string): number => {
  let id = table.stringIds.get(text);
  if (id === undefined) {
    id = table.strings.length;
    table.strings.push(text);
    table.stringIds.set(text, id);
  }
  return id;
};

export const internNumber = (table: ProgramTable, value: number): number => {
  if (Object.is(value, -0)) {
    let zero = table.numbers.findIndex((n) => Object.is(n, -0));
    if (zero < 0) {
      zero = table.numbers.length;
      table.numbers.push(value);
    }
    return zero;
  }
  let id = table.numberIds.get(value);
  if (id === undefined) {
    id = table.numbers.length;
    table.numbers.push(value);
    table.numberIds.set(value, id);
  }
  return id;
};
