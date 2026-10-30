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
  type ProgramChunk,
} from "@impower/sparkdown/src/program/ProgramChunk";

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

const functionStart = (
  root: ProgramRoot,
  symbol: number,
): number | undefined => {
  const entry = root.functionEntry(symbol);
  const chunk = entry?.sequence.arrays.chunks[entry.entry];
  return entry && chunk ? addressOf(chunkId(chunk), entry.offset) : undefined;
};

const functionStop = (
  root: ProgramRoot,
  symbol: number,
): number | undefined => {
  const entry = root.functionEntry(symbol);
  const chunk = entry?.sequence.arrays.chunks[entry.entry];
  if (!entry || !chunk) {
    return undefined;
  }
  const enter = enterBlockOffset(chunk, entry.offset);
  return addressOf(chunkId(chunk), enter ?? entry.offset);
};

const enterBlockOffset = (
  chunk: ProgramChunk,
  entryOffset: number,
): number | undefined => {
  const words = codeWords(chunk);
  for (let offset = entryOffset; offset < words; offset += 2) {
    if (opOf(chunk[HEADER_WORDS + offset]!) === Op.EnterBlock) {
      return offset;
    }
  }
  return undefined;
};

export const programEntryCode = (root: ProgramRoot): Set<number> => {
  const addresses = new Set<number>();
  const symbols = root.table.symbols.length;
  for (let s = 0; s < symbols; s += 1) {
    const entry = root.functionEntry(s);
    const chunk = entry?.sequence.arrays.chunks[entry.entry];
    if (!entry || !chunk) {
      continue;
    }
    const enter = enterBlockOffset(chunk, entry.offset);
    if (enter === undefined) {
      continue;
    }
    for (let offset = entry.offset; offset < enter; offset += 2) {
      addresses.add(addressOf(chunkId(chunk), offset));
    }
  }
  return addresses;
};

export const programFunctionAddress = (
  root: ProgramRoot,
  name: string,
  declared?: { uri: string; line: number; column: number },
): number | undefined => {
  const symbol = root.table.symbolIds.get(name);
  const named = symbol === undefined ? undefined : functionStop(root, symbol);
  if (named !== undefined || !declared) {
    return named;
  }
  const { line, column } = declared;
  const before = (l1: number, c1: number, l2: number, c2: number) =>
    l1 < l2 || (l1 === l2 && c1 <= c2);
  let found: { symbol: number; line: number; column: number } | undefined;
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
    if (
      !found ||
      !before(at.startLine, at.startColumn, found.line, found.column)
    ) {
      found = { symbol: s, line: at.startLine, column: at.startColumn };
    }
  }
  return found && functionStop(root, found.symbol);
};

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

const functionBody = (
  root: ProgramRoot,
  entry: { sequence: SequenceRow; entry: number; offset: number },
): SequenceRow | undefined => {
  const chunk = entry.sequence.arrays.chunks[entry.entry];
  if (!chunk) {
    return undefined;
  }
  const enter = enterBlockOffset(chunk, entry.offset);
  return enter === undefined
    ? undefined
    : root.body(chunk, chunk[HEADER_WORDS + enter + 1]!);
};

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
