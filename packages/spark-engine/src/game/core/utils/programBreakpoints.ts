import type { ProgramRoot } from "@impower/sparkdown/src/program/ProgramRoot";
import { SymbolKind } from "@impower/sparkdown/src/program/ProgramSymbols";
import {
  Op,
  SET_DECLARE,
  flagsOf,
  opOf,
} from "@impower/sparkdown/src/program/ProgramInstructions";
import {
  HEADER_WORDS,
  H_LINE_ROWS,
  addressOf,
  chunkId,
  codeWords,
} from "@impower/sparkdown/src/program/StatementChunk";

/**
 * The breakpoints of a program that runs on the program engine
 * (docs/engine/binary-program.md, section 8): each is a set of addresses,
 * which the game compares with the address of each instruction that runs.
 * The current engine's come from the path-location table instead
 * (`possibleBreakpointLines`, `Game.getActual*Breakpoints`).
 */

/**
 * The lines of `uri` within `range` a breakpoint can sit on: the first line
 * of every row of the line table of every statement of the script's flows,
 * their bodies and its functions, and the header of each scene and branch (a
 * function's header binds its parameters, so its rows offer it). The
 * declarations are left out, since they run when the story is reset, which
 * is before any debugger can stop it.
 */
export const programBreakpointLines = (
  root: ProgramRoot,
  search: {
    uri: string;
    range: { start: { line: number }; end: { line: number } };
  },
): number[] => {
  const lines = new Set<number>();
  const offer = (line: number) => {
    if (line >= search.range.start.line && line <= search.range.end.line) {
      lines.add(line);
    }
  };
  for (const sequence of root.sequences()) {
    if (sequence.uri !== search.uri || sequence.flow < 0) {
      continue;
    }
    if (
      sequence.owner < 0 &&
      (sequence.kind === SymbolKind.Scene ||
        sequence.kind === SymbolKind.Branch) &&
      sequence.firstLine > 0
    ) {
      // A flow's header, as the current engine offers it: a breakpoint
      // there stops where the flow's first statement does.
      offer(sequence.firstLine - 1);
    }
    const { chunks } = sequence.arrays;
    for (let entry = 0; entry < chunks.length; entry += 1) {
      const rows = chunks[entry]![H_LINE_ROWS]!;
      for (let row = 0; row < rows; row += 1) {
        offer(root.rowRange(sequence, entry, row).startLine);
      }
    }
  }
  return [...lines].sort((a, b) => a - b);
};

/** The address where the function `name` starts, which is where a function
 *  breakpoint on it stops, or nothing when the program defines no such
 *  function. */
export const programFunctionAddress = (
  root: ProgramRoot,
  name: string,
): number | undefined => {
  const symbol = root.table.symbolIds.get(name);
  const entry =
    symbol === undefined ? undefined : root.functionEntry(symbol);
  const chunk = entry?.sequence.arrays.chunks[entry.entry];
  return entry && chunk ? addressOf(chunkId(chunk), entry.offset) : undefined;
};

/**
 * The `SetVar` instructions that write a name a data breakpoint names, which
 * place the breakpoint in the source: those that assign it and those that
 * declare it. A data id names a global by its name, and a temporary as the
 * debugger's variables view names it, by the name of the flow or function
 * it is a temporary of, a dot and its own name (`scopeName` gives the name
 * of a sequence's flow). The instructions are matched by name alone, so for
 * a global they include the writes of a temporary that shadows it; the
 * breakpoint itself watches the variable (`Game.readWatch`).
 */
export const programAssignmentAddresses = (
  root: ProgramRoot,
  dataId: string,
  scopeName: (flow: number) => string,
): { assignments: number[]; declarations: number[] } => {
  const dot = dataId.lastIndexOf(".");
  const scope = dot < 0 ? undefined : dataId.slice(0, dot);
  const name = dot < 0 ? dataId : dataId.slice(dot + 1);
  const assignments: number[] = [];
  const declarations: number[] = [];
  for (const sequence of root.sequences()) {
    if (
      scope !== undefined &&
      (sequence.flow < 0 || scopeName(sequence.flow) !== scope)
    ) {
      continue;
    }
    for (const chunk of sequence.arrays.chunks) {
      const words = codeWords(chunk);
      for (let offset = 0; offset < words; offset += 2) {
        const w0 = chunk[HEADER_WORDS + offset]!;
        if (
          opOf(w0) === Op.SetVar &&
          root.table.strings[chunk[HEADER_WORDS + offset + 1]!] === name
        ) {
          const address = addressOf(chunkId(chunk), offset);
          if (flagsOf(w0) & SET_DECLARE) {
            declarations.push(address);
          } else {
            assignments.push(address);
          }
        }
      }
    }
  }
  return { assignments, declarations };
};
