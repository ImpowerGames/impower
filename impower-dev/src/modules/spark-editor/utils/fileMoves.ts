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

export interface PathSnapshot {
  files: Set<string>;
  folders: Set<string>;
}

export type MovingFileSystem = Pick<
  WorkspaceFileSystem,
  "moveFile" | "moveFolder" | "getFiles" | "getFolders" | "getRelativePath" | "getFileUri" | "deleteFiles"
>;

const basename = (path: string) => path.split("/").pop() || path;

export const reasonOf = (error: unknown) =>
  String((error as { message?: unknown })?.message ?? error);

export const reversed = (moves: readonly FileMove[]): FileMove[] =>
  moves.map(({ from, to, isDir }) => ({ from: to, to: from, isDir })).reverse();

export const movesLabel = (moves: readonly FileMove[]) =>
  moves.length === 1 ? basename(moves[0]!.from) : `${moves.length} files`;

export async function snapshotPaths(
  fs: Pick<WorkspaceFileSystem, "getFiles" | "getFolders" | "getRelativePath">,
  projectId: string,
): Promise<PathSnapshot> {
  const files = Object.keys(await fs.getFiles(projectId)).map((uri) =>
    fs.getRelativePath(projectId, uri),
  );
  return { files: new Set(files), folders: new Set(await fs.getFolders(projectId)) };
}

const fileMovesOf = (moves: readonly FileMove[], before: PathSnapshot): FileMove[] =>
  moves.flatMap((move) =>
    move.isDir
      ? [...before.files]
          .filter((path) => path.startsWith(`${move.from}/`))
          .map((path) => ({ from: path, to: move.to + path.slice(move.from.length) }))
      : [{ from: move.from, to: move.to }],
  );

const moveOne = (fs: MovingFileSystem, projectId: string, move: FileMove) =>
  move.isDir
    ? fs.moveFolder(projectId, move.from, move.to)
    : fs.moveFile(projectId, move.from, move.to);

export async function settleFailedMoves(
  fs: MovingFileSystem,
  projectId: string,
  moves: readonly FileMove[],
  before: PathSnapshot,
  failure: string,
): Promise<Error> {
  const files = fileMovesOf(moves, before);
  const moved = (now: PathSnapshot) =>
    files.filter((move) => now.files.has(move.to) && !now.files.has(move.from));
  const copied = (now: PathSnapshot) =>
    files.filter(
      (move) => now.files.has(move.to) && now.files.has(move.from) && !before.files.has(move.to),
    );
  const problems = new Map<string, string>();
  const after = await snapshotPaths(fs, projectId);
  for (const move of reversed(moved(after))) {
    try {
      await fs.moveFile(projectId, move.from, move.to);
    } catch (error) {
      problems.set(move.from, reasonOf(error));
    }
  }
  for (const move of copied(after)) {
    try {
      await fs.deleteFiles({ files: [{ uri: fs.getFileUri(projectId, move.to) }], mode: "trash" });
    } catch (error) {
      problems.set(move.to, reasonOf(error));
    }
  }
  const now = await snapshotPaths(fs, projectId);
  const why = (path: string) => (problems.has(path) ? `: ${problems.get(path)}` : "");
  const stranded = moved(now).map(
    (move) => `${move.to} (was ${move.from}; putting it back failed${why(move.to)})`,
  );
  const doubled = copied(now).map(
    (move) => `${move.to} (a copy of ${move.from}, which is still there; removing the copy failed${why(move.to)})`,
  );
  const state = [
    stranded.length ? `Not put back: ${stranded.join(", ")}.` : "",
    doubled.length ? `Left behind: ${doubled.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return new Error(`${failure} ${state || "Every file is back where it was."}`);
}

export async function moveAll(
  fs: MovingFileSystem,
  projectId: string,
  moves: readonly FileMove[],
): Promise<RenameOutcome> {
  const before = await snapshotPaths(fs, projectId);
  try {
    for (const move of moves) {
      await moveOne(fs, projectId, move);
    }
  } catch (error) {
    throw await settleFailedMoves(
      fs,
      projectId,
      moves,
      before,
      `Couldn't move ${movesLabel(moves)}: ${reasonOf(error)}.`,
    );
  }
  return { referencesUpdated: 0, also: [] };
}
