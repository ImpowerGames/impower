import type { ProgramTable } from "../binary/ProgramBinaryWriter";

/** What a symbol names (docs/engine/binary-program.md, section 2). The build
 *  out interns the kinds it has reached; the others follow with their slices. */
export const SymbolKind = {
  /** The flow of a script's top-level content, named by the empty string. */
  Root: 0,
  Scene: 1,
  Branch: 2,
} as const;

export type SymbolKindValue = (typeof SymbolKind)[keyof typeof SymbolKind];

/** The name the flow of the top-level content is registered under. */
export const ROOT_FLOW_NAME = "";

/** The id of the symbol named `name`, interned when it is new, which the
 *  program being built defines as `kind`. A name defined again as another
 *  kind, as when an edit turns a scene into a branch, takes the new kind, so
 *  the facts a chunk records about the symbol change with it (`ChunkStore`). */
export const internSymbol = (
  table: ProgramTable,
  name: string,
  kind: SymbolKindValue,
): number => {
  let id = table.symbolIds.get(name);
  if (id === undefined) {
    id = table.symbols.length;
    table.symbols.push(name);
    table.symbolIds.set(name, id);
  }
  table.symbolKinds[id] = kind;
  return id;
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
  let id = table.numberIds.get(value);
  if (id === undefined) {
    id = table.numbers.length;
    table.numbers.push(value);
    table.numberIds.set(value, id);
  }
  return id;
};
