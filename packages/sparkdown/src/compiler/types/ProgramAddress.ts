/**
 * An execution position as a consumer outside the engine holds it
 * (docs/engine/binary-program.md, section 8). It is opaque: a consumer gets
 * one from `ProgramLocator.addressAt`, asks `ProgramLocator.locationOf` where
 * it is, and compares two with `===`, because several source lines of one
 * beat share an execution position and that is what a consumer asks about.
 *
 * It is one number, a chunk id and an offset, which survives a compile for
 * every statement that was not emitted again. The deleted object engine named
 * a position by its runtime path, a string; no producer makes one since #705,
 * and an address is never a string (#1709).
 */
export type ProgramAddress = number;

/**
 * Where a run starts when the line it starts from has no address of its own
 * and none below it does (`ProgramLocator.addressAt` answers nothing): the top
 * of the top-level content. It is no position of a program, so
 * `ProgramLocator.locationOf` and `sceneAt` find nothing for it, a route
 * search never reaches it, and jumping to it starts the top-level flow
 * (docs/engine/binary-program.md, section 8). It is -1, the value the story
 * gives `previousAddress` before a step has run, since an address is never
 * negative.
 */
export const TOP_LEVEL_START: ProgramAddress = -1;

/** A source range, with lines and columns counting from 0, in the script
 *  `uri`. */
export interface SourceLocation {
  uri: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/** What `ProgramLocator.addressAt` looks for. */
export interface AddressQuery {
  /** A line that `>` breaks holds several beats: PLAY from the line starts
   *  at its first (the default), and a preview of it shows its last. */
  beat?: "first" | "last";
  /** Whether a line of a function's body or of a declaration has an address
   *  of its own. Left out, such a line has none, since a story started there
   *  would run a function's body as story, and the line takes the address of
   *  the first line below it that a story can start at, as a line that holds
   *  no statement does. */
  functions?: boolean;
}

/**
 * The one accessor through which everything outside the engine and the
 * compiler goes from a source line to an execution position and back. The
 * program's root answers it (`ProgramRoot.addressAt`, `locationOf`).
 */
export interface ProgramLocator {
  /** The address of the beat or statement on a line of a script, or of the
   *  first line below it that has one; nothing past the script's last. */
  addressAt(
    uri: string,
    line: number,
    query?: AddressQuery,
  ): ProgramAddress | undefined;
  /** Where an address stands in its script, or nothing for an address the
   *  program does not hold. */
  locationOf(address: ProgramAddress | null | undefined): SourceLocation | undefined;
  /** The name of the top-level flow an address stands in, which is the scene
   *  a beat belongs to and what a route to it starts from: a scene's name,
   *  a branch's scene's, a function's, or `"0"` for the top-level content.
   *  Nothing for an address the program does not hold. */
  sceneAt(address: ProgramAddress | null | undefined): string | undefined;
}

/** The address of a line and where that address stands, read from one
 *  program together (`beatAt`). */
export interface LineBeat {
  address: ProgramAddress;
  location?: SourceLocation;
}

/** The part of a program's accessor a host asks of the worker that holds the
 *  program (`SparkdownWorkspace.locatorOf`), whose answers arrive later. */
export interface AsyncProgramLocator {
  addressAt(
    uri: string,
    line: number,
    query?: AddressQuery,
  ): Promise<ProgramAddress | undefined>;
  locationOf(address: ProgramAddress): Promise<SourceLocation | undefined>;
  /** `addressAt` and the `locationOf` of its answer in one question, so that
   *  both read the same program however many compiles run around it. */
  beatAt(
    uri: string,
    line: number,
    query?: AddressQuery,
  ): Promise<LineBeat | undefined>;
}
