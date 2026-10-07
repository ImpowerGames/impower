import type {
  AsyncProgramLocator,
  ProgramLocator,
} from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";

/** The program's accessor as the language server asks it: the compiler's
 *  worker's (`SparkdownWorkspace.locatorOf`), or a program's own
 *  (`programLocator`) where the program is at hand. */
export type OffsetLocator = Pick<ProgramLocator, "addressAt" | "locationOf"> | AsyncProgramLocator;

/**
 * The first line of the beat `offset` beats away from (`currentFile`,
 * `currentLine`) in that script: the previous beat (-1) or the next one (+1).
 * Powers the editor's PageUp/PageDown navigation.
 *
 * A beat is what the program's accessor gives one address (`ProgramLocator`),
 * which starts where `locationOf` says: the lines of one beat (a cue, a
 * directive, the dialogue) share it, and a line that holds no statement takes
 * the next beat's. So the next beat is the first one below the line that
 * starts below it, and the previous beat the first one above that starts
 * above it, which from inside a beat is that beat's start. The program
 * answers from either engine, and no line table reaches the client.
 *
 * This lives server-side deliberately: the program's locations are large on a
 * feature-length script, and shipping them to the client with every compile
 * just to answer an occasional keypress dominated the per-keystroke payload.
 * Asking for one location on demand is a few bytes. The language server asks
 * the compiler's worker, which holds the root a program compiled with
 * statement chunks is located by (#704).
 */
export const getOffsetSourceLocation = async (
  program: SparkProgram | undefined,
  locator: OffsetLocator | undefined,
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
  const addressAt = async (line: number) =>
    line < 0 ? undefined : await locator.addressAt(currentFile, line);
  const startOf = async (
    address: Awaited<ReturnType<typeof addressAt>>,
  ): Promise<number | undefined> => {
    if (address === undefined) {
      return undefined;
    }
    const location = await locator.locationOf(address);
    return location?.uri === currentFile ? location.startLine : undefined;
  };
  let line = currentLine;
  for (let step = 0; step < Math.abs(offset); step += 1) {
    let found: number | undefined;
    if (offset > 0) {
      // The first beat below that starts below the line. A line past the
      // script's last statement has no address.
      for (let l = line + 1; found === undefined; l += 1) {
        const address = await addressAt(l);
        if (address === undefined) {
          return null;
        }
        const start = await startOf(address);
        if (start !== undefined && start > line) {
          found = start;
        }
      }
    } else {
      // The first beat above that starts above the line: the start of the
      // beat the line is inside, or the one before it.
      for (let l = line - 1; l >= 0 && found === undefined; l -= 1) {
        const start = await startOf(await addressAt(l));
        if (start !== undefined && start < line) {
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
