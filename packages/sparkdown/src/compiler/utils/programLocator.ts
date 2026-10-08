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

/**
 * The accessor (docs/engine/binary-program.md, section 8) on the program
 * engine: the root's lookups, whose addresses are numbers.
 */
export const rootLocator = (root: ProgramRoot): ProgramLocator => ({
  addressAt: (uri, line, query) => root.addressAt(uri, line, query),
  locationOf: (address) =>
    typeof address === "number" ? root.locationOf(address) : undefined,
  sceneAt: (address) =>
    typeof address === "number" ? root.sceneAt(address) : undefined,
});

const locators = new WeakMap<object, ProgramLocator>();

/**
 * The accessor for a program: its root's, or one that finds nothing for a
 * program with no root (a compile that made no program). Made once per
 * program.
 */
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

/** The location of an address in the form an editor takes: a uri, and a
 *  range of positions. */
export const documentRangeOf = (location: SourceLocation) => ({
  uri: location.uri,
  range: {
    start: { line: location.startLine, character: location.startColumn },
    end: { line: location.endLine, character: location.endColumn },
  },
});

/** The answers of a program's accessor to `queries`, in order, with null
 *  where it has none, for a host that asks the worker holding the program
 *  (`LocateProgramMessage`). */
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

// How a divert, a `done` or a `fin` leaves its flow.
const LEAVES = new Set<number>([Op.JumpSym, Op.JumpVar, Op.Done, Op.End]);
// What only another kind of statement holds: a beat (every line an author
// displays starts with `LineStart`), a choice and a thread. A divert's
// arguments are expressions, whatever their code does to compute them: a
// captured string writes text and values into its capture, and a method
// call stashes its receiver in a generated temporary.
const NOT_A_DIVERT = new Set<number>([Op.LineStart, Op.Choice, Op.Thread]);

/** Whether the statement an address stands in is a divert, a `done` or a
 *  `fin` at its flow's own level, with whatever arguments it passes: its
 *  code leaves the flow and holds no beat, choice or thread anywhere, the
 *  entry code of a function an argument writes included. A `choose` whose
 *  preamble diverts before its caption holds the caption's beat and its
 *  choices, and is no divert. */
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

// The kinds of block body whose owner's line is no stop: a loop's header, a
// choice's line, a `choose` block's `then` and a function's header.
const NOT_A_CONDITION =
  BLOCK_LOOP | BLOCK_CHOICE | BLOCK_THEN | BLOCK_FUNCTION;

/** Whether the address a line takes is a stop of the previous and next beat,
 *  by what the statement is (#1677). The stops are the beats an author
 *  displays, a choice's body and the logic an author writes as a statement
 *  of its own: an assignment, a call, an `if`, and a divert, a `done` or a
 *  `fin` inside a block's body. Not a stop:
 *  - a divert, a `done` or a `fin` at its flow's own level (`leavesFlowOnly`);
 *  - a taken choice's own beat, on the choice's line: the choice's stop is
 *    the first beat of its body;
 *  - an `elseif`, which only the jump ending the branch above passes, and a
 *    choice's line without a beat of its own;
 *  - a tunnel call (`-> T ->`), a tunnel return (`->->`), a thread (`<-`)
 *    and a `label`, which mark or move the flow and show nothing;
 *  - the header of a block that is no `if`: a loop's, a `do` block's.
 *  A part past a statement's start (a `choose` preamble's assignment or
 *  `if`, which the writer puts in the `choose` statement's own code) is read
 *  by the code of its line table row, as a statement of its own. This is the
 *  set the object engine's path locations stopped at for these constructs,
 *  which the language server's navigation keeps. */
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
    // A beat, unless it stands on a choice's own line.
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
    // Reached only past the jump that ends the branch above, which jumps
    // forward over it: an `elseif`. The last branch's jump lands right
    // here, on whatever is written after the `if`, and a loop the preamble
    // inlines ends in a jump back to its condition.
    return false;
  }
  if (offset === 0) {
    // A statement's start: the header of a block statement that is no
    // `if` (a loop, a function, a `do` block) is no stop. A `choose`'s
    // start is its preamble's first part or its first choice, read below.
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
  // The part the address starts: the code of its line table row. A part of
  // a `choose` preamble (an assignment, an `if` gating choices) is read as
  // a statement of its own.
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

/**
 * The beat a line takes for the previous and next beat: its address and
 * where that address stands, from one program, or nothing for a line with
 * no address. It is the program's accessor's, but for an address that is no
 * stop (`isStop`): the program engine gives every statement and part an
 * address of its own, which the Game Preview routes to, so such a line takes
 * the beat of the lines below it, as it did on the object engine's path
 * locations.
 */
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
      typeof address === "number" &&
      location &&
      location.endLine >= from &&
      !isStop(root, address)
    ) {
      // The next line down: a part written below can stand at a lower
      // address (a `store` in a `choose` preamble), so its range says
      // nothing about where the next stop is.
      from = Math.max(from, location.startLine) + 1;
      continue;
    }
    return location ? { address, location } : { address };
  }
};
