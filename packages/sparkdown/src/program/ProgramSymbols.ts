import type { ProgramTable } from "../binary/ProgramBinaryWriter";

/** What a symbol names (docs/engine/binary-program.md, section 2). The build
 *  out defines the kinds it has reached; the others follow with their slices.
 *  A root records the kind its program defines each flow as
 *  (`SequenceRow.kind`). */
export const SymbolKind = {
  /** The flow of a script's top-level content, named by the empty string. */
  Root: 0,
  Scene: 1,
  Branch: 2,
  /** A function declared at the top level, whose flow is its definition. A
   *  function written inside a statement is a block of that statement's
   *  chunk, under an anonymous symbol. */
  Function: 3,
} as const;

export type SymbolKindValue = (typeof SymbolKind)[keyof typeof SymbolKind];

/** The name the flow of the top-level content is registered under. */
export const ROOT_FLOW_NAME = "";

/** The id of the symbol named `name`, interned when it is new. The id is the
 *  name's in every root the table serves, whatever each root's program
 *  defines it as. */
export const internSymbol = (table: ProgramTable, name: string): number => {
  let id = table.symbolIds.get(name);
  if (id === undefined) {
    id = table.symbols.length;
    table.symbols.push(name);
    table.symbolIds.set(name, id);
  }
  return id;
};

// What an anonymous symbol's entry in the table holds in place of a name. No
// name an author writes starts with it.
const ANONYMOUS = "\u0000";

/** A new anonymous symbol: one that belongs to a part of a statement (a
 *  function written inside the statement), which has no name to be found
 *  by and is handed on by aligning the statement's parts when the statement
 *  is emitted again (docs/engine/binary-program.md, section 2). */
export const anonymousSymbol = (table: ProgramTable): number => {
  const id = table.symbols.length;
  const entry = `${ANONYMOUS}${id}`;
  table.symbols.push(entry);
  table.symbolIds.set(entry, id);
  return id;
};

/** Whether symbol `id` of `table` is anonymous. */
export const isAnonymousSymbol = (table: ProgramTable, id: number): boolean =>
  table.symbols[id]?.startsWith(ANONYMOUS) ?? false;

/** Gives each anonymous symbol of `table` the entry its id names, as
 *  `anonymousSymbol` makes it, after a reseed renumbered the symbols, so that
 *  no entry a later anonymous symbol takes is already held. A reseed keeps
 *  the order of the ids it keeps, so no renamed entry meets one still to be
 *  renamed. */
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
  // A map key reads negative zero as zero, but it prints as `-0`: it is
  // found by its sign.
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
