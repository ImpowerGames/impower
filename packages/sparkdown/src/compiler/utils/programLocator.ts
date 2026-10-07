import type {
  LocateProgramResult,
  LocateQuery,
} from "../classes/messages/LocateProgramMessage";
import { Op, opOf } from "../../program/ProgramInstructions";
import type { ProgramRoot } from "../../program/ProgramRoot";
import {
  chunkOfAddress,
  codeWords,
  HEADER_WORDS,
} from "../../program/StatementChunk";
import type {
  AddressQuery,
  LineBeat,
  ProgramAddress,
  ProgramLocator,
  SourceLocation,
} from "../types/ProgramAddress";
import type { PathLocationTable, SparkProgram } from "../types/SparkProgram";
import { findPathRow, pathAtRow, pathLocation } from "./pathLocationTable";

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

/**
 * The accessor on the current engine, until it is deleted: its addresses are
 * the runtime paths of the program's path-location table, which is where the
 * current engine's positions are found, and no caller reads them.
 *
 * A line resolves as it always has: to the first row whose range covers it,
 * or the first row after it, among the rows a story can start at (no binding
 * evaluator's and no function's code, unless `functions` is set); with
 * `beat: "last"`, to the last beat that starts on the line; and a row inside a
 * choice's start content to the start of the choice.
 */
export const pathTableLocator = (
  table: PathLocationTable | undefined,
  scripts: readonly string[],
): ProgramLocator => {
  const sceneOf = (path: string): string | undefined => {
    const dot = path.indexOf(".");
    const head = dot < 0 ? path : path.slice(0, dot);
    if (!head) {
      return undefined;
    }
    // Root content is index-addressed (`0.3`, `12`); every flow name is not.
    return /^\d+$/.test(head) ? "0" : head;
  };
  return {
    addressAt(uri: string, line: number, query: AddressQuery = {}) {
      if (uri == null || line == null) {
        return undefined;
      }
      const row = findPathRow(
        table,
        scripts.indexOf(uri),
        line,
        !query.functions,
        query.beat ?? "first",
      );
      const path = row < 0 ? undefined : pathAtRow(table, row);
      if (path === undefined || query.functions) {
        return path;
      }
      const parent = path.split(".").slice(0, -1).join(".");
      if (parent.endsWith(".$s")) {
        // Inside a choice's start content: from the start of the choice.
        return `${parent.split(".").slice(0, -1).join(".")}.0`;
      }
      return path;
    },
    locationOf(address: ProgramAddress | null | undefined) {
      if (typeof address !== "string") {
        return undefined;
      }
      const location = pathLocation(table, address);
      const uri = location ? scripts[location[0]] : undefined;
      return location && uri !== undefined
        ? {
            uri,
            startLine: location[1],
            startColumn: location[2],
            endLine: location[3],
            endColumn: location[4],
          }
        : undefined;
    },
    sceneAt(address: ProgramAddress | null | undefined) {
      return typeof address === "string" && address
        ? sceneOf(address)
        : undefined;
    },
  };
};

const locators = new WeakMap<object, ProgramLocator>();

/**
 * The accessor for a program: the root's when the compile built statement
 * chunks (`SparkdownCompilerConfig.programChunks`) and did not fall back, and
 * the path-location table's otherwise. Made once per program.
 */
export const programLocator = (program: SparkProgram): ProgramLocator => {
  let locator = locators.get(program);
  if (!locator) {
    locator =
      program.chunks && !program.fallback
        ? rootLocator(program.chunks)
        : pathTableLocator(
            program.pathLocations,
            Object.keys(program.scripts ?? {}),
          );
    locators.set(program, locator);
  }
  return locator;
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

// What a statement that only leaves its flow pushes before it leaves: the
// arguments of a divert.
const PUSHES = new Set<number>([
  Op.Str,
  Op.Int,
  Op.Num,
  Op.Const,
  Op.GetVar,
  Op.Sym,
  Op.VarPtr,
]);
const LEAVES = new Set<number>([Op.JumpSym, Op.JumpVar, Op.Done, Op.End]);

/** Whether the statement an address stands in is a divert, a `done` or a
 *  `fin` at its flow's own level, and nothing else. */
const leavesFlowOnly = (root: ProgramRoot, address: number): boolean => {
  const position = root.position(chunkOfAddress(address));
  if (!position || root.ownerOf(position.sequence)) {
    return false;
  }
  const chunk = position.sequence.arrays.chunks[position.entry]!;
  const words = codeWords(chunk);
  let last = -1;
  for (let offset = 0; offset < words; offset += 2) {
    last = opOf(chunk[HEADER_WORDS + offset]!);
    if (!PUSHES.has(last) && !LEAVES.has(last)) {
      return false;
    }
  }
  return LEAVES.has(last);
};

/**
 * The beat a line takes for the previous and next beat: its address and
 * where that address stands, from one program, or nothing for a line with
 * no address. It is the program's accessor's, but for a divert, a `done` or a
 * `fin` that stands at its flow's own level: the program engine gives such a
 * statement an address of its own, which the Game Preview routes to, and the
 * current engine's path locations give it none, so it takes the beat of the
 * lines below it as it does on the current engine. One inside a block's body
 * has an address on both.
 */
export const beatAt = (
  program: SparkProgram,
  uri: string,
  line: number,
  query?: AddressQuery,
): LineBeat | undefined => {
  const locator = programLocator(program);
  const root = program.chunks && !program.fallback ? program.chunks : undefined;
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
      leavesFlowOnly(root, address)
    ) {
      from = location.endLine + 1;
      continue;
    }
    return location ? { address, location } : { address };
  }
};
