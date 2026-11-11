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
  | "moveFile"
  | "moveFolder"
  | "getFiles"
  | "getFolders"
  | "getRelativePath"
  | "getFileUri"
  | "deleteFiles"
  | "createFolders"
  | "deleteFolders"
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

const within = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`);

const outermostOf = (paths: readonly string[]) =>
  paths.filter((path) => !paths.some((other) => other !== path && within(path, other)));

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
  const folders = moves.filter((move) => move.isDir);
  const lost = (now: PathSnapshot) =>
    folders.flatMap((move) =>
      [...before.folders].filter((folder) => within(folder, move.from) && !now.folders.has(folder)),
    );
  const made = (now: PathSnapshot) =>
    folders.flatMap((move) =>
      [...now.folders].filter((folder) => within(folder, move.to) && !before.folders.has(folder)),
    );
  const settled = await snapshotPaths(fs, projectId);
  try {
    const missing = lost(settled);
    if (missing.length) {
      await fs.createFolders(projectId, missing);
    }
    const empty = outermostOf(
      made(settled).filter((folder) => ![...settled.files].some((path) => within(path, folder))),
    );
    if (empty.length) {
      await fs.deleteFolders(projectId, empty);
    }
  } catch (error) {
    problems.set("folders", reasonOf(error));
  }
  const now = await snapshotPaths(fs, projectId);
  const why = (path: string) => (problems.has(path) ? `: ${problems.get(path)}` : "");
  const stranded = moved(now).map(
    (move) => `${move.to} (was ${move.from}; putting it back failed${why(move.to)})`,
  );
  const doubled = copied(now).map(
    (move) => `${move.to} (a copy of ${move.from}, which is still there; removing the copy failed${why(move.to)})`,
  );
  const gone = lost(now);
  const left = made(now);
  const state = [
    stranded.length ? `Not put back: ${stranded.join(", ")}.` : "",
    doubled.length ? `Left behind: ${doubled.join(", ")}.` : "",
    gone.length ? `Folders not put back${why("folders")}: ${gone.join(", ")}.` : "",
    left.length ? `Folders left behind${why("folders")}: ${left.join(", ")}.` : "",
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
