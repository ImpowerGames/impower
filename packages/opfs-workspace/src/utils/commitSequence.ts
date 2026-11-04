import type { FileCommit } from "@impower/spark-editor-protocol/src/types/workspace/FileCommit";

export const COMMIT_SEQUENCE_FILE = ".opfs-workspace-sequence";

const SEQUENCE_LOCK = "opfs-workspace:sequence";

const SEQUENCE_DIGITS = 16;

const tails = new Map<string, Promise<void>>();

const sharedLocks = () => globalThis.navigator?.locks;

export const withLock = <T>(name: string, task: () => Promise<T>): Promise<T> => {
  const locks = sharedLocks();
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

export const withSharedLock = <T>(
  name: string,
  task: () => Promise<T>,
): Promise<T> => {
  const locks = sharedLocks();
  return locks
    ? (locks.request(name, { mode: "shared" }, task) as Promise<T>)
    : task();
};

const readSequence = async (handle: FileSystemFileHandle) => {
  const value = Number.parseInt(await (await handle.getFile()).text(), 10);
  return Number.isFinite(value) ? value : 0;
};

export const readCommitSequence = async (
  root: FileSystemDirectoryHandle,
): Promise<number | undefined> => {
  const locks = sharedLocks();
  if (!locks) {
    return undefined;
  }
  return locks.request(SEQUENCE_LOCK, async () => {
    try {
      return await readSequence(
        await root.getFileHandle(COMMIT_SEQUENCE_FILE, { create: true }),
      );
    } catch {
      return undefined;
    }
  });
};

export const allocateCommit = async (
  root: FileSystemDirectoryHandle,
  writer: string,
  floor: number,
): Promise<FileCommit | undefined> => {
  const locks = sharedLocks();
  if (!locks) {
    return undefined;
  }
  return locks.request(SEQUENCE_LOCK, async () => {
    try {
      const handle = await root.getFileHandle(COMMIT_SEQUENCE_FILE, {
        create: true,
      });
      const sequence = Math.max(await readSequence(handle), floor) + 1;
      const access = await handle.createSyncAccessHandle();
      try {
        const bytes = new TextEncoder().encode(
          String(sequence).padStart(SEQUENCE_DIGITS, "0"),
        );
        if (access.write(bytes, { at: 0 }) !== bytes.byteLength) {
          throw new Error("Short write to the commit sequence");
        }
        access.flush();
      } finally {
        access.close();
      }
      return { sequence, writer };
    } catch (err) {
      console.warn("opfs-workspace: shared commit sequence unavailable", err);
      return undefined;
    }
  });
};
