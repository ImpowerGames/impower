import type {
  ProgramRoot,
  SequenceRow,
} from "@impower/sparkdown/src/program/ProgramRoot";
import { SymbolKind } from "@impower/sparkdown/src/program/ProgramSymbols";
import {
  Op,
  SET_DECLARE,
  SET_INITIALIZE,
  flagsOf,
  opOf,
} from "@impower/sparkdown/src/program/ProgramInstructions";
import {
  BLOCK_FUNCTION,
  HEADER_WORDS,
  H_LINE_ROWS,
  addressOf,
  blockCount,
  blockFlags,
  chunkId,
  codeWords,
} from "@impower/sparkdown/src/program/ProgramChunk";

/**
 * The breakpoints of a program (docs/engine/binary-program.md, section 8): a
 * line's and a function's are sets of addresses, which the game compares with
 * the address of each instruction that runs, and a variable's is placed from
 * the instructions that write it.
 */

/**
 * Whether the statements of `sequence` run once the story has started: those
 * of a flow and of its bodies do, and so do those of a function's body
 * written in a declaration, which runs when it is called, but not those of a
 * script's declarations or the other bodies of their statements, which run
 * when the story is reset, before a debugger can stop it.
 */
export const runsAfterReset = (
  root: ProgramRoot,
  sequence: SequenceRow,
): boolean => {
  let at = sequence;
  for (;;) {
    if (at.flow >= 0) {
      return true;
    }
    const owner = root.ownerOf(at);
    if (!owner) {
      return false;
    }
    const chunk = owner.sequence.arrays.chunks[owner.entry]!;
    if (blockFlags(chunk, at.block) & BLOCK_FUNCTION) {
      return true;
    }
    at = owner.sequence;
  }
};

/**
 * The lines of `uri` within `range` a breakpoint can sit on: the first line
 * of every row of the line table of every statement that runs once the story
 * has started (`runsAfterReset`), and the header of each scene and branch (a
 * function's header binds its parameters, so its rows offer it).
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
    if (sequence.uri !== search.uri || !runsAfterReset(root, sequence)) {
      continue;
    }
    if (
      sequence.owner < 0 &&
      (sequence.kind === SymbolKind.Scene ||
        sequence.kind === SymbolKind.Branch) &&
      sequence.firstLine > 0
    ) {
      // A flow's header: a breakpoint there stops where the flow's first
      // statement does.
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

/** The address where the function `symbol` starts, or nothing when it is no
 *  function the program defines. */
const functionStart = (
  root: ProgramRoot,
  symbol: number,
): number | undefined => {
  const entry = root.functionEntry(symbol);
  const chunk = entry?.sequence.arrays.chunks[entry.entry];
  return entry && chunk ? addressOf(chunkId(chunk), entry.offset) : undefined;
};

/** The address where the function `name` starts, which is where a function
 *  breakpoint on it stops, or nothing when the program defines no such
 *  function. A function declared at the top level is found by its name; one
 *  written inside a statement (a `local function` in a function's body) has
 *  an anonymous symbol, and is found from where `declared` says its name is
 *  written (`SparkProgram.functionLocations`): a function's entry spans its
 *  declaration, so it is the innermost function whose entry holds that
 *  position, since the functions that enclose it, which can start on the
 *  same line, hold it too. */
export const programFunctionAddress = (
  root: ProgramRoot,
  name: string,
  declared?: { uri: string; line: number; column: number },
): number | undefined => {
  const symbol = root.table.symbolIds.get(name);
  const named = symbol === undefined ? undefined : functionStart(root, symbol);
  if (named !== undefined || !declared) {
    return named;
  }
  const { line, column } = declared;
  const before = (l1: number, c1: number, l2: number, c2: number) =>
    l1 < l2 || (l1 === l2 && c1 <= c2);
  let found: { address: number; line: number; column: number } | undefined;
  const symbols = root.table.symbols.length;
  for (let s = 0; s < symbols; s += 1) {
    const address = functionStart(root, s);
    const at = address === undefined ? undefined : root.locationOf(address);
    if (
      address === undefined ||
      !at ||
      at.uri !== declared.uri ||
      !before(at.startLine, at.startColumn, line, column) ||
      !before(line, column, at.endLine, at.endColumn)
    ) {
      continue;
    }
    // Of the entries that hold the name, the one that starts last is the
    // innermost.
    if (
      !found ||
      !before(at.startLine, at.startColumn, found.line, found.column)
    ) {
      found = { address, line: at.startLine, column: at.startColumn };
    }
  }
  return found?.address;
};

/**
 * The sequences whose statements run in the frame a debugger names `scope`,
 * as the frames view names it (`frameName` gives the name of a flow's or a
 * function's frame): the flow or the function body that frame runs, and the
 * bodies of their statements, but not the body of a function written in
 * them, which runs in a frame of its own.
 */
export const scopeSequences = (
  root: ProgramRoot,
  scope: string,
  frameName: (symbol: number, isFunction: boolean) => string,
): SequenceRow[] => {
  const out = new Map<number, SequenceRow>();
  const collect = (sequence: SequenceRow) => {
    if (out.has(sequence.id)) {
      return;
    }
    out.set(sequence.id, sequence);
    for (const chunk of sequence.arrays.chunks) {
      for (let k = 0; k < blockCount(chunk); k += 1) {
        const body = root.body(chunk, k);
        if (body && !(blockFlags(chunk, k) & BLOCK_FUNCTION)) {
          collect(body);
        }
      }
    }
  };
  const symbols = root.table.symbols.length;
  for (let symbol = 0; symbol < symbols; symbol += 1) {
    const flow = root.flow(symbol);
    const isFunction = flow
      ? flow.kind === SymbolKind.Function
      : root.functionEntry(symbol) !== undefined;
    if (!isFunction) {
      if (flow && frameName(symbol, false) === scope) {
        collect(flow);
      }
      continue;
    }
    if (frameName(symbol, true) !== scope) {
      continue;
    }
    // A function is entered at its entry code, which binds its parameters
    // and enters its body: the code of a function declared at the top
    // level, whose own sequence holds the entry, or of the statement a
    // function is written in, whose other code the frame does not run.
    const entry = root.functionEntry(symbol);
    if (flow) {
      out.set(flow.id, flow);
    }
    const body = entry && functionBody(root, entry);
    if (body) {
      collect(body);
    }
  }
  return [...out.values()];
};

/** The body a function's entry code enters: the block of the first
 *  `EnterBlock` from the entry's offset. */
const functionBody = (
  root: ProgramRoot,
  entry: { sequence: SequenceRow; entry: number; offset: number },
): SequenceRow | undefined => {
  const chunk = entry.sequence.arrays.chunks[entry.entry];
  if (!chunk) {
    return undefined;
  }
  const words = codeWords(chunk);
  for (let offset = entry.offset; offset < words; offset += 2) {
    const w0 = chunk[HEADER_WORDS + offset]!;
    if (opOf(w0) === Op.EnterBlock) {
      return root.body(chunk, chunk[HEADER_WORDS + offset + 1]!);
    }
  }
  return undefined;
};

/**
 * The `SetVar` instructions that write a name a data breakpoint names, which
 * place the breakpoint in the source: those that assign it and those that
 * declare it, with a declaration's initializer. A data id names a global by its name, and a temporary as the
 * debugger's variables view names it, by the name of the frame it is a
 * temporary of (`scopeSequences`), a dot and its own name. The instructions
 * are matched by name alone, so for a global they include the writes of a
 * temporary that shadows it; the breakpoint itself watches the variable
 * (`Game.locateWatch`).
 */
export const programAssignmentAddresses = (
  root: ProgramRoot,
  dataId: string,
  frameName: (symbol: number, isFunction: boolean) => string,
): { assignments: number[]; declarations: number[] } => {
  const dot = dataId.lastIndexOf(".");
  const scope = dot < 0 ? undefined : dataId.slice(0, dot);
  const name = dot < 0 ? dataId : dataId.slice(dot + 1);
  const sequences =
    scope === undefined
      ? [...root.sequences()]
      : scopeSequences(root, scope, frameName);
  const assignments: number[] = [];
  const declarations: number[] = [];
  for (const sequence of sequences) {
    for (const chunk of sequence.arrays.chunks) {
      const words = codeWords(chunk);
      for (let offset = 0; offset < words; offset += 2) {
        const w0 = chunk[HEADER_WORDS + offset]!;
        if (
          opOf(w0) === Op.SetVar &&
          root.table.strings[chunk[HEADER_WORDS + offset + 1]!] === name
        ) {
          const address = addressOf(chunkId(chunk), offset);
          // A declaration's initializer is part of the declaration (#1720).
          if (flagsOf(w0) & (SET_DECLARE | SET_INITIALIZE)) {
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
