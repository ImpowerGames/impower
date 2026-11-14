import type {
  LocateProgramResult,
  LocateQuery,
} from "../classes/messages/LocateProgramMessage";
import {
  CALL_TUNNEL,
  flagsOf,
  Op,
  opOf,
} from "../../program/ProgramInstructions";
import type { ProgramRoot } from "../../program/ProgramRoot";
import {
  BLOCK_CHOICE,
  BLOCK_FUNCTION,
  BLOCK_LOOP,
  BLOCK_THEN,
  blockCount,
  blockFlags,
  chunkOfAddress,
  codeWords,
  H_LINE_ROWS,
  HEADER_WORDS,
  LINE_ROW_WORDS,
  lineRowAt,
  lineTableStart,
  offsetOfAddress,
} from "../../program/ProgramChunk";
import type {
  AddressQuery,
  LineBeat,
  ProgramLocator,
  SourceLocation,
} from "../types/ProgramAddress";
import type { SparkProgram } from "../types/SparkProgram";

export const rootLocator = (root: ProgramRoot): ProgramLocator => ({
  addressAt: (uri, line, query) => root.addressAt(uri, line, query),
  locationOf: (address) =>
    address == null ? undefined : root.locationOf(address),
  sceneAt: (address) => (address == null ? undefined : root.sceneAt(address)),
});

const locators = new WeakMap<object, ProgramLocator>();

export const programLocator = (program: SparkProgram): ProgramLocator => {
  let locator = locators.get(program);
  if (!locator) {
    locator = program.chunks ? rootLocator(program.chunks) : NO_LOCATIONS;
    locators.set(program, locator);
  }
  return locator;
};

const NO_LOCATIONS: ProgramLocator = {
  addressAt: () => undefined,
  locationOf: () => undefined,
  sceneAt: () => undefined,
};

export const documentRangeOf = (location: SourceLocation) => ({
  uri: location.uri,
  range: {
    start: { line: location.startLine, character: location.startColumn },
    end: { line: location.endLine, character: location.endColumn },
  },
});

export const answerLocateQueries = (
  program: SparkProgram | undefined,
  queries: readonly LocateQuery[],
): LocateProgramResult => {
  const locator = program ? programLocator(program) : undefined;
  return queries.map((q) => {
    if (!locator) {
      return null;
    }
    if ("addressAt" in q) {
      const { uri, line, query } = q.addressAt;
      return locator.addressAt(uri, line, query) ?? null;
    }
    if ("beatAt" in q) {
      const { uri, line, query } = q.beatAt;
      return beatAt(program!, uri, line, query) ?? null;
    }
    return locator.locationOf(q.locationOf) ?? null;
  });
};

const LEAVES = new Set<number>([Op.JumpSym, Op.JumpVar, Op.Done, Op.End]);
const NOT_A_DIVERT = new Set<number>([Op.LineStart, Op.Choice, Op.Thread]);

const leavesFlowOnly = (root: ProgramRoot, address: number): boolean => {
  const position = root.position(chunkOfAddress(address));
  if (!position || root.ownerOf(position.sequence)) {
    return false;
  }
  const chunk = position.sequence.arrays.chunks[position.entry]!;
  const words = codeWords(chunk);
  let leaves = false;
  for (let offset = 0; offset < words; offset += 2) {
    const op = opOf(chunk[HEADER_WORDS + offset]!);
    if (NOT_A_DIVERT.has(op)) {
      return false;
    }
    leaves ||= LEAVES.has(op);
  }
  return leaves;
};

const NOT_A_CONDITION =
  BLOCK_LOOP | BLOCK_CHOICE | BLOCK_THEN | BLOCK_FUNCTION;

const isStop = (root: ProgramRoot, address: number): boolean => {
  const position = root.position(chunkOfAddress(address));
  if (!position) {
    return true;
  }
  if (leavesFlowOnly(root, address)) {
    return false;
  }
  const { sequence, entry } = position;
  const chunk = sequence.arrays.chunks[entry]!;
  const words = codeWords(chunk);
  const offset = offsetOfAddress(address);
  const word = (at: number) => chunk[HEADER_WORDS + at]!;
  const lineAt = (at: number) => root.rangeAt(sequence, entry, at)?.startLine;
  if (opOf(word(offset)) === Op.LineStart) {
    const line = lineAt(offset);
    for (let at = 0; at < words; at += 2) {
      if (opOf(word(at)) === Op.Choice && lineAt(at) === line) {
        return false;
      }
    }
    return true;
  }
  if (opOf(word(offset)) === Op.Visit) {
    return false;
  }
  if (
    offset > 0 &&
    opOf(word(offset - 2)) === Op.Jump &&
    word(offset - 1) > 0
  ) {
    return false;
  }
  if (offset === 0) {
    let plain = false;
    let decides = false;
    for (let k = 0; k < blockCount(chunk); k += 1) {
      const flags = blockFlags(chunk, k);
      if (flags & (BLOCK_LOOP | BLOCK_FUNCTION)) {
        return false;
      }
      plain ||= (flags & NOT_A_CONDITION) === 0;
    }
    for (let at = 0; at < words && !decides; at += 2) {
      decides = opOf(word(at)) === Op.JumpIfFalse;
    }
    if (plain && !decides) {
      return false;
    }
  }
  const row = lineRowAt(chunk, offset);
  const rows = chunk[H_LINE_ROWS]!;
  const end =
    row >= 0 && row + 1 < rows
      ? chunk[lineTableStart(chunk) + (row + 1) * LINE_ROW_WORDS]!
      : words;
  for (let at = offset; at < end; at += 2) {
    const op = opOf(word(at));
    if (
      op === Op.Choice ||
      op === Op.TunnelReturn ||
      op === Op.Thread ||
      ((op === Op.Call || op === Op.CallVar) &&
        (flagsOf(word(at)) & CALL_TUNNEL) !== 0) ||
      (op === Op.EnterBlock &&
        blockFlags(chunk, word(at + 1)) & NOT_A_CONDITION)
    ) {
      return false;
    }
  }
  return true;
};

export const beatAt = (
  program: SparkProgram,
  uri: string,
  line: number,
  query?: AddressQuery,
): LineBeat | undefined => {
  const locator = programLocator(program);
  const root = program.chunks;
  let from = line;
  for (;;) {
    const address = locator.addressAt(uri, from, query);
    if (address === undefined) {
      return undefined;
    }
    const location = locator.locationOf(address);
    if (
      root &&
      location &&
      location.endLine >= from &&
      !isStop(root, address)
    ) {
      from = Math.max(from, location.startLine) + 1;
      continue;
    }
    return location ? { address, location } : { address };
  }
};
