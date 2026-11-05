import type { FileCommit } from "../types/workspace/FileCommit";

export const compareFileCommits = (a: FileCommit, b: FileCommit): number => {
  if (a.sequence !== b.sequence) {
    return a.sequence < b.sequence ? -1 : 1;
  }
  if (a.writer === b.writer) {
    return 0;
  }
  return a.writer < b.writer ? -1 : 1;
};

export const isSupersededCommit = (
  commit: FileCommit | undefined,
  held: FileCommit | undefined,
): boolean =>
  commit != null && held != null && compareFileCommits(commit, held) < 0;
