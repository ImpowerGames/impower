import type { ProgramTable } from "./ProgramTable";

/** What a symbol names (docs/engine/binary-program.md, section 2). The build
 *  out defines the kinds it has reached; the others follow with their slices.
 *  A root records the kind its program defines each symbol as
 *  (`ProgramRoot.kindOf`, `SequenceRow.kind` for a flow). */
export const SymbolKind = {
  /** The flow of a script's top-level content: the starting script's, named
   *  by the empty string, or an included script's, named from its uri
   *  (`INCLUDED_FLOW_PREFIX`), which the top level runs. */
  Root: 0,
  Scene: 1,
  Branch: 2,
  /** A function declared at the top level, whose flow is its definition. A
   *  function written inside a statement is a block of that statement's
   *  chunk, under an anonymous symbol. */
  Function: 3,
  /** A `label`, which a chunk of its own exports at the `Visit` that counts
   *  it. */
  Label: 4,
  /** An alternator (a sequence), whose count picks its arm. Its symbol is
   *  anonymous and belongs to the statement that writes it. */
  Alternator: 5,
  /** A choice's body, whose count a once-only choice reads. Its symbol is
   *  anonymous and belongs to the `choose` statement that raises the choice;
   *  a named choice counts under its label's symbol instead. */
  Choice: 6,
} as const;

export type SymbolKindValue = (typeof SymbolKind)[keyof typeof SymbolKind];

/** What a root's kind array holds for a symbol its program does not define. */
export const UNDEFINED_KIND = -1;

/** The name the flow of the top-level content is registered under. */
export const ROOT_FLOW_NAME = "";

/** How the names of the symbols of an included script's top-level content
 *  start: its flow's and the label its content jumps back to
 *  (`programFlows.ts`, `IncludeEntry`). Both stand in the top level. */
export const INCLUDED_FLOW_PREFIX = "$include:";

/** How a function the compiler named is shown to an author. */
export const ANONYMOUS_FUNCTION_LABEL = "<anonymous>";

/** A name the compiler generates: `__`, its family, then a `$`, which no
 *  name an author writes holds (`__synth$3`, `__binding$...`;
 *  docs/engine/binary-program.md, section 2). */
const GENERATED_LABEL_PART = /^__[A-Za-z]\w*\$/;

/** A symbol's label (`ProgramRoot.labelOf`) as an author reads it in a
 *  stack trace, `debug.info`, the frames view or a function value: each
 *  part the compiler named read as anonymous (#1729). The label itself
 *  stays the symbol's identity, which data breakpoints name a scope by, so
 *  two anonymous functions keep scopes of their own. */
export const readableSymbolLabel = (label: string): string =>
  label
    .split(".")
    .map((part) =>
      GENERATED_LABEL_PART.test(part) ? ANONYMOUS_FUNCTION_LABEL : part,
    )
    .join(".");

/** The id of the symbol named `name`, interned when it is new, with a count
 *  id when `counted`. The id is the name's in every root the table serves,
 *  whatever each root's program defines it as. Every kind the build-out
 *  interns is counted (section 5): a scene, a branch, a label, a function and
 *  an alternator; a global or a constant, which are not counted, are not
 *  interned yet. */
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

/** The table as its current generation holds it: its arrays and maps, which
 *  a reseed replaces on the table rather than clears, so the view goes on
 *  reading the generation it was taken in. Within that generation the arrays
 *  only grow, so the view sees every entry interned later as well. */
export const snapshotTable = (table: ProgramTable): ProgramTable => ({
  ...table,
});

/** The count id of symbol `id` of `table`, or -1 for a symbol that is not
 *  counted. */
export const countIdOf = (table: ProgramTable, id: number): number =>
  table.countIds[id] ?? -1;

// What an anonymous symbol's entry in the table holds in place of a name. No
// name an author writes starts with it.
const ANONYMOUS = "\u0000";

/** A new anonymous symbol: one that belongs to a part of a statement (a
 *  function written inside the statement, an alternator), which has no name
 *  to be found by and is handed on by aligning the statement's parts when the
 *  statement is emitted again (docs/engine/binary-program.md, section 2). It
 *  is counted, as both kinds are. */
export const anonymousSymbol = (table: ProgramTable): number => {
  const id = table.symbols.length;
  const entry = `${ANONYMOUS}${id}`;
  table.symbols.push(entry);
  table.symbolIds.set(entry, id);
  table.countIds.push(table.counted++);
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
