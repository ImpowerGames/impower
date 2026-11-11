import type WorkspaceFileSystem from "../workspace/WorkspaceFileSystem";

export interface FileMove {
  from: string;
  to: string;
  isDir?: boolean;
}

export interface RenameOutcome {
  referencesUpdated: number;
  also: FileMove[];
}

export type MovingFileSystem = Pick<
  WorkspaceFileSystem,
  "moveFile" | "moveFolder" | "getFiles" | "getFolders" | "getRelativePath"
>;

const basename = (path: string) => path.split("/").pop() || path;

export const reasonOf = (error: unknown) =>
  String((error as { message?: unknown })?.message ?? error);

export const reversed = (moves: readonly FileMove[]): FileMove[] =>
  moves.map(({ from, to, isDir }) => ({ from: to, to: from, isDir })).reverse();

export const movesLabel = (moves: readonly FileMove[]) =>
  moves.length === 1 ? basename(moves[0]!.from) : `${moves.length} files`;

export async function presentPaths(
  fs: Pick<WorkspaceFileSystem, "getFiles" | "getFolders" | "getRelativePath">,
  projectId: string,
): Promise<Set<string>> {
  const files = Object.keys(await fs.getFiles(projectId)).map((uri) =>
    fs.getRelativePath(projectId, uri),
  );
  return new Set([...files, ...(await fs.getFolders(projectId))]);
}

const moveOne = (fs: MovingFileSystem, projectId: string, move: FileMove) =>
  move.isDir
    ? fs.moveFolder(projectId, move.from, move.to)
    : fs.moveFile(projectId, move.from, move.to);

export async function settleFailedMoves(
  fs: MovingFileSystem,
  projectId: string,
  moves: readonly FileMove[],
  failure: string,
): Promise<Error> {
  const moved = (present: Set<string>) =>
    moves.filter((move) => present.has(move.to) && !present.has(move.from));
  const rollbacks = new Map<string, string>();
  for (const move of reversed(moved(await presentPaths(fs, projectId)))) {
    try {
      await moveOne(fs, projectId, move);
    } catch (error) {
      rollbacks.set(move.from, reasonOf(error));
    }
  }
  const stranded = moved(await presentPaths(fs, projectId));
  const state = stranded.length
    ? `Not put back: ${stranded
        .map((move) => {
          const why = rollbacks.get(move.to);
          return `${move.to} (was ${move.from}${why ? `; putting it back failed: ${why}` : ""})`;
        })
        .join(", ")}.`
    : "Every file is back where it was.";
  return new Error(`${failure} ${state}`);
}

export async function moveAll(
  fs: MovingFileSystem,
  projectId: string,
  moves: readonly FileMove[],
): Promise<RenameOutcome> {
  try {
    for (const move of moves) {
      await moveOne(fs, projectId, move);
    }
  } catch (error) {
    throw await settleFailedMoves(
      fs,
      projectId,
      moves,
      `Couldn't move ${movesLabel(moves)}: ${reasonOf(error)}.`,
    );
  }
  return { referencesUpdated: 0, also: [] };
}
