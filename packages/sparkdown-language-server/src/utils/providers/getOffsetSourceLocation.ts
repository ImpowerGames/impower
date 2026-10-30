import type {
  AddressQuery,
  LineBeat,
} from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { beatAt } from "@impower/sparkdown/src/compiler/utils/programLocator";

export interface BeatLocator {
  beatAt(
    uri: string,
    line: number,
    query?: AddressQuery,
  ): LineBeat | undefined | Promise<LineBeat | undefined>;
}

export const ownBeats = (program: SparkProgram): BeatLocator => ({
  beatAt: (uri, line, query) => beatAt(program, uri, line, query),
});

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
  const firstHeader = (after: number, before: number): number | undefined => {
    let first: number | undefined;
    for (const header of headers) {
      if (header > after && header < before && (first === undefined || header < first)) {
        first = header;
      }
    }
    return first;
  };
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
      for (let l = line + 1; found === undefined; l += 1) {
        const start = await startOf(l);
        if (start === null) {
          found = firstHeader(line, Infinity);
          if (found === undefined) {
            return null;
          }
        } else if (start !== undefined && start > line) {
          found = firstHeader(line, start) ?? start;
        }
      }
    } else {
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
