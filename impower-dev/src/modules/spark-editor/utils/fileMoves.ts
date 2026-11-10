export interface FileMove {
  from: string;
  to: string;
  references: boolean;
}

export interface FileMoveSystem {
  moveFile(projectId: string, from: string, to: string): Promise<unknown>;
  renameFileWithReferences(projectId: string, from: string, to: string): Promise<unknown>;
}

export const applyMove = (fs: FileMoveSystem, projectId: string, move: FileMove) =>
  move.references
    ? fs.renameFileWithReferences(projectId, move.from, move.to)
    : fs.moveFile(projectId, move.from, move.to);

export const reversedMoves = (moves: readonly FileMove[]): FileMove[] =>
  [...moves].reverse().map((move) => ({ from: move.to, to: move.from, references: move.references }));

export const applyMoves = async (
  fs: FileMoveSystem,
  projectId: string,
  moves: readonly FileMove[],
): Promise<void> => {
  const done: FileMove[] = [];
  try {
    for (const move of moves) {
      await applyMove(fs, projectId, move);
      done.push(move);
    }
  } catch (error) {
    for (const move of reversedMoves(done)) {
      await applyMove(fs, projectId, move).catch(() => undefined);
    }
    throw error;
  }
};
