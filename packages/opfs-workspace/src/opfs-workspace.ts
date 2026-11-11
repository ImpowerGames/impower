import { globToRegex } from "@impower/jsonrpc/src/common/utils/globToRegex";
import { ErrorCodes } from "@impower/spark-editor-protocol/src/enums/ErrorCodes";
import { normalizeSVGAttributeNames } from "@impower/sparkdown/src/attributes";
import { getOrCreateThumbnail } from "@impower/sparkdown/src/thumbnails/composeThumbnail";
import { RESOURCE_PROTOCOL } from "@impower/sparkdown/src/workspace/utils/resourceUrl";
import { FileChangeType } from "@impower/spark-editor-protocol/src/enums/FileChangeType";
import { ApplyWorkspaceEditMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ApplyWorkspaceEditMessage";
import { ConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ConfigurationMessage";
import { DidChangeConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage";
import { DidChangeDirectoriesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeDirectoriesMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { DirectoriesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DirectoriesMessage";
import { DidCreateFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidCreateFilesMessage";
import { DidDeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidDeleteFilesMessage";
import { DidRenameFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidRenameFilesMessage";
import { DidWriteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFilesMessage";
import { ReadDirectoryFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ReadDirectoryFilesMessage";
import { ReadFileMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ReadFileMessage";
import { UnzipFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/UnzipFilesMessage";
import { WillCreateFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillCreateFilesMessage";
import { WillDeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillDeleteFilesMessage";
import { WillRenameFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillRenameFilesMessage";
import {
  TrashFilesMessage,
  TrashFilesResult,
} from "@impower/spark-editor-protocol/src/protocols/workspace/TrashFilesMessage";
import { TrashBatch } from "@impower/spark-editor-protocol/src/types/workspace/TrashBatch";
import { WillWriteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillWriteFilesMessage";
import { ZipFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ZipFilesMessage";
import {
  AnnotatedTextEdit,
  FileCommit,
  FileCommits,
  FileCreate,
  FileData,
  FileEvent,
  RenameFileOptions,
  TextDocumentEdit,
  TextEdit,
} from "@impower/spark-editor-protocol/src/types";
import {
  compareFileCommits,
  isSupersededCommit,
} from "@impower/spark-editor-protocol/src/utils/fileCommits";
import { withParams } from "@impower/spark-editor-protocol/src/utils/withParams";
import { NotificationMessage } from "@impower/spark-editor-protocol/src/types/base/NotificationMessage";
import { ResponseMessage } from "@impower/spark-editor-protocol/src/types/base/ResponseMessage";
import { unzipSync, zipSync } from "fflate";
import { TextDocument } from "vscode-languageserver-textdocument";
import { buildZippable, parseUnzipEntries } from "./utils/assetArchive";
import {
  allocateCommit,
  readCommitSequence,
  withLock,
  withSharedLock,
} from "./utils/commitSequence";
import debounce from "./utils/debounce";
import {
  createDirectory,
  deleteEmptyDirectory,
  findDirectory,
  getAllDirectoriesRecursive,
  getAllFilePathsRecursive,
} from "./utils/directories";
import { getDirectoryHandleFromPath } from "./utils/getDirectoryHandleFromPath";
import { getFileExtension } from "./utils/getFileExtension";
import { getFileName } from "./utils/getFileName";
import { getName } from "./utils/getName";
import { getParentPath } from "./utils/getParentPath";
import { getPathFromUri } from "./utils/getPathFromUri";
import { getSrcFromUri } from "./utils/getSrcFromUri";
import { getUriFromPath } from "./utils/getUriFromPath";

console.log("running opfs-workspace v1.0");

const MAGENTA = "\x1b[35m%s\x1b[0m";

const WRITE_DEBOUNCE_DELAY = 100;

const NEWLINE_REGEX = /\r\n|\r|\n/g;

const LANGUAGE_ID = "sparkdown";

const languageIdOf = (uri: string): string =>
  uri.endsWith(".luau") ? "luau" : LANGUAGE_ID;

const TRASH_DIR = ".trash";
const TRASH_MANIFEST = "__manifest.json";
const DEFAULT_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const THUMB_CACHE_NAME = "asset-thumbnails";
const THUMB_WIDTH = 144;
const RASTER_IMAGE_REGEX = /[.](png|jpe?g|gif|webp)$/i;
const THUMBNAILS_SUPPORTED =
  typeof createImageBitmap === "function" &&
  typeof OffscreenCanvas === "function" &&
  typeof caches !== "undefined";

interface WriteResult {
  file: FileData;
  created: boolean;
  local: number;
  commit?: FileCommit;
  origin?: string;
}

interface DeleteResult {
  uri: string;
  file?: FileData;
  local: number;
  commit?: FileCommit;
}

interface RenameOutcome {
  oldUri: string;
  newUri: string;
  options?: RenameFileOptions;
  file?: FileData;
  write?: WriteResult;
  deleted?: DeleteResult;
  error?: unknown;
}

interface WriteBatch {
  buffer: DataView | Uint8Array;
  version: number;
  origin?: string;
  due: boolean;
  settled: Promise<void>;
  settle: () => void;
  listeners: {
    resolve(result: WriteResult): void;
    reject(error: unknown): void;
  }[];
}

abstract class State {
  static imageFilePattern?: RegExp;
  static audioFilePattern?: RegExp;
  static videoFilePattern?: RegExp;
  static fontFilePattern?: RegExp;
  static scriptFilePattern?: RegExp;
  static writeQueue = new Map<
    string,
    {
      handler: (uri: string) => void;
      batches: WriteBatch[];
      writing?: WriteBatch;
    }
  >();
  static files = new Map<string, FileData>();
  static documents = new Map<string, TextDocument>();
  static commits = new Map<string, FileCommit>();
  static directoryFloors = new Map<string, FileCommit>();
  static localVersions = new Map<string, number>();
  static localClock = 0;
  static clock = 0;
  static writer = crypto.randomUUID();
}

const touch = (uris: string[]) => {
  State.localClock += 1;
  for (const uri of uris) {
    State.localVersions.set(uri, State.localClock);
  }
  return State.localClock;
};

const isLocalLatest = (uri: string, local: number) =>
  State.localVersions.get(uri) === local;

const SETTLED_WRITER = "\uffff";

const observeCommit = (commit: FileCommit) => {
  State.clock = Math.max(State.clock, commit.sequence);
};

const heldCommit = (uri: string) => {
  let held = State.commits.get(uri);
  for (const [directoryUri, floor] of State.directoryFloors) {
    if (
      uri.startsWith(`${directoryUri}/`) &&
      (!held || compareFileCommits(floor, held) > 0)
    ) {
      held = floor;
    }
  }
  return held;
};

const NO_COMMIT: FileCommit = { sequence: -1, writer: "" };

const removeDirectoryTree = (directoryUri: string, commit: FileCommit) => {
  raiseDirectoryFloor(directoryUri, commit);
  const evicted: string[] = [];
  for (const uri of [...State.files.keys()]) {
    if (
      uri.startsWith(`${directoryUri}/`) &&
      isNotNewer(uri, commit)
    ) {
      evictFile(uri);
      evicted.push(uri);
    }
  }
  if (evicted.length > 0) {
    touch(evicted);
  }
};

const isNotNewer = (uri: string, commit: FileCommit) =>
  compareFileCommits(State.commits.get(uri) ?? NO_COMMIT, commit) <= 0;

const raiseDirectoryFloor = (directoryUri: string, floor: FileCommit) => {
  const held = State.directoryFloors.get(directoryUri);
  if (!held || compareFileCommits(floor, held) > 0) {
    State.directoryFloors.set(directoryUri, floor);
  }
};

const isCurrentCommit = (uri: string, commit: FileCommit | undefined) =>
  !isSupersededCommit(commit, heldCommit(uri));

const acceptCommit = (uri: string, commit: FileCommit | undefined) => {
  if (!commit) {
    return true;
  }
  observeCommit(commit);
  if (!isCurrentCommit(uri, commit)) {
    return false;
  }
  State.commits.set(uri, commit);
  return true;
};

const withAncestors = (uri: string) => {
  const uris = [uri];
  for (
    let path = getParentPath(getPathFromUri(uri));
    path;
    path = getParentPath(path)
  ) {
    uris.push(getUriFromPath(path));
  }
  return uris;
};

const commitLockName = (uri: string) => `opfs-workspace:commit:${uri}`;

const withCommitLock = <T>(uri: string, task: () => Promise<T>) => {
  const parents = withAncestors(uri).slice(1).reverse();
  const lockFrom = (index: number): Promise<T> =>
    index < parents.length
      ? withSharedLock(commitLockName(parents[index]!), () => lockFrom(index + 1))
      : withLock(commitLockName(uri), task);
  return lockFrom(0);
};

const commitChange = <T>(
  lockUri: string,
  change: () => Promise<T>,
  changedUris: (result: T) => string[] = () => [lockUri],
) =>
  withCommitLock(lockUri, async () => {
    const result = await change();
    const uris = changedUris(result);
    if (uris.length === 0) {
      return { result, commit: undefined, local: undefined };
    }
    const commit = await allocateCommit(
      await navigator.storage.getDirectory(),
      State.writer,
      State.clock,
    );
    if (commit) {
      for (const uri of uris) {
        acceptCommit(uri, commit);
      }
    }
    return { result, commit, local: touch(uris) };
  });

class CommitLog {
  latest = new Map<string, { local: number; commit?: FileCommit }>();
  writes = new Map<string, WriteResult>();
  unordered = new Map<string, boolean>();

  record(
    uri: string,
    local: number | undefined,
    commit?: FileCommit,
    directory = false,
  ) {
    if (local == null) {
      return;
    }
    if (!commit) {
      this.unordered.set(uri, directory || (this.unordered.get(uri) ?? false));
      return;
    }
    const held = this.latest.get(uri);
    if (!held || local > held.local) {
      this.latest.set(uri, { local, commit });
    }
  }

  wrote(result: WriteResult) {
    const uri = result.file.uri;
    this.record(uri, result.local, result.commit);
    const held = this.writes.get(uri);
    if (!held || result.local > held.local) {
      this.writes.set(uri, result);
    }
  }

  reconcile(uri: string, directory: boolean) {
    this.unordered.set(uri, directory || (this.unordered.get(uri) ?? false));
  }

  isCurrent(uri: string) {
    if (this.unordered.has(uri)) {
      return false;
    }
    const latest = this.latest.get(uri);
    return !latest || isLocalLatest(uri, latest.local);
  }

  isLatest(uri: string, local: number | undefined) {
    const latest = this.latest.get(uri);
    return (
      !this.unordered.has(uri) &&
      local != null &&
      latest?.local === local &&
      isLocalLatest(uri, local)
    );
  }

  stamp(uris: Iterable<string>): FileCommits {
    const commits: FileCommits = {};
    for (const uri of uris) {
      const commit = this.latest.get(uri)?.commit;
      if (commit) {
        commits[uri] = commit;
      }
    }
    return commits;
  }
}

const channel = new BroadcastChannel("opfs-workspace");
let remoteMessages = Promise.resolve();
channel.onmessage = (event) => {
  remoteMessages = remoteMessages
    .then(async () => {
      const { forward, unordered } = await reconcileRemoteMessage(event.data);
      if (forward) {
        postMessage(forward);
      }
      if (unordered.length > 0) {
        announceSettled(await settlePaths(unordered), { local: false });
      }
    })
    .catch((err) => console.error(err));
};
const broadcast = (message: NotificationMessage<string, object>) => {
  postMessage(message);
  const remoteMessage = structuredClone(message);
  remoteMessage.params.remote = true;
  channel.postMessage(remoteMessage);
};
const broadcastWrites = (log: CommitLog) => {
  const filesByOrigin = new Map<string | undefined, FileData[]>();
  for (const [uri, result] of log.writes) {
    if (!log.isLatest(uri, result.local)) {
      continue;
    }
    const origin = result.origin;
    filesByOrigin.set(origin, [
      ...(filesByOrigin.get(origin) ?? []),
      result.file,
    ]);
  }
  if (filesByOrigin.size === 0) {
    filesByOrigin.set(undefined, []);
  }
  filesByOrigin.forEach((files, origin) => {
    broadcast(
      DidWriteFilesMessage.type.notification({
        files,
        remote: false,
        origin,
        commits: log.stamp(files.map((f) => f.uri)),
      }),
    );
  });
};
const broadcastCreates = (log: CommitLog, results: WriteResult[]) => {
  const files = results
    .filter((r) => r.created && log.isCurrent(r.file.uri))
    .map((r) => ({ uri: r.file.uri }));
  if (files.length > 0) {
    broadcast(
      DidCreateFilesMessage.type.notification({
        files,
        commits: log.stamp(files.map((f) => f.uri)),
      }),
    );
  }
};
const broadcastDeletes = (log: CommitLog, results: DeleteResult[]) => {
  const files = results
    .filter((r) => log.isLatest(r.uri, r.local))
    .map((r) => ({ uri: r.uri }));
  if (files.length > 0) {
    broadcast(
      DidDeleteFilesMessage.type.notification({
        files,
        commits: log.stamp(files.map((f) => f.uri)),
      }),
    );
  }
};
const broadcastRenames = (log: CommitLog, outcomes: RenameOutcome[]) => {
  const files = outcomes
    .filter((o) => o.deleted && log.isLatest(o.oldUri, o.deleted.local))
    .map((o) => ({ oldUri: o.oldUri, newUri: o.newUri }));
  if (files.length > 0) {
    broadcast(
      DidRenameFilesMessage.type.notification({
        files,
        commits: log.stamp(files.flatMap((f) => [f.oldUri, f.newUri])),
      }),
    );
  }
};
const broadcastWatchedChanges = (log: CommitLog, events: FileEvent[]) => {
  const changes = events.filter((e) => log.isCurrent(e.uri));
  if (changes.length > 0) {
    broadcast(
      DidChangeWatchedFilesMessage.type.notification({
        changes,
        commits: log.stamp(changes.map((c) => c.uri)),
      }),
    );
  }
};

const isMissingEntry = (err: unknown) => {
  const name = (err as DOMException)?.name;
  return name === "NotFoundError" || name === "TypeMismatchError";
};

const findFileHandle = async (uri: string) => {
  const relativePath = getPathFromUri(uri);
  const directory = await findDirectory(
    await navigator.storage.getDirectory(),
    getParentPath(relativePath),
  );
  try {
    return await directory?.getFileHandle(getFileName(relativePath), {
      create: false,
    });
  } catch (err) {
    if (isMissingEntry(err)) {
      return undefined;
    }
    throw err;
  }
};

const isStoredDirectory = async (uri: string) =>
  (await findDirectory(
    await navigator.storage.getDirectory(),
    getPathFromUri(uri),
  )) != null;

const raiseHeld = (uri: string, commit: FileCommit) => {
  observeCommit(commit);
  const held = State.commits.get(uri);
  if (!held || compareFileCommits(commit, held) > 0) {
    State.commits.set(uri, commit);
  }
};

const observeExists = (uri: string, commit: FileCommit | undefined) => {
  const uris = withAncestors(uri);
  if (commit) {
    uris.forEach((u) => raiseHeld(u, commit));
  }
  return touch(uris);
};

const observeAbsent = (
  uri: string,
  commit: FileCommit | undefined,
  directory: boolean,
) => {
  if (commit) {
    raiseHeld(uri, commit);
  }
  evictFile(uri);
  const changed = [uri];
  if (directory) {
    if (commit) {
      raiseDirectoryFloor(uri, commit);
    }
    for (const cached of [...State.files.keys()]) {
      if (
        cached.startsWith(`${uri}/`) &&
        (!commit || isNotNewer(cached, commit))
      ) {
        evictFile(cached);
        changed.push(cached);
      }
    }
  }
  return touch(changed);
};

interface SettledPath {
  uri: string;
  local: number;
  directory: boolean;
  exists: boolean;
  created: boolean;
  file?: FileData;
  floor?: FileCommit;
}

const settlePath = (uri: string, directory: boolean) =>
  withCommitLock(uri, async (): Promise<SettledPath> => {
    const floor = await readFloor(await navigator.storage.getDirectory());
    if (directory) {
      const exists = await isStoredDirectory(uri);
      const local = exists
        ? observeExists(uri, floor)
        : observeAbsent(uri, floor, true);
      return { uri, local, directory, exists, created: false, floor };
    }
    const handle = await findFileHandle(uri);
    if (!handle) {
      const local = observeAbsent(uri, floor, false);
      return { uri, local, directory, exists: false, created: false, floor };
    }
    const created = !State.files.has(uri);
    const fileRef = await handle.getFile();
    if (needsTextAtEnumeration(uri)) {
      updateFileCache(uri, await fileRef.arrayBuffer(), true, undefined, fileRef.lastModified);
      await enrichUrlAssetType(uri);
    } else {
      updateFileMetaCache(uri, fileRef.size, fileRef.lastModified);
    }
    const local = observeExists(uri, floor);
    return { uri, local, directory, exists: true, created, file: State.files.get(uri), floor };
  });

const settlePaths = async (paths: { uri: string; directory: boolean }[]) => {
  const unique = new Map<string, boolean>();
  for (const path of paths) {
    unique.set(path.uri, path.directory || (unique.get(path.uri) ?? false));
  }
  const settled: SettledPath[] = [];
  for (const [uri, directory] of unique) {
    settled.push(await settlePath(uri, directory));
  }
  return settled;
};

const announceSettled = (
  observed: SettledPath[],
  { local }: { local: boolean },
) => {
  const settled = observed.filter((e) => isLocalLatest(e.uri, e.local));
  const commitsOf = (entries: SettledPath[]): FileCommits =>
    Object.fromEntries(
      entries.flatMap((e) => (e.floor ? [[e.uri, e.floor]] : [])),
    );
  const files = settled.filter((e) => !e.directory && e.exists && e.file);
  const absent = settled.filter((e) => !e.directory && !e.exists);
  const createdDirectories = settled.filter((e) => e.directory && e.exists);
  const deletedDirectories = settled.filter((e) => e.directory && !e.exists);
  const watched = settled.filter((e) => !e.directory);
  const messages: NotificationMessage<string, any>[] = [];
  if (files.length > 0) {
    messages.push(
      DidWriteFilesMessage.type.notification({
        files: files.map((e) => e.file!),
        remote: !local,
        commits: commitsOf(files),
      }),
    );
  }
  if (absent.length > 0) {
    messages.push(
      DidDeleteFilesMessage.type.notification({
        files: absent.map((e) => ({ uri: e.uri })),
        remote: !local,
        commits: commitsOf(absent),
      }),
    );
  }
  if (createdDirectories.length + deletedDirectories.length > 0) {
    messages.push(
      DidChangeDirectoriesMessage.type.notification({
        created: createdDirectories.map((e) => e.uri),
        deleted: deletedDirectories.map((e) => e.uri),
        remote: !local,
        commits: commitsOf([...createdDirectories, ...deletedDirectories]),
      }),
    );
  }
  if (watched.length > 0) {
    messages.push(
      DidChangeWatchedFilesMessage.type.notification({
        changes: watched.map((e) => ({
          uri: e.uri,
          type: !e.exists
            ? FileChangeType.Deleted
            : e.created
              ? FileChangeType.Created
              : FileChangeType.Changed,
        })),
        remote: !local,
        commits: commitsOf(watched),
      }),
    );
  }
  for (const message of messages) {
    postMessage(message);
    if (local) {
      const unordered = structuredClone(message);
      unordered.params.remote = true;
      delete unordered.params.commits;
      channel.postMessage(unordered);
    }
  }
};

const announceUnordered = async (log: CommitLog) => {
  if (log.unordered.size === 0) {
    return;
  }
  announceSettled(
    await settlePaths(
      [...log.unordered].map(([uri, directory]) => ({ uri, directory })),
    ),
    { local: true },
  );
};

const reconcileRemoteMessage = async (
  message: any,
): Promise<{ forward: any; unordered: { uri: string; directory: boolean }[] }> => {
  const commits: FileCommits | undefined = message?.params?.commits;
  if (commits) {
    Object.values(commits).forEach(observeCommit);
  }
  const unordered: { uri: string; directory: boolean }[] = [];
  const fresh = (uri: string) => acceptCommit(uri, commits?.[uri]);
  const stamped = (uri: string, directory = false) => {
    if (commits?.[uri] != null) {
      return true;
    }
    unordered.push({ uri, directory });
    return false;
  };
  const keep = <T>(original: T[], kept: T[], params: object) => ({
    forward:
      original.length === 0 || kept.length > 0
        ? withParams(message, params)
        : null,
    unordered,
  });
  if (DidWriteFilesMessage.type.isNotification(message)) {
    const files = message.params.files.filter(
      (f) => stamped(f.uri) && fresh(f.uri),
    );
    for (const file of files) {
      State.files.set(file.uri, { ...file });
      observeExists(file.uri, commits![file.uri]);
    }
    return keep(message.params.files, files, { files });
  }
  if (DidCreateFilesMessage.type.isNotification(message)) {
    const files = message.params.files.filter(
      (f) => stamped(f.uri) && fresh(f.uri),
    );
    return keep(message.params.files, files, { files });
  }
  if (DidDeleteFilesMessage.type.isNotification(message)) {
    const files = message.params.files.filter(
      (f) => stamped(f.uri) && fresh(f.uri),
    );
    for (const file of files) {
      observeAbsent(file.uri, commits![file.uri], false);
    }
    return keep(message.params.files, files, { files });
  }
  if (DidRenameFilesMessage.type.isNotification(message)) {
    const files = message.params.files.filter((f) => {
      if (!stamped(f.oldUri)) {
        unordered.push({ uri: f.newUri, directory: false });
        return false;
      }
      return fresh(f.oldUri);
    });
    for (const file of files) {
      observeAbsent(file.oldUri, commits![file.oldUri], false);
    }
    return keep(message.params.files, files, { files });
  }
  if (DidChangeWatchedFilesMessage.type.isNotification(message)) {
    const changes = message.params.changes.filter(
      (c) => stamped(c.uri) && fresh(c.uri),
    );
    return keep(message.params.changes, changes, { changes });
  }
  if (DidChangeDirectoriesMessage.type.isNotification(message)) {
    const created = message.params.created.filter(
      (uri) => stamped(uri, true) && fresh(uri),
    );
    created.forEach((uri) => observeExists(uri, commits![uri]));
    const deleted = message.params.deleted.filter(
      (uri) => stamped(uri, true) && fresh(uri),
    );
    deleted.forEach((uri) => observeAbsent(uri, commits![uri], true));
    return keep(
      [...message.params.created, ...message.params.deleted],
      [...created, ...deleted],
      { created, deleted },
    );
  }
  return { forward: message, unordered };
};
const respond = (message: ResponseMessage, transfer?: Transferable[]) => {
  if (transfer) {
    postMessage(message, transfer);
  } else {
    postMessage(message);
  }
};

const initialConfigurationMessage = ConfigurationMessage.type.request({
  items: [{ section: "sparkdown" }],
});
postMessage(initialConfigurationMessage);

onmessage = async (e) => {
  const message = e.data;
  if (ConfigurationMessage.type.isResponse(message)) {
    if (message.id === initialConfigurationMessage.id) {
      const settings = message.result?.[0];
      loadConfiguration(settings);
    }
  }
  if (DidChangeConfigurationMessage.type.isNotification(message)) {
    const { settings } = message.params;
    loadConfiguration(settings);
  }
  if (ReadDirectoryFilesMessage.type.isRequest(message)) {
    try {
      const { directory } = message.params;
      const files = await readDirectoryFiles(directory.uri);
      const response = ReadDirectoryFilesMessage.type.response(
        message.id,
        files,
      );
      respond(response);
    } catch (err: any) {
      console.error(err, err.stack);
      const response = ReadDirectoryFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      respond(response);
    }
  }
  if (DirectoriesMessage.type.isRequest(message)) {
    try {
      const params = message.params;
      const log = new CommitLog();
      let uris: string[];
      if (params.action === "list") {
        uris = await listDirectories(params.directory.uri);
      } else if (params.action === "create") {
        uris = await createDirectories(params.uris, log);
      } else {
        uris = await deleteEmptyDirectories(params.uris, log);
      }
      respond(DirectoriesMessage.type.response(message.id, { uris }));
      const changed = uris.filter((uri) => log.isCurrent(uri));
      if (params.action !== "list" && changed.length > 0) {
        broadcast(
          DidChangeDirectoriesMessage.type.notification({
            created: params.action === "create" ? changed : [],
            deleted: params.action === "delete" ? changed : [],
            commits: log.stamp(changed),
          }),
        );
      }
      await announceUnordered(log);
    } catch (err: any) {
      console.error(err, err.stack);
      respond(
        DirectoriesMessage.type.error(message.id, {
          code: ErrorCodes.InternalError,
          message: err.message,
        }),
      );
    }
  }
  if (ReadFileMessage.type.isRequest(message)) {
    try {
      const { file } = message.params;
      const buffer = await readFile(file.uri);
      const response = ReadFileMessage.type.response(message.id, buffer);
      respond(response, [buffer]);
    } catch (err: any) {
      console.error(err, err.stack);
      const response = ReadFileMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      respond(response);
    }
  }
  if (ZipFilesMessage.type.isRequest(message)) {
    const { files, directories, entries } = message.params;
    try {
      const buffer = (await zipFiles(files, directories, entries)) as ArrayBuffer;
      const response = ZipFilesMessage.type.response(message.id, buffer);
      respond(response, [buffer]);
    } catch (err: any) {
      console.error(err, err.stack);
      const response = ZipFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      respond(response);
    }
  }
  if (UnzipFilesMessage.type.isRequest(message)) {
    try {
      const { data } = message.params;
      const files = await unzipFiles(data);
      const response = UnzipFilesMessage.type.response(message.id, files);
      respond(
        response,
        files.map(({ data }) => data),
      );
    } catch (err: any) {
      console.error(err, err.stack);
      const response = UnzipFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      respond(response);
    }
  }
  if (WillWriteFilesMessage.type.isRequest(message)) {
    try {
      const { files, origin } = message.params;
      const result = await writeFiles(files, origin);
      const response = WillWriteFilesMessage.type.response(
        message.id,
        result.map((r) => r.file),
      );
      respond(response);
      const log = new CommitLog();
      result.forEach((r) => log.wrote(r));
      broadcastWrites(log);
      broadcastWatchedChanges(
        log,
        result.map((r) => ({
          uri: r.file.uri,
          type: FileChangeType.Changed,
        })),
      );
      await announceUnordered(log);
    } catch (err: any) {
      console.error(err, err.stack);
      const response = WillWriteFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      respond(response);
    }
  }
  if (WillCreateFilesMessage.type.isRequest(message)) {
    try {
      const { files } = message.params;
      const result = await createFiles(files);
      const response = WillCreateFilesMessage.type.response(
        message.id,
        result.map((r) => r.file),
      );
      respond(response);
      const log = new CommitLog();
      result.forEach((r) => log.wrote(r));
      broadcastWrites(log);
      broadcastCreates(log, result);
      broadcastWatchedChanges(
        log,
        result.map((r) => ({
          uri: r.file.uri,
          type: r.created ? FileChangeType.Created : FileChangeType.Changed,
        })),
      );
      await announceUnordered(log);
    } catch (err: any) {
      console.error(err, err.stack);
      const response = WillCreateFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      respond(response);
    }
  }
  if (WillDeleteFilesMessage.type.isRequest(message)) {
    try {
      const { files, mode, folders } = message.params;
      let deleted: DeleteResult[];
      let failure: PromiseRejectedResult | undefined;
      if (mode === "trash") {
        deleted = await moveFilesToTrash(files, folders);
      } else {
        const outcomes = await Promise.allSettled(files.map(file => deleteFiles([file])));
        deleted = outcomes.flatMap(outcome => outcome.status === "fulfilled" ? outcome.value : []);
        failure = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
      }
      const log = new CommitLog();
      deleted.forEach((d) => log.record(d.uri, d.local, d.commit));
      broadcastDeletes(log, deleted);
      broadcastWatchedChanges(log, deleted.map(d => ({ uri: d.uri, type: FileChangeType.Deleted })));
      await announceUnordered(log);
      if (failure) throw failure.reason;
      respond(WillDeleteFilesMessage.type.response(message.id, deleted.flatMap((d) => d.file ? [d.file] : [])));
    } catch (err: any) {
      console.error(err, err.stack);
      const response = WillDeleteFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      respond(response);
    }
  }
  if (TrashFilesMessage.type.isRequest(message)) {
    try {
      const { projectId, action, batchId, retentionMs } = message.params;
      let result: TrashFilesResult = {};
      const restored: WriteResult[] = [];
      const folderLog = new CommitLog();
      const folderUris: string[] = [];
      if (action === "list") {
        result = { batches: await listTrash(projectId) };
      } else if (action === "restore" && batchId) {
        const { written, folders, restoredFolders } = await restoreTrashBatch(projectId, batchId, folderLog);
        restored.push(...written);
        folderUris.push(...folders);
        result = { restored: restored.map((r) => r.file), restoredFolders };
      } else if (action === "deleteBatch" && batchId) {
        await removeTrashBatch(projectId, batchId);
      } else if (action === "empty") {
        await emptyTrash(projectId);
      } else if (action === "purge") {
        await purgeExpiredTrash(
          projectId,
          retentionMs ?? DEFAULT_TRASH_RETENTION_MS,
        );
      }
      respond(TrashFilesMessage.type.response(message.id, result));
      const createdFolders = folderUris.filter((uri) => folderLog.isCurrent(uri));
      if (createdFolders.length > 0) {
        broadcast(
          DidChangeDirectoriesMessage.type.notification({
            created: createdFolders,
            deleted: [],
            commits: folderLog.stamp(createdFolders),
          }),
        );
        await announceUnordered(folderLog);
      }
      if (restored.length > 0) {
        const log = new CommitLog();
        restored.forEach((r) => log.wrote(r));
        broadcastWrites(log);
        broadcastWatchedChanges(
          log,
          restored.map((r) => ({
            uri: r.file.uri,
            type: FileChangeType.Changed,
          })),
        );
        await announceUnordered(log);
      }
    } catch (err: any) {
      console.error(err, err.stack);
      respond(
        TrashFilesMessage.type.error(message.id, {
          code: ErrorCodes.InternalError,
          message: err.message,
        }),
      );
    }
  }
  if (WillRenameFilesMessage.type.isRequest(message)) {
    try {
      const { files } = message.params;
      const outcomes = await renameFiles(files);
      const log = new CommitLog();
      for (const o of outcomes) {
        if (o.write) log.wrote(o.write);
        if (o.deleted) log.record(o.deleted.uri, o.deleted.local, o.deleted.commit);
      }
      broadcastWrites(log);
      broadcastRenames(log, outcomes);
      const moved = outcomes.filter((o) => o.deleted);
      const written = outcomes.filter((o) => o.write);
      broadcastWatchedChanges(log, [
        ...moved.map(
          (o): FileEvent => ({ uri: o.oldUri, type: FileChangeType.Deleted }),
        ),
        ...written.map(
          (o): FileEvent => ({ uri: o.newUri, type: FileChangeType.Changed }),
        ),
        ...written.map(
          (o): FileEvent => ({ uri: o.newUri, type: FileChangeType.Created }),
        ),
      ]);
      await announceUnordered(log);
      const failed = outcomes.find((o) => o.error != null);
      if (failed) throw failed.error;
      const response = WillRenameFilesMessage.type.response(
        message.id,
        outcomes.flatMap((o) => (o.file ? [o.file] : [])),
      );
      respond(response);
    } catch (err: any) {
      console.error(err, err.stack);
      const response = WillRenameFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      respond(response);
    }
  }
  if (ApplyWorkspaceEditMessage.type.isRequest(message)) {
    const log = new CommitLog();
    const { effects, failure } = await applyWorkspaceEdit(
      message.params.edit,
      log,
    );

    broadcastCreates(log, effects.created);
    broadcastDeletes(log, effects.deleted);
    broadcastRenames(log, effects.renamed);
    broadcastWrites(log);
    broadcastWatchedChanges(log, effects.fileEvents);
    await announceUnordered(log);

    respond(
      ApplyWorkspaceEditMessage.type.response(
        message.id,
        failure
          ? {
              applied: false,
              failureReason: failure.reason,
              failedChange: failure.change,
            }
          : { applied: true },
      ),
    );
  }
};

type WorkspaceEditChange = NonNullable<
  ApplyWorkspaceEditMessage.Request["params"]["edit"]["documentChanges"]
>[number];

interface EditEffects {
  created: WriteResult[];
  deleted: DeleteResult[];
  renamed: RenameOutcome[];
  fileEvents: FileEvent[];
}

interface PriorEntry {
  uri: string;
  bytes?: ArrayBuffer;
  directory: boolean;
  local?: number;
  version?: number;
  document?: TextDocument;
}

const noEffects = (): EditEffects => ({
  created: [],
  deleted: [],
  renamed: [],
  fileEvents: [],
});

const storedBytes = (uri: string) =>
  withCommitLock(uri, async () => {
    const handle = await findFileHandle(uri);
    return handle ? (await handle.getFile()).arrayBuffer() : undefined;
  });

const missingDirectories = async (uri: string) => {
  const missing: string[] = [];
  for (
    let path = getParentPath(getPathFromUri(uri));
    path && !(await isStoredDirectory(getUriFromPath(path)));
    path = getParentPath(path)
  ) {
    missing.push(getUriFromPath(path));
  }
  return missing;
};

class UndoLog {
  prior = new Map<string, PriorEntry>();
  directories = new Set<string>();
  committed = new Map<string, number>();
  moves = new Map<string, string>();

  async record(change: WorkspaceEditChange) {
    if ("kind" in change && change.kind === "rename") {
      this.moves.set(change.newUri, change.oldUri);
    }
    const uris =
      "textDocument" in change
        ? [change.textDocument.uri]
        : change.kind === "rename"
          ? [change.oldUri, change.newUri]
          : [change.uri];
    for (const uri of uris) {
      if (this.prior.has(uri)) {
        continue;
      }
      await drainWrites(uri);
      const bytes = await storedBytes(uri);
      this.prior.set(uri, {
        uri,
        bytes,
        directory: !bytes && (await isStoredDirectory(uri)),
        local: State.localVersions.get(uri),
        version: State.files.get(uri)?.version,
        document: State.documents.get(uri),
      });
      for (const directory of await missingDirectories(uri)) {
        this.directories.add(directory);
      }
    }
  }

  commit(uri: string, local: number) {
    this.committed.set(uri, local);
  }

  async restore(log: CommitLog) {
    const effects = noEffects();
    const unknown: string[] = [];
    const kept: string[] = [];
    const restoring: PriorEntry[] = [];
    for (const entry of [...this.prior.values()].reverse()) {
      await drainWrites(entry.uri);
      const expected = this.committed.get(entry.uri) ?? entry.local;
      if (State.localVersions.get(entry.uri) !== expected) {
        kept.push(entry.uri);
      } else {
        restoring.push(entry);
      }
    }
    for (const entry of restoring.filter((e) => e.bytes)) {
      try {
        const current = await storedBytes(entry.uri);
        if (!current || !sameBytes(current, entry.bytes!)) {
          const result = await enqueueWrite(
            entry.uri,
            entry.version ?? 0,
            new Uint8Array(entry.bytes!),
            true,
          );
          log.wrote(result);
          effects.fileEvents.push({
            uri: entry.uri,
            type: FileChangeType.Changed,
          });
        }
      } catch (err) {
        console.error(err);
        unknown.push(entry.uri);
      }
    }
    for (const entry of restoring.filter((e) => e.directory)) {
      try {
        if (!(await isStoredDirectory(entry.uri))) {
          await createDirectories([entry.uri], log);
        }
      } catch (err) {
        console.error(err);
        unknown.push(entry.uri);
      }
    }
    for (const entry of restoring.filter((e) => !e.bytes && !e.directory)) {
      try {
        const source = this.moves.get(entry.uri);
        const onlyCopy =
          source != null && (unknown.includes(source) || kept.includes(source));
        if (await findFileHandle(entry.uri)) {
          if (onlyCopy) {
            unknown.push(entry.uri);
            continue;
          }
          const removed = await removeFile(entry.uri);
          if (removed) {
            log.record(removed.uri, removed.local, removed.commit);
            effects.deleted.push(removed);
            effects.fileEvents.push({
              uri: entry.uri,
              type: FileChangeType.Deleted,
            });
          }
        }
      } catch (err) {
        console.error(err);
        unknown.push(entry.uri);
      }
    }
    try {
      await deleteEmptyDirectories([...this.directories], log);
    } catch (err) {
      console.error(err);
      unknown.push(...this.directories);
    }
    for (const uri of unknown) {
      log.reconcile(
        uri,
        this.directories.has(uri) || !!this.prior.get(uri)?.directory,
      );
    }
    for (const entry of restoring) {
      if (unknown.includes(entry.uri)) {
        continue;
      }
      if (entry.document) {
        State.documents.set(entry.uri, entry.document);
      } else {
        State.documents.delete(entry.uri);
      }
    }
    return { effects, unknown, kept };
  }
}

const applyChange = async (
  change: WorkspaceEditChange,
  log: CommitLog,
  effects: EditEffects,
  undo: UndoLog,
) => {
  const wrote = (result: WriteResult) => {
    undo.commit(result.file.uri, result.local);
    log.wrote(result);
    if (result.created) {
      effects.created.push(result);
    }
    effects.fileEvents.push({
      uri: result.file.uri,
      type: result.created ? FileChangeType.Created : FileChangeType.Changed,
    });
  };
  if ("textDocument" in change) {
    const [written] = await editTextFiles([change]);
    if (written) {
      wrote(written);
    } else {
      effects.fileEvents.push({
        uri: change.textDocument.uri,
        type: FileChangeType.Changed,
      });
    }
  } else if (change.kind === "create") {
    (await createFiles([change])).forEach(wrote);
  } else if (change.kind === "delete") {
    const [result] = await deleteFiles([change]);
    if (result) {
      undo.commit(result.uri, result.local);
      log.record(result.uri, result.local, result.commit);
      effects.deleted.push(result);
      effects.fileEvents.push({ uri: change.uri, type: FileChangeType.Deleted });
    }
  } else if (change.kind === "rename") {
    const [outcome] = await renameFiles([change]);
    if (outcome?.write) {
      undo.commit(outcome.write.file.uri, outcome.write.local);
      log.wrote(outcome.write);
    }
    if (outcome?.deleted) {
      undo.commit(outcome.deleted.uri, outcome.deleted.local);
      log.record(outcome.deleted.uri, outcome.deleted.local, outcome.deleted.commit);
      effects.renamed.push(outcome);
      effects.fileEvents.push({ uri: change.oldUri, type: FileChangeType.Deleted });
    }
    if (outcome?.write) {
      effects.fileEvents.push({ uri: change.newUri, type: FileChangeType.Created });
    }
    if (outcome?.error != null) {
      throw outcome.error;
    }
  }
};

const applyWorkspaceEdit = async (
  edit: ApplyWorkspaceEditMessage.Request["params"]["edit"],
  log: CommitLog,
) => {
  const changes: WorkspaceEditChange[] =
    edit.documentChanges ??
    Object.entries(edit.changes ?? {}).map(([uri, edits]) => ({
      textDocument: { uri, version: State.files.get(uri)?.version ?? 0 },
      edits,
    }));
  const undo = new UndoLog();
  const effects = noEffects();
  for (const [index, change] of changes.entries()) {
    try {
      await undo.record(change);
      await applyChange(change, log, effects, undo);
    } catch (err: any) {
      console.error(err, err?.stack);
      const reason = err?.message ?? String(err);
      const { effects, unknown, kept } = await undo.restore(log);
      const partial = [
        ...(unknown.length > 0
          ? [`restoring the earlier changes failed, so these may be left changed: ${unknown.join(", ")}`]
          : []),
        ...(kept.length > 0
          ? [`these were saved again while the edit ran and were kept as saved: ${kept.join(", ")}`]
          : []),
      ];
      return {
        effects,
        failure: {
          change: index,
          reason:
            partial.length === 0
              ? reason
              : `${reason}; the edit was partly applied: ${partial.join("; ")}`,
        },
      };
    }
  }
  return { effects, failure: undefined };
};

const loadConfiguration = (settings: any) => {
  const scriptFiles = settings?.scriptFiles;
  if (scriptFiles) {
    State.scriptFilePattern = globToRegex(scriptFiles);
  }
  const imageFiles = settings?.imageFiles;
  if (imageFiles) {
    State.imageFilePattern = globToRegex(imageFiles);
  }
  const audioFiles = settings?.audioFiles;
  if (audioFiles) {
    State.audioFilePattern = globToRegex(audioFiles);
  }
  const videoFiles = settings?.videoFiles;
  if (videoFiles) {
    State.videoFilePattern = globToRegex(videoFiles);
  }
  const fontFiles = settings?.fontFiles;
  if (fontFiles) {
    State.fontFilePattern = globToRegex(fontFiles);
  }
};

const readDirectoryFiles = async (directoryUri: string) => {
  const root = await navigator.storage.getDirectory();
  const directoryPath = getPathFromUri(directoryUri);
  const directoryHandle = await findDirectory(root, directoryPath);
  const floor = await readFloor(root);
  const listedPaths = directoryHandle
    ? await getAllFilePathsRecursive(directoryHandle, directoryPath, [TRASH_DIR])
    : [];
  const listed = new Set(listedPaths.map(getUriFromPath));
  if (floor) {
    observeCommit(floor);
    raiseDirectoryFloor(directoryUri, floor);
  }
  const unlisted = [...State.files.keys()].filter(
    (uri) =>
      uri.startsWith(`${directoryUri}/`) &&
      !uri.includes(`/${TRASH_DIR}/`) &&
      !listed.has(uri),
  );
  const files = await Promise.all(
    [...listed].map(async (uri) => {
      const stale =
        floor != null &&
        isSupersededCommit(State.commits.get(uri) ?? NO_COMMIT, floor);
      if (!State.files.get(uri) || stale) {
        try {
          if (needsTextAtEnumeration(uri)) {
            await readFile(uri);
          } else {
            await statFile(uri);
          }
        } catch (err) {
          if (!isMissingEntry(err)) {
            throw err;
          }
          unlisted.push(uri);
          return undefined;
        }
      }
      return State.files.get(uri);
    }),
  );
  const settled = await settlePaths(
    unlisted.map((uri) => ({ uri, directory: false })),
  );
  return [...files, ...settled.map((e) => e.file)].filter(
    (file): file is FileData => file != null,
  );
};

const readFloor = async (
  root: FileSystemDirectoryHandle,
): Promise<FileCommit | undefined> => {
  const sequence = await readCommitSequence(root);
  return sequence == null ? undefined : { sequence, writer: SETTLED_WRITER };
};

const announceStoredChange = (
  uri: string,
  before: FileData | undefined,
  floor: FileCommit | undefined,
) => {
  const after = State.files.get(uri);
  if (
    !before ||
    !after ||
    (before.text ?? null) === (after.text ?? null) && before.size === after.size
  ) {
    return;
  }
  touch([uri]);
  postMessage(
    DidWriteFilesMessage.type.notification({
      files: [after],
      remote: true,
      commits: floor ? { [uri]: floor } : {},
    }),
  );
};

const adoptStoredBytes = (uri: string, floor: FileCommit | undefined) => {
  if (!floor) {
    return true;
  }
  observeCommit(floor);
  const held = heldCommit(uri);
  if (held && compareFileCommits(held, floor) > 0) {
    return false;
  }
  State.commits.set(uri, floor);
  return true;
};

const listDirectories = async (directoryUri: string) => {
  const root = await navigator.storage.getDirectory();
  const directoryPath = getPathFromUri(directoryUri);
  const directoryHandle = await findDirectory(root, directoryPath);
  if (!directoryHandle) {
    return [];
  }
  const paths = await getAllDirectoriesRecursive(
    directoryHandle,
    directoryPath,
    [TRASH_DIR],
  );
  return paths.map(getUriFromPath);
};

const createDirectories = async (uris: string[], log: CommitLog) => {
  const root = await navigator.storage.getDirectory();
  const created: string[] = [];
  for (const uri of new Set(uris)) {
    console.log(MAGENTA, "MKDIR", uri);
    const { commit, local } = await commitChange(
      uri,
      () => createDirectory(root, getPathFromUri(uri)),
      () => withAncestors(uri),
    );
    log.record(uri, local, commit, true);
    created.push(uri);
  }
  return created;
};

const deleteEmptyDirectories = async (uris: string[], log: CommitLog) => {
  const root = await navigator.storage.getDirectory();
  const paths = [...new Set(uris.map(getPathFromUri))].sort(
    (a, b) => b.split("/").length - a.split("/").length,
  );
  const removed: string[] = [];
  for (const path of paths) {
    console.log(MAGENTA, "RMDIR", path);
    const { result, commit, local } = await commitChange(
      getUriFromPath(path),
      () => deleteEmptyDirectory(root, path),
      (paths) => paths.map(getUriFromPath),
    );
    for (const removedPath of result) {
      log.record(getUriFromPath(removedPath), local, commit, true);
      if (commit) {
        removeDirectoryTree(getUriFromPath(removedPath), commit);
      }
    }
    removed.push(...result);
  }
  return removed.map(getUriFromPath);
};

const needsTextAtEnumeration = (fileUri: string) => {
  const ext = getFileExtension(fileUri);
  const type = getFileType(fileUri);
  return type === "script" || type === "text" || ext === "svg" || ext === "url";
};

const storedFileHandle = async (uri: string) => {
  const handle = await findFileHandle(uri);
  if (!handle) {
    throw new DOMException(`${uri} was not found`, "NotFoundError");
  }
  return handle;
};

const statFile = (fileUri: string) =>
  withCommitLock(fileUri, async () => {
    const fileHandle = await storedFileHandle(fileUri);
    const fileRef = await fileHandle.getFile();
    const floor = await readFloor(await navigator.storage.getDirectory());
    if (adoptStoredBytes(fileUri, floor)) {
      const before = State.files.get(fileUri);
      updateFileMetaCache(fileUri, fileRef.size, fileRef.lastModified);
      announceStoredChange(fileUri, before, floor);
    }
  });

const readFile = (fileUri: string) =>
  withCommitLock(fileUri, async () => {
    const fileHandle = await storedFileHandle(fileUri);
    const fileRef = await fileHandle.getFile();
    const buffer = await fileRef.arrayBuffer();
    const floor = await readFloor(await navigator.storage.getDirectory());
    if (adoptStoredBytes(fileUri, floor)) {
      const before = State.files.get(fileUri);
      updateFileCache(fileUri, buffer, false, undefined, fileRef.lastModified);
      await enrichUrlAssetType(fileUri);
      announceStoredChange(fileUri, before, floor);
    }
    return buffer;
  });

const zipFiles = async (
  files: { uri: string; path?: string }[],
  directories: string[] = [],
  entries: { path: string; data: ArrayBuffer }[] = [],
) => {
  const refs = await Promise.all(
    files.map(async ({ uri, path }) => {
      const fileHandle = await storedFileHandle(uri);
      const fileRef = await fileHandle.getFile();
      const data = await fileRef.arrayBuffer();
      return { path: path || fileRef.name, data };
    }),
  );
  const zipped = zipSync(buildZippable([...refs, ...entries], directories), {
    level: 0,
  });
  console.log(
    MAGENTA,
    "ZIPPED",
    `${refs.length} files (${formatBytes(zipped.buffer.byteLength)})`,
  );
  return zipped.buffer;
};

const unzipFiles = async (data: ArrayBuffer) => {
  const unzipped = unzipSync(new Uint8Array(data));
  const files = parseUnzipEntries(unzipped);
  console.log(MAGENTA, "UNZIPPED", `${files.length} files`);
  return files;
};

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes <= 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const bytesToDataUrl = async (bytes: Uint8Array, mimeType: string) => {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([bytes as BlobPart], { type: mimeType }));
  });
};

const dataUrlToBytes = async (dataUrl: string) => {
  const res = await fetch(dataUrl);
  const arrayBuffer = await res.arrayBuffer();
  return new Uint8Array(arrayBuffer);
};

const editTextFiles = async (textDocumentEdits: TextDocumentEdit[]) => {
  const result = await Promise.all(
    textDocumentEdits.map(async (textDocumentEdit) => {
      const td = textDocumentEdit.textDocument;
      const changes = textDocumentEdit.edits.filter(
        (e): e is TextEdit | AnnotatedTextEdit => "newText" in e,
      );
      if (changes.length === 0) {
        return null;
      }
      let syncedDocument = State.documents.get(td.uri);
      const latestText = (
        pendingText(td.uri) ?? State.files.get(td.uri)?.text
      )?.replace(NEWLINE_REGEX, "\n");
      if (!syncedDocument && latestText == null) {
        throw new Error(`File does not exist: ${td.uri}`);
      }
      if (
        !syncedDocument ||
        (latestText != null && latestText !== syncedDocument.getText())
      ) {
        syncedDocument = TextDocument.create(
          td.uri,
          languageIdOf(td.uri),
          syncedDocument?.version ?? State.files.get(td.uri)?.version ?? 0,
          latestText ?? "",
        );
        State.documents.set(td.uri, syncedDocument);
      }
      const afterVersion = syncedDocument.version + 1;
      const edited = TextDocument.applyEdits(
        syncedDocument,
        changes.map((c) => ({
          range: c.range,
          newText: c.newText.replace(NEWLINE_REGEX, "\n"),
        })),
      );
      syncedDocument = TextDocument.update(
        syncedDocument,
        [{ text: edited }],
        afterVersion,
      );
      const content = syncedDocument.getText();
      State.documents.set(td.uri, syncedDocument);
      const encoder = new TextEncoder();
      const encodedText = encoder.encode(content);
      const buffer = new DataView(encodedText.buffer);
      return enqueueWrite(td.uri, afterVersion, buffer);
    }),
  );
  return result;
};

const pendingText = (fileUri: string) => {
  const entry = State.writeQueue.get(fileUri);
  const batch = entry?.batches[entry.batches.length - 1] ?? entry?.writing;
  return batch ? new TextDecoder().decode(batch.buffer) : undefined;
};

const writeQueueEntry = (fileUri: string) => {
  let entry = State.writeQueue.get(fileUri);
  if (!entry) {
    entry = {
      batches: [],
      handler: debounce((uri: string) => {
        State.writeQueue.get(uri)?.batches.forEach((b) => {
          b.due = true;
        });
        void write(uri);
      }, WRITE_DEBOUNCE_DELAY),
    };
    State.writeQueue.set(fileUri, entry);
  }
  return entry;
};

const enqueueWrite = async (
  fileUri: string,
  version: number,
  buffer: DataView | Uint8Array,
  immediate = false,
  origin?: string,
) => {
  if (/\.svg$/i.test(fileUri)) {
    const source = new TextDecoder().decode(buffer);
    const normalized = normalizeSVGAttributeNames(source);
    if (normalized !== source) buffer = new TextEncoder().encode(normalized);
  }
  return new Promise<WriteResult>((resolve, reject) => {
    const entry = writeQueueEntry(fileUri);
    const last = entry.batches[entry.batches.length - 1];
    if (last && origin != null && last.origin === origin) {
      last.buffer = buffer;
      last.version = version;
      last.due ||= immediate;
      last.listeners.push({ resolve, reject });
    } else {
      if (last) {
        last.due = true;
      }
      let settle!: () => void;
      const settled = new Promise<void>((done) => {
        settle = done;
      });
      entry.batches.push({
        buffer,
        version,
        origin,
        due: immediate,
        settled,
        settle,
        listeners: [{ resolve, reject }],
      });
    }
    if (entry.batches[0]?.due) {
      void write(fileUri);
    }
    if (!entry.batches[entry.batches.length - 1]?.due) {
      entry.handler(fileUri);
    }
  });
};

let thumbnailChain: Promise<void> = Promise.resolve();

const enqueueThumbnail = (fileUri: string): Promise<void> => {
  if (!THUMBNAILS_SUPPORTED || !RASTER_IMAGE_REGEX.test(fileUri)) {
    return Promise.resolve();
  }
  thumbnailChain = thumbnailChain
    .then(() => generateThumbnail(fileUri))
    .catch(() => undefined);
  return thumbnailChain;
};

const generateThumbnail = async (fileUri: string): Promise<void> => {
  const root = await navigator.storage.getDirectory();
  const relativePath = getPathFromUri(fileUri);
  const directoryPath = getParentPath(relativePath);
  const filename = getFileName(relativePath);
  let file: File;
  try {
    const directoryHandle = await findDirectory(root, directoryPath);
    if (!directoryHandle) {
      return;
    }
    const fileHandle = await directoryHandle.getFileHandle(filename, {
      create: false,
    });
    file = await fileHandle.getFile();
  } catch {
    return;
  }
  const cache = await caches.open(THUMB_CACHE_NAME);
  await getOrCreateThumbnail(
    cache,
    relativePath,
    file,
    String(THUMB_WIDTH),
    RESOURCE_PROTOCOL,
  );
};

const writeFiles = async (
  files: { uri: string; version: number; data: ArrayBuffer }[],
  origin?: string,
) => {
  const result = await Promise.all(
    files.map(async (file) => {
      const buffer = new DataView(file.data);
      return enqueueWrite(file.uri, file.version, buffer, false, origin);
    }),
  );
  return result;
};

const writeToDisk = async (fileUri: string, buffer: DataView | Uint8Array) => {
  const relativePath = getPathFromUri(fileUri);
  const directoryPath = getParentPath(relativePath);
  const filename = getFileName(relativePath);
  let directoryHandle: FileSystemDirectoryHandle | undefined;
  let syncAccessHandle: FileSystemSyncAccessHandle | undefined;
  let previous: Uint8Array | undefined;
  let created = false;
  try {
    const root = await navigator.storage.getDirectory();
    directoryHandle = await getDirectoryHandleFromPath(root, directoryPath);
    let missing = false;
    try {
      await directoryHandle.getFileHandle(filename, { create: false });
    } catch (err) {
      if ((err as DOMException).name !== "NotFoundError") throw err;
      missing = true;
    }
    const fileHandle = await directoryHandle.getFileHandle(filename, {
      create: true,
    });
    created = missing;
    syncAccessHandle = await fileHandle.createSyncAccessHandle();
    if (!missing) {
      const backup = new Uint8Array(syncAccessHandle.getSize());
      const read = syncAccessHandle.read(backup, { at: 0 });
      if (read !== backup.byteLength) {
        throw new Error(`Read ${read} of ${backup.byteLength} bytes before overwriting`);
      }
      previous = backup;
    }
    syncAccessHandle.truncate(0);
    const written = syncAccessHandle.write(buffer, { at: 0 });
    if (written !== buffer.byteLength) throw new Error(`Wrote ${written} of ${buffer.byteLength} bytes`);
    syncAccessHandle.flush();
    syncAccessHandle.close();
    syncAccessHandle = undefined;
    return created;
  } catch (err: any) {
    let failure = err;
    try {
      if (syncAccessHandle && previous) {
        syncAccessHandle.truncate(0);
        const restored = syncAccessHandle.write(previous, { at: 0 });
        if (restored !== previous.byteLength) {
          throw new Error(`Restored ${restored} of ${previous.byteLength} bytes`);
        }
        syncAccessHandle.flush();
      }
    } catch (restoreError) {
      failure = new Error(
        `${String(err)}; restoring the previous bytes failed: ${String(restoreError)}`,
      );
    }
    try {
      syncAccessHandle?.close();
      if (created) await directoryHandle?.removeEntry(filename);
    } catch (cleanupError) {
      failure = new Error(`${String(failure)}; cleanup failed: ${String(cleanupError)}`);
    }
    throw failure;
  }
};

const write = async (fileUri: string) => {
  const entry = State.writeQueue.get(fileUri);
  const batch = entry?.batches[0];
  if (!entry || entry.writing || !batch?.due) return;
  entry.batches.shift();
  entry.writing = batch;
  console.log(MAGENTA, "WRITE", fileUri);
  const { buffer, version, origin, listeners } = batch;
  try {
    const { result: created, commit, local } = await commitChange(
      fileUri,
      () => writeToDisk(fileUri, buffer),
      () => withAncestors(fileUri),
    );
    const arrayBuffer = buffer.buffer as ArrayBuffer;
    const current = isLocalLatest(fileUri, local!);
    const file = current
      ? updateFileCache(fileUri, arrayBuffer, true, version, Date.now())
      : describeFile(fileUri, arrayBuffer, true, version, Date.now());
    if (current) {
      await enrichUrlAssetType(fileUri);
    }
    const committedFile = isLocalLatest(fileUri, local!)
      ? (State.files.get(fileUri) ?? file)
      : file;
    await enqueueThumbnail(fileUri);
    listeners.forEach((l) => {
      l.resolve({ file: committedFile, created, local: local!, commit, origin });
    });
  } catch (err: any) {
    listeners.forEach((listener) => listener.reject(err));
  } finally {
    entry.writing = undefined;
    batch.settle();
    if (entry.batches[0]?.due) void write(fileUri);
  }
};

const drainWrites = async (fileUri: string) => {
  const entry = State.writeQueue.get(fileUri);
  if (!entry) {
    return;
  }
  const pending = [
    ...(entry.writing ? [entry.writing] : []),
    ...entry.batches,
  ];
  entry.batches.forEach((b) => {
    b.due = true;
  });
  void write(fileUri);
  await Promise.all(pending.map((b) => b.settled));
};

const createFiles = async (files: (FileCreate & { data?: ArrayBuffer })[]) => {
  const result = await Promise.all(
    files.map(async (file) => {
      const buffer = new DataView(file.data ?? new ArrayBuffer());
      return enqueueWrite(file.uri, 0, buffer, true);
    }),
  );
  return result;
};

const moveFilesToTrash = async (
  files: { uri: string }[],
  folders: { uri: string }[] = [],
) => {
  const deleted: DeleteResult[] = [];
  const first = files[0] ?? folders[0];
  if (!first) {
    return deleted;
  }
  const seen = new Set<string>();
  const uniqueFiles = files.filter((f) =>
    seen.has(f.uri) ? false : (seen.add(f.uri), true),
  );
  const projectId = getPathFromUri(first.uri).split("/")[0]!;
  const folderPaths = [
    ...new Set(
      folders.map((f) => getPathFromUri(f.uri).slice(projectId.length + 1)),
    ),
  ].filter(Boolean);
  if (uniqueFiles.length === 0 && folderPaths.length === 0) {
    return deleted;
  }
  const deletedAt = Date.now();
  const batchId = `${deletedAt}__${crypto.randomUUID()}`;
  const trashPrefix = `${projectId}/${TRASH_DIR}/${batchId}`;
  const entries: { relPath: string; originalUri: string; type: string }[] = [];
  for (const file of uniqueFiles) {
    try {
      const relPath = getPathFromUri(file.uri).slice(projectId.length + 1);
      const existing = State.files.get(file.uri);
      const type = existing?.type ?? getFileType(file.uri);
      const trashUri = getUriFromPath(`${trashPrefix}/${relPath}`);
      deleted.push(await copyThenRemove(file.uri, trashUri));
      entries.push({ relPath, originalUri: file.uri, type });
    } catch (e) {
      console.error(`moveFilesToTrash: skipping ${file.uri}`, e);
    }
  }
  const manifest = JSON.stringify(
    folderPaths.length
      ? { deletedAt, entries, folders: folderPaths }
      : { deletedAt, entries },
  );
  const manifestUri = getUriFromPath(`${trashPrefix}/${TRASH_MANIFEST}`);
  await createFiles([
    {
      uri: manifestUri,
      data: new TextEncoder().encode(manifest).buffer as ArrayBuffer,
    },
  ]);
  return deleted;
};

const getTrashDirHandle = async (projectId: string) =>
  findDirectory(
    await navigator.storage.getDirectory(),
    `${projectId}/${TRASH_DIR}`,
  );

const evictTrashCache = (uriPrefix: string) => {
  for (const uri of [...State.files.keys()]) {
    if (uri.startsWith(uriPrefix)) {
      State.files.delete(uri);
    }
  }
};

const listTrash = async (projectId: string): Promise<TrashBatch[]> => {
  const trash = await getTrashDirHandle(projectId);
  const batches: TrashBatch[] = [];
  if (!trash) {
    return batches;
  }
  // @ts-ignore - values() exists
  for await (const handle of trash.values()) {
    if (handle.kind !== "directory") {
      continue;
    }
    try {
      const dir = handle as FileSystemDirectoryHandle;
      const file = await (await dir.getFileHandle(TRASH_MANIFEST)).getFile();
      const m = JSON.parse(await file.text()) as Omit<TrashBatch, "batchId">;
      batches.push({
        batchId: handle.name,
        deletedAt: m.deletedAt,
        entries: m.entries,
        ...(m.folders?.length ? { folders: m.folders } : {}),
      });
    } catch {
    }
  }
  batches.sort((a, b) => b.deletedAt - a.deletedAt);
  return batches;
};

const removeTrashBatch = async (projectId: string, batchId: string) => {
  evictTrashCache(getUriFromPath(`${projectId}/${TRASH_DIR}/${batchId}/`));
  const trash = await getTrashDirHandle(projectId);
  await trash?.removeEntry(batchId, { recursive: true }).catch(() => {});
};

const fileExists = async (uri: string): Promise<boolean> =>
  (await findFileHandle(uri)) != null;

const entryExists = async (uri: string): Promise<boolean> =>
  (await fileExists(uri)) || (await isStoredDirectory(uri));

const deconflictRestoreUri = async (uri: string): Promise<string> => {
  const path = getPathFromUri(uri);
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const file = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = file.lastIndexOf(".");
  const base = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : "";
  for (let i = 1; ; i++) {
    const suffix = i === 1 ? " (restored)" : ` (restored ${i})`;
    const candidate = getUriFromPath(`${dir}${base}${suffix}${ext}`);
    if (!(await entryExists(candidate))) {
      return candidate;
    }
  }
};

const restoreTrashBatch = async (
  projectId: string,
  batchId: string,
  folderLog: CommitLog,
): Promise<{ written: WriteResult[]; folders: string[]; restoredFolders: string[] }> => {
  const trash = await getTrashDirHandle(projectId);
  if (!trash) {
    return { written: [], folders: [], restoredFolders: [] };
  }
  let batchHandle: FileSystemDirectoryHandle;
  try {
    batchHandle = await trash.getDirectoryHandle(batchId);
  } catch {
    return { written: [], folders: [], restoredFolders: [] };
  }
  const manifestFile = await (
    await batchHandle.getFileHandle(TRASH_MANIFEST)
  ).getFile();
  const m = JSON.parse(await manifestFile.text()) as {
    entries: { relPath: string; originalUri: string }[];
    folders?: string[];
  };
  const recorded = m.folders ?? [];
  const directories = new Map<string, string>();
  const claimed = new Set<string>();
  const sources = new Set(
    [...recorded, ...m.entries.map((e) => e.relPath)].flatMap((p) => {
      const parts = p.split("/");
      return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
    }),
  );
  const restoredDirectory = async (path: string): Promise<string> => {
    if (!path) {
      return "";
    }
    const known = directories.get(path);
    if (known !== undefined) {
      return known;
    }
    const slash = path.lastIndexOf("/");
    const parent = await restoredDirectory(slash >= 0 ? path.slice(0, slash) : "");
    const name = slash >= 0 ? path.slice(slash + 1) : path;
    const at = (leaf: string) => (parent ? `${parent}/${leaf}` : leaf);
    const taken = async (candidate: string) =>
      claimed.has(candidate) ||
      (candidate !== path && sources.has(candidate)) ||
      (await fileExists(getUriFromPath(`${projectId}/${candidate}`)));
    let target = at(name);
    for (let i = 1; await taken(target); i++) {
      target = at(`${name}${i === 1 ? " (restored)" : ` (restored ${i})`}`);
    }
    directories.set(path, target);
    claimed.add(target);
    return target;
  };
  const restoredPath = async (relPath: string) => {
    const slash = relPath.lastIndexOf("/");
    if (slash < 0) {
      return relPath;
    }
    return `${await restoredDirectory(relPath.slice(0, slash))}/${relPath.slice(slash + 1)}`;
  };
  const restoredFolders: string[] = [];
  for (const folder of recorded) {
    restoredFolders.push(await restoredDirectory(folder));
  }
  const folders = await createDirectories(
    restoredFolders.map((f) => getUriFromPath(`${projectId}/${f}`)),
    folderLog,
  );
  const restored: WriteResult[] = [];
  const trashPrefix = `${projectId}/${TRASH_DIR}/${batchId}`;
  for (const entry of m.entries) {
    const data = await readFile(getUriFromPath(`${trashPrefix}/${entry.relPath}`));
    const originalUri = getUriFromPath(`${projectId}/${await restoredPath(entry.relPath)}`);
    const targetUri = (await entryExists(originalUri))
      ? await deconflictRestoreUri(originalUri)
      : originalUri;
    const [created] = await createFiles([{ uri: targetUri, data }]);
    if (created) {
      restored.push(created);
    }
  }
  await removeTrashBatch(projectId, batchId);
  return { written: restored, folders, restoredFolders };
};

const emptyTrash = async (projectId: string) => {
  evictTrashCache(getUriFromPath(`${projectId}/${TRASH_DIR}/`));
  const proj = await findDirectory(
    await navigator.storage.getDirectory(),
    projectId,
  );
  await proj?.removeEntry(TRASH_DIR, { recursive: true }).catch(() => {});
};

const purgeExpiredTrash = async (projectId: string, retentionMs: number) => {
  const trash = await getTrashDirHandle(projectId);
  if (!trash) {
    return;
  }
  const cutoff = Date.now() - retentionMs;
  const expired: string[] = [];
  // @ts-ignore - values() exists
  for await (const handle of trash.values()) {
    if (handle.kind !== "directory") {
      continue;
    }
    const deletedAt = Number(handle.name.split("__")[0]);
    if (Number.isFinite(deletedAt) && deletedAt < cutoff) {
      expired.push(handle.name);
    }
  }
  for (const batchId of expired) {
    await removeTrashBatch(projectId, batchId);
  }
};

const evictFile = (uri: string) => {
  const existingFile = State.files.get(uri);
  if (existingFile) {
    URL.revokeObjectURL(existingFile.src);
    State.files.delete(uri);
  }
  State.documents.delete(uri);
};

const removeFile = async (
  uri: string,
  unchangedSince?: ArrayBuffer,
): Promise<DeleteResult | undefined> => {
  console.log(MAGENTA, "DELETE", uri);
  const root = await navigator.storage.getDirectory();
  const relativePath = getPathFromUri(uri);
  const { result: existingFile, commit, local } = await commitChange(
    uri,
    async () => {
      const directoryHandle = await findDirectory(
        root,
        getParentPath(relativePath),
      );
      if (!directoryHandle) {
        throw new DOMException(`${uri} was not found`, "NotFoundError");
      }
      if (unchangedSince) {
        const stored = await (
          await (
            await directoryHandle.getFileHandle(getFileName(relativePath))
          ).getFile()
        ).arrayBuffer();
        if (!sameBytes(stored, unchangedSince)) {
          return null;
        }
      }
      await directoryHandle.removeEntry(getFileName(relativePath));
      return State.files.get(uri);
    },
    (removed) => (removed === null ? [] : [uri]),
  );
  if (existingFile === null) {
    return undefined;
  }
  if (isLocalLatest(uri, local!)) {
    evictFile(uri);
  }
  return { uri, file: existingFile, local: local!, commit };
};

const sameBytes = (a: ArrayBuffer, b: ArrayBuffer) => {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  return left.every((byte, index) => byte === right[index]);
};

const deleteFiles = async (
  files: { uri: string }[],
): Promise<DeleteResult[]> =>
  Promise.all(files.map(async (file) => (await removeFile(file.uri))!));

const MOVE_ATTEMPTS = 3;

const moveFile = async (move: RenameOutcome) => {
  console.log(MAGENTA, "RENAME", move.oldUri, move.newUri);
  if (move.oldUri === move.newUri) {
    if (!State.files.get(move.oldUri)) {
      await readFile(move.oldUri);
    }
    move.file = State.files.get(move.oldUri);
    return;
  }
  if (!move.options?.overwrite) {
    await drainWrites(move.newUri);
    if (await findFileHandle(move.newUri)) {
      if (move.options?.ignoreIfExists) {
        return;
      }
      throw new Error(
        `Cannot rename ${move.oldUri} to ${move.newUri}: ${move.newUri} already exists`,
      );
    }
  }
  move.deleted = await copyThenRemove(move.oldUri, move.newUri, (write) => {
    move.write = write;
    move.file = write?.file;
  });
};

const copyThenRemove = async (
  sourceUri: string,
  destinationUri: string,
  copied?: (write: WriteResult | undefined) => void,
) => {
  for (let attempt = 1; attempt <= MOVE_ATTEMPTS; attempt += 1) {
    await drainWrites(sourceUri);
    const data = await readFile(sourceUri);
    const [write] = await createFiles([{ uri: destinationUri, data }]);
    copied?.(write);
    const deleted = await removeFile(sourceUri, data);
    if (deleted) {
      return deleted;
    }
  }
  throw new Error(
    `Cannot move ${sourceUri} to ${destinationUri}: ${sourceUri} kept changing during the move`,
  );
};

const renameFiles = async (
  files: { oldUri: string; newUri: string; options?: RenameFileOptions }[],
): Promise<RenameOutcome[]> => {
  const outcomes: RenameOutcome[] = files.map((f) => ({
    oldUri: f.oldUri,
    newUri: f.newUri,
    options: f.options,
  }));
  const targets = new Set<string>();
  for (const o of outcomes) {
    if (targets.has(o.newUri)) {
      o.error = new Error(`More than one file in this rename targets ${o.newUri}`);
    }
    targets.add(o.newUri);
  }
  const occupied = new Set(
    outcomes.filter((o) => o.error != null).map((o) => o.oldUri),
  );
  let pending = outcomes.filter((o) => o.error == null);
  while (pending.length > 0) {
    let blocked = true;
    while (blocked) {
      blocked = false;
      for (const o of pending) {
        if (o.error == null && o.oldUri !== o.newUri && occupied.has(o.newUri)) {
          o.error = new Error(
            `Cannot rename ${o.oldUri} to ${o.newUri}: ${o.newUri} could not be moved away`,
          );
          occupied.add(o.oldUri);
          blocked = true;
        }
      }
      pending = pending.filter((o) => o.error == null);
    }
    const sources = new Set(pending.map((o) => o.oldUri));
    const ready = pending.filter(
      (o) => o.oldUri === o.newUri || !sources.has(o.newUri),
    );
    if (ready.length === 0) {
      for (const o of pending) {
        o.error = new Error(
          `Cannot rename ${o.oldUri} to ${o.newUri}: the rename moves files in a cycle`,
        );
      }
      break;
    }
    await Promise.all(
      ready.map(async (o) => {
        try {
          await moveFile(o);
        } catch (err) {
          o.error = err;
        }
      }),
    );
    for (const o of ready) {
      if (o.error != null && !o.deleted) {
        occupied.add(o.oldUri);
      }
    }
    pending = pending.filter((o) => !ready.includes(o));
  }
  return outcomes;
};

const getFileType = (uri: string): string => {
  if (State.scriptFilePattern?.test(uri)) {
    return "script";
  }
  if (State.imageFilePattern?.test(uri)) {
    return "image";
  }
  if (State.audioFilePattern?.test(uri)) {
    return "audio";
  }
  if (State.videoFilePattern?.test(uri)) {
    return "video";
  }
  if (State.fontFilePattern?.test(uri)) {
    return "font";
  }
  return "text";
};

const getMimeType = (type: string, ext: string) => {
  const encoding = type === "text" ? "plain" : ext === "svg" ? "svg+xml" : ext;
  return `${type}/${encoding}`;
};

const headTypeCache = new Map<string, string>();

const categoryFromContentType = (contentType: string): string => {
  const t = (contentType.split(";")[0] || "").trim().toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("font/") || t.includes("font")) return "font";
  if (t.startsWith("text/")) return "text";
  return "";
};

const resolveUrlTypeViaHead = async (url: string): Promise<string> => {
  const cached = headTypeCache.get(url);
  if (cached !== undefined) {
    return cached;
  }
  let category = "";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timer);
    category = categoryFromContentType(res.headers.get("content-type") || "");
  } catch {
    category = "";
  }
  headTypeCache.set(url, category);
  return category;
};

const enrichUrlAssetType = async (uri: string): Promise<void> => {
  if (getFileExtension(uri) !== "url") {
    return;
  }
  const file = State.files.get(uri);
  const url = (file?.text || "").trim();
  if (!file || !url) {
    return;
  }
  const urlPath = url.split(/[?#]/)[0] || "";
  if (getFileExtension(urlPath)) {
    return;
  }
  const category = await resolveUrlTypeViaHead(url);
  if (category && State.files.get(uri) === file) {
    file.type = category;
    State.files.set(uri, file);
  }
};

const updateFileMetaCache = (
  uri: string,
  size: number,
  modified?: number,
  version?: number,
) => {
  const existingFile = State.files.get(uri);
  const name = getName(uri);
  const ext = getFileExtension(uri);
  const type = getFileType(uri);
  const resolvedModified = modified ?? existingFile?.modified ?? Date.now();
  let src = existingFile?.src || "";
  if (name && !src) {
    src = getSrcFromUri(uri) + `?v=${resolvedModified}-${size}`;
  }
  const file = {
    uri,
    name,
    ext,
    type,
    src,
    version: version ?? existingFile?.version ?? 0,
    size,
    modified: resolvedModified,
    languageId: type === "script" ? languageIdOf(uri) : null,
    text: existingFile?.text,
  };
  State.files.set(uri, file);
  return file;
};

const updateFileCache = (
  uri: string,
  buffer: ArrayBuffer,
  overwrite: boolean,
  version?: number,
  modified?: number,
) => {
  const file = describeFile(uri, buffer, overwrite, version, modified);
  State.files.set(uri, file);
  if (getFileExtension(uri) !== "url" && file.type === "script") {
    const content = (file.text ?? "").replace(NEWLINE_REGEX, "\n");
    if (!State.documents.get(uri)) {
      State.documents.set(
        uri,
        TextDocument.create(uri, languageIdOf(uri), version ?? 0, content),
      );
    }
  }
  return file;
};

const describeFile = (
  uri: string,
  buffer: ArrayBuffer,
  overwrite: boolean,
  version?: number,
  modified?: number,
): FileData => {
  const existingFile = State.files.get(uri);
  let src = existingFile?.src || "";
  const name = getName(uri);
  const ext = getFileExtension(uri);
  const type = getFileType(uri);

  if (ext === "url") {
    const url = new TextDecoder("utf-8").decode(buffer).trim();
    const urlPath = url.split(/[?#]/)[0] || "";
    const urlExt = getFileExtension(urlPath);
    const headType = !urlExt ? headTypeCache.get(url) : undefined;
    const file = {
      uri,
      name,
      ext: urlExt || ext,
      type: url ? headType || getFileType(urlPath) : type,
      src: url,
      version: version ?? existingFile?.version ?? 0,
      languageId: null,
      text: url,
      size: buffer.byteLength,
      modified: modified ?? existingFile?.modified ?? Date.now(),
    };
    return file;
  }

  const resolvedModified = modified ?? existingFile?.modified ?? Date.now();
  if (name) {
    if (!src || overwrite) {
      src = getSrcFromUri(uri) + `?v=${resolvedModified}-${buffer.byteLength}`;
    }
  }
  const text =
    type === "script" || type === "text" || ext === "svg"
      ? new TextDecoder("utf-8").decode(buffer)
      : undefined;

  const file = {
    uri,
    name,
    ext,
    type,
    src,
    version: version ?? existingFile?.version ?? 0,
    size: buffer.byteLength,
    modified: resolvedModified,
    languageId: type === "script" ? languageIdOf(uri) : null,
    text,
  };
  return file;
};
