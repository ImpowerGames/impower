import type { ProgramRoot } from "../../program/ProgramRoot";
import type {
  AddressQuery,
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
