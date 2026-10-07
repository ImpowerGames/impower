import type {
  AddressQuery,
  LineBeat,
} from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { beatAt } from "@impower/sparkdown/src/compiler/utils/programLocator";

/** The beat of a line as the language server asks for it (`beatAt`): the
 *  compiler's worker's (`SparkdownWorkspace.locatorOf`), or a program's own
 *  (`ownBeats`) where the program is at hand. */
export interface BeatLocator {
  beatAt(
    uri: string,
    line: number,
    query?: AddressQuery,
  ): LineBeat | undefined | Promise<LineBeat | undefined>;
}

/** The beats of a program at hand (`beatAt`). */
export const ownBeats = (program: SparkProgram): BeatLocator => ({
  beatAt: (uri, line, query) => beatAt(program, uri, line, query),
});

/** The lines of a script's scene and branch headers, which the program
 *  lists by script (`sceneLocations`, `branchLocations`). */
const headerLines = (program: SparkProgram, uri: string): Set<number> => {
  const script = Object.keys(program.scripts ?? {}).indexOf(uri);
  const lines = new Set<number>();
  for (const locations of [program.sceneLocations, program.branchLocations]) {
    for (const location of Object.values(locations ?? {})) {
      if (location[0] === script) {
        lines.add(location[1]);
      }
    }
  }
  return lines;
};

/**
 * The first line of the beat `offset` beats away from (`currentFile`,
 * `currentLine`) in that script: the previous beat (-1) or the next one (+1).
 * Powers the editor's PageUp/PageDown navigation.
 *
 * A beat is what the program's accessor gives one address (`ProgramLocator`),
 * which starts where `locationOf` says: the lines of one beat (a cue, a
 * directive, the dialogue) share it, and a line that holds no statement takes
 * the next beat's. A scene's or a branch's header is a stop of its own, as it
 * is on the current engine, whose path locations give the header one; the
 * program engine's give it none. So the next beat is the first header or
 * beat below the line that starts below it, and the previous beat the first
 * one above that starts above it, which from inside a beat is that beat's
 * start. The program answers from either engine, and no line table reaches
 * the client, and they land on the same lines: a divert, a `done` or a `fin`
 * at a flow's own level is no beat on either (`beatAt`).
 *
 * This lives server-side deliberately: the program's locations are large on a
 * feature-length script, and shipping them to the client with every compile
 * just to answer an occasional keypress dominated the per-keystroke payload.
 * Asking for one location on demand is a few bytes. The language server asks
 * the compiler's worker, which holds the root a program compiled with
 * statement chunks is located by (#704), one question per line.
 */
export const getOffsetSourceLocation = async (
  program: SparkProgram | undefined,
  locator: BeatLocator | undefined,
  currentFile: string | undefined,
  currentLine: number,
  offset: number,
): Promise<{ file: string; line: number } | null> => {
  if (
    !program ||
    !locator ||
    currentFile == null ||
    !Object.keys(program.scripts ?? {}).includes(currentFile) ||
    offset === 0
  ) {
    return null;
  }
  const headers = headerLines(program, currentFile);
  /** The first header below `after` and above `before`. */
  const firstHeader = (after: number, before: number): number | undefined => {
    let first: number | undefined;
    for (const header of headers) {
      if (header > after && header < before && (first === undefined || header < first)) {
        first = header;
      }
    }
    return first;
  };
  /** Where the beat a line takes starts; null for a line with no address. */
  const startOf = async (line: number): Promise<number | null | undefined> => {
    if (headers.has(line)) {
      return line;
    }
    const beat = await locator.beatAt(currentFile, line);
    if (!beat) {
      return null;
    }
    return beat.location?.uri === currentFile
      ? beat.location.startLine
      : undefined;
  };
  let line = currentLine;
  for (let step = 0; step < Math.abs(offset); step += 1) {
    let found: number | undefined;
    if (offset > 0) {
      // The first beat below that starts below the line. A line past the
      // script's last statement has no address.
      for (let l = line + 1; found === undefined; l += 1) {
        const start = await startOf(l);
        if (start === null) {
          // Past the script's last statement, only a header can follow.
          found = firstHeader(line, Infinity);
          if (found === undefined) {
            return null;
          }
        } else if (start !== undefined && start > line) {
          // A line that holds no statement takes the next beat's address,
          // which a header between them comes before.
          found = firstHeader(line, start) ?? start;
        }
      }
    } else {
      // The first beat above that starts above the line: the start of the
      // beat the line is inside, or the one before it.
      for (let l = line - 1; l >= 0 && found === undefined; l -= 1) {
        const start = await startOf(l);
        if (start != null && start < line) {
          found = start;
        }
      }
    }
    if (found === undefined) {
      return null;
    }
    line = found;
  }
  return { file: currentFile, line };
};
