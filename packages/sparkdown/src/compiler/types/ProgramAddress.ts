/**
 * An execution position as a consumer outside the engine holds it
 * (docs/engine/binary-program.md, section 8). It is opaque: a consumer gets
 * one from `ProgramLocator.addressAt`, asks `ProgramLocator.locationOf` where
 * it is, and compares two with `===`, because several source lines of one
 * beat share an execution position and that is what a consumer asks about.
 *
 * On the program engine it is one number, a chunk id and an offset, which
 * survives a compile for every statement that was not emitted again. On the
 * current engine, until it is deleted, it is the runtime path the engine
 * names the position by, which no consumer reads.
 */
export type ProgramAddress = number | string;

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
 * compiler goes from a source line to an execution position and back. It
 * answers from either engine until the current one is deleted.
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
