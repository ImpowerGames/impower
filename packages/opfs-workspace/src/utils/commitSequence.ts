import type { FileCommit } from "@impower/spark-editor-protocol/src/types/workspace/FileCommit";
import { sharedLocks, withLock } from "./locks";

export const COMMIT_SEQUENCE_FILE = ".opfs-workspace-sequence";

const SEQUENCE_LOCK = "opfs-workspace:sequence";

const SEQUENCE_DIGITS = 16;

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

interface CommitRequest {
  writer: string;
  floor: number;
  resolve: (commit: FileCommit | undefined) => void;
  reject: (reason: unknown) => void;
}

const waiting = new Map<FileSystemDirectoryHandle, CommitRequest[]>();

const writeSequences = async (
  root: FileSystemDirectoryHandle,
  requests: readonly CommitRequest[],
): Promise<FileCommit[] | undefined> => {
  try {
    const handle = await root.getFileHandle(COMMIT_SEQUENCE_FILE, {
      create: true,
    });
    let sequence = await readSequence(handle);
    const commits = requests.map(({ writer, floor }) => {
      sequence = Math.max(sequence, floor) + 1;
      return { sequence, writer };
    });
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
    return commits;
  } catch (err) {
    console.warn("opfs-workspace: shared commit sequence unavailable", err);
    return undefined;
  }
};

export const allocateCommit = (
  root: FileSystemDirectoryHandle,
  writer: string,
  floor: number,
): Promise<FileCommit | undefined> => {
  if (!sharedLocks()) {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve, reject) => {
    const queued = waiting.get(root);
    if (queued) {
      queued.push({ writer, floor, resolve, reject });
      return;
    }
    const requests = [{ writer, floor, resolve, reject }];
    waiting.set(root, requests);
    withLock(SEQUENCE_LOCK, () => {
      waiting.delete(root);
      return writeSequences(root, requests);
    }).then(
      (commits) =>
        requests.forEach((request, index) => request.resolve(commits?.[index])),
      (reason) => {
        if (waiting.get(root) === requests) {
          waiting.delete(root);
        }
        requests.forEach((request) => request.reject(reason));
      },
    );
  });
};
