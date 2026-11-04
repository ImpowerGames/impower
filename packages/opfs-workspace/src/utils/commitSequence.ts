import type { FileCommit } from "@impower/spark-editor-protocol/src/types/workspace/FileCommit";

export const COMMIT_SEQUENCE_FILE = ".opfs-workspace-sequence";

const SEQUENCE_LOCK = "opfs-workspace:sequence";

const tails = new Map<string, Promise<void>>();

export const withLock = <T>(name: string, task: () => Promise<T>): Promise<T> => {
  const locks = globalThis.navigator?.locks;
  if (locks) {
    return locks.request(name, task) as Promise<T>;
  }
  const run = (tails.get(name) ?? Promise.resolve()).then(task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(name, tail);
  void tail.then(() => {
    if (tails.get(name) === tail) {
      tails.delete(name);
    }
  });
  return run;
};

const readSequence = async (handle: FileSystemFileHandle) => {
  const value = Number.parseInt(await (await handle.getFile()).text(), 10);
  return Number.isFinite(value) ? value : 0;
};

export const readCommitSequence = (
  root: FileSystemDirectoryHandle,
): Promise<number | undefined> =>
  withLock(SEQUENCE_LOCK, async () => {
    try {
      return await readSequence(
        await root.getFileHandle(COMMIT_SEQUENCE_FILE, { create: true }),
      );
    } catch {
      return undefined;
    }
  });

export const allocateCommit = (
  root: FileSystemDirectoryHandle,
  writer: string,
  floor: number,
): Promise<FileCommit> =>
  withLock(SEQUENCE_LOCK, async () => {
    let sequence = floor + 1;
    try {
      const handle = await root.getFileHandle(COMMIT_SEQUENCE_FILE, {
        create: true,
      });
      sequence = Math.max(await readSequence(handle), floor) + 1;
      const access = await handle.createSyncAccessHandle();
      try {
        access.truncate(0);
        access.write(new TextEncoder().encode(String(sequence)), { at: 0 });
        access.flush();
      } finally {
        access.close();
      }
    } catch (err) {
      console.warn("opfs-workspace: shared commit sequence unavailable", err);
    }
    return { sequence, writer };
  });
