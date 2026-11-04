import { ErrorCodes } from "@impower/spark-editor-protocol/src/enums/ErrorCodes";
import { normalizeSVGAttributeNames } from "@impower/sparkdown/src/attributes";
import { getOrCreateThumbnail } from "@impower/sparkdown/src/thumbnails/composeThumbnail";
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
import {
  TextDocument,
  TextDocumentContentChangeEvent,
} from "vscode-languageserver-textdocument";
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
} from "./utils/directories";
import { getAllFilesRecursive } from "./utils/getAllFilesRecursive";
import { getDirectoryHandleFromPath } from "./utils/getDirectoryHandleFromPath";
import { getFileExtension } from "./utils/getFileExtension";
import { getFileHandleFromUri } from "./utils/getFileHandleFromUri";
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
const RESOURCE_PROTOCOL = "/file:/";
const RASTER_IMAGE_REGEX = /[.](png|jpe?g|gif|webp)$/i;
const THUMBNAILS_SUPPORTED =
  typeof createImageBitmap === "function" &&
  typeof OffscreenCanvas === "function" &&
  typeof caches !== "undefined";

const globToRegex = (glob: string) => {
  return RegExp(
    glob
      .replace(/[.]/g, "[.]")
      .replace(/[*]/g, ".*")
      .replace(/[{](.*)[}]/g, (_match, $1) => `(${$1.replace(/[,]/g, "|")})`),
    "i",
  );
};

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
      isSupersededCommit(State.commits.get(uri) ?? NO_COMMIT, commit)
    ) {
      evictFile(uri);
      evicted.push(uri);
    }
  }
  if (evicted.length > 0) {
    touch(evicted);
  }
};

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

  record(uri: string, local: number | undefined, commit?: FileCommit) {
    if (local == null) {
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

  isCurrent(uri: string) {
    const latest = this.latest.get(uri);
    return !latest || isLocalLatest(uri, latest.local);
  }

  isLatest(uri: string, local: number | undefined) {
    const latest = this.latest.get(uri);
    return (
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
      const message = await reconcileRemoteMessage(event.data);
      if (message) {
        postMessage(message);
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
  touch(uris);
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
        (!commit ||
          isSupersededCommit(State.commits.get(cached) ?? NO_COMMIT, commit))
      ) {
        evictFile(cached);
        changed.push(cached);
      }
    }
  }
  touch(changed);
};

const settledFloor = async (): Promise<FileCommit | undefined> => {
  const floor = await readFloor(await navigator.storage.getDirectory());
  return floor && { sequence: floor.sequence, writer: SETTLED_WRITER };
};

const readStoredFile = (uri: string) =>
  withCommitLock(uri, async () => {
    const settled = await settledFloor();
    const handle = await findFileHandle(uri);
    if (!handle) {
      observeAbsent(uri, settled, false);
      return undefined;
    }
    const fileRef = await handle.getFile();
    const buffer = await fileRef.arrayBuffer();
    updateFileCache(uri, buffer, true, undefined, fileRef.lastModified);
    await enrichUrlAssetType(uri);
    observeExists(uri, settled);
    return State.files.get(uri);
  });

const evictUnlessStored = (uri: string) =>
  withCommitLock(uri, async () => {
    const settled = await settledFloor();
    if (await findFileHandle(uri)) {
      return false;
    }
    observeAbsent(uri, settled, false);
    return true;
  });

const isStoredFile = (uri: string) =>
  withCommitLock(uri, async () => (await findFileHandle(uri)) != null);

const confirmDirectory = (uri: string, exists: boolean) =>
  withCommitLock(uri, async () => {
    const settled = await settledFloor();
    if ((await isStoredDirectory(uri)) !== exists) {
      return false;
    }
    if (exists) {
      observeExists(uri, settled);
    } else {
      observeAbsent(uri, settled, true);
    }
    return true;
  });

const reconcileRemoteMessage = async (message: any) => {
  const commits: FileCommits | undefined = message?.params?.commits;
  if (commits) {
    Object.values(commits).forEach(observeCommit);
  }
  const fresh = (uri: string) => acceptCommit(uri, commits?.[uri]);
  const stamped = (uri: string) => commits?.[uri] != null;
  const keep = <T>(original: T[], kept: T[]) =>
    original.length === 0 || kept.length > 0;
  if (DidWriteFilesMessage.type.isNotification(message)) {
    const files: FileData[] = [];
    for (const file of message.params.files) {
      if (stamped(file.uri)) {
        if (fresh(file.uri)) {
          State.files.set(file.uri, { ...file });
          observeExists(file.uri, commits![file.uri]);
          files.push(file);
        }
      } else {
        const stored = await readStoredFile(file.uri);
        if (stored) {
          files.push(stored);
        }
      }
    }
    return keep(message.params.files, files)
      ? withParams(message, { files })
      : null;
  }
  if (DidCreateFilesMessage.type.isNotification(message)) {
    const files: { uri: string }[] = [];
    for (const file of message.params.files) {
      if (stamped(file.uri) ? fresh(file.uri) : await isStoredFile(file.uri)) {
        files.push(file);
      }
    }
    return keep(message.params.files, files)
      ? withParams(message, { files })
      : null;
  }
  if (DidDeleteFilesMessage.type.isNotification(message)) {
    const files: { uri: string }[] = [];
    for (const file of message.params.files) {
      if (stamped(file.uri)) {
        if (fresh(file.uri)) {
          observeAbsent(file.uri, commits![file.uri], false);
          files.push(file);
        }
      } else if (await evictUnlessStored(file.uri)) {
        files.push(file);
      }
    }
    return keep(message.params.files, files)
      ? withParams(message, { files })
      : null;
  }
  if (DidRenameFilesMessage.type.isNotification(message)) {
    const files: { oldUri: string; newUri: string }[] = [];
    for (const file of message.params.files) {
      if (stamped(file.oldUri)) {
        if (fresh(file.oldUri)) {
          observeAbsent(file.oldUri, commits![file.oldUri], false);
          files.push(file);
        }
      } else if (await evictUnlessStored(file.oldUri)) {
        files.push(file);
      }
    }
    return keep(message.params.files, files)
      ? withParams(message, { files })
      : null;
  }
  if (DidChangeWatchedFilesMessage.type.isNotification(message)) {
    const changes: FileEvent[] = [];
    for (const change of message.params.changes) {
      const current = stamped(change.uri)
        ? fresh(change.uri)
        : (await isStoredFile(change.uri)) !==
          (change.type === FileChangeType.Deleted);
      if (current) {
        changes.push(change);
      }
    }
    return keep(message.params.changes, changes)
      ? withParams(message, { changes })
      : null;
  }
  if (DidChangeDirectoriesMessage.type.isNotification(message)) {
    const created: string[] = [];
    for (const uri of message.params.created) {
      if (stamped(uri)) {
        if (fresh(uri)) {
          observeExists(uri, commits![uri]);
          created.push(uri);
        }
      } else if (await confirmDirectory(uri, true)) {
        created.push(uri);
      }
    }
    const deleted: string[] = [];
    for (const uri of message.params.deleted) {
      if (stamped(uri)) {
        if (fresh(uri)) {
          observeAbsent(uri, commits![uri], true);
          deleted.push(uri);
        }
      } else if (await confirmDirectory(uri, false)) {
        deleted.push(uri);
      }
    }
    return keep(
      [...message.params.created, ...message.params.deleted],
      [...created, ...deleted],
    )
      ? withParams(message, { created, deleted })
      : null;
  }
  return message;
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
    const { files, directories } = message.params;
    try {
      const buffer = (await zipFiles(files, directories)) as ArrayBuffer;
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
      const { files, mode } = message.params;
      let deleted: DeleteResult[];
      let failure: PromiseRejectedResult | undefined;
      if (mode === "trash") {
        deleted = await moveFilesToTrash(files);
      } else {
        const outcomes = await Promise.allSettled(files.map(file => deleteFiles([file])));
        deleted = outcomes.flatMap(outcome => outcome.status === "fulfilled" ? outcome.value : []);
        failure = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
      }
      const log = new CommitLog();
      deleted.forEach((d) => log.record(d.uri, d.local, d.commit));
      broadcastDeletes(log, deleted);
      broadcastWatchedChanges(log, deleted.map(d => ({ uri: d.uri, type: FileChangeType.Deleted })));
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
      if (action === "list") {
        result = { batches: await listTrash(projectId) };
      } else if (action === "restore" && batchId) {
        restored.push(...(await restoreTrashBatch(projectId, batchId)));
        result = { restored: restored.map((r) => r.file) };
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
    const { edit } = message.params;

    const log = new CommitLog();
    const fileEvents: FileEvent[] = [];
    const created: WriteResult[] = [];
    const deleted: DeleteResult[] = [];
    const renamed: RenameOutcome[] = [];
    const wrote = (result: WriteResult) => {
      log.wrote(result);
      if (result.created) {
        created.push(result);
      }
      fileEvents.push({
        uri: result.file.uri,
        type: result.created ? FileChangeType.Created : FileChangeType.Changed,
      });
    };

    let changeIndex = 0;
    let failure: { message: string } | undefined;

    try {
      if (edit.documentChanges) {
        for (const c of edit.documentChanges) {
          if ("kind" in c && !("textDocument" in c)) {
            if (c.kind === "create") {
              (await createFiles([c])).forEach(wrote);
            } else if (c.kind === "delete") {
              const [result] = await deleteFiles([c]);
              if (result) {
                log.record(result.uri, result.local, result.commit);
                deleted.push(result);
                fileEvents.push({ uri: c.uri, type: FileChangeType.Deleted });
              }
            } else if (c.kind === "rename") {
              const [outcome] = await renameFiles([c]);
              if (outcome?.write) {
                log.wrote(outcome.write);
              }
              if (outcome?.deleted) {
                log.record(outcome.deleted.uri, outcome.deleted.local, outcome.deleted.commit);
                renamed.push(outcome);
                fileEvents.push({
                  uri: c.oldUri,
                  type: FileChangeType.Deleted,
                });
              }
              if (outcome?.write) {
                fileEvents.push({
                  uri: c.newUri,
                  type: FileChangeType.Created,
                });
              }
              if (outcome?.error != null) {
                throw outcome.error;
              }
            }
          } else {
            const [written] = await editTextFiles([c]);
            if (written) {
              wrote(written);
            } else {
              fileEvents.push({
                uri: c.textDocument.uri,
                type: FileChangeType.Changed,
              });
            }
          }
          changeIndex++;
        }
      } else if (edit.changes) {
        for (const [uri, edits] of Object.entries(edit.changes)) {
          const beforeVersion = State.files.get(uri)?.version ?? 0;
          const [written] = await editTextFiles([
            { textDocument: { uri, version: beforeVersion }, edits },
          ]);
          if (written) {
            wrote(written);
          } else {
            fileEvents.push({ uri, type: FileChangeType.Changed });
          }
        }
      }
    } catch (err: any) {
      console.error(err, err.stack);
      failure = { message: err?.message ?? String(err) };
    }

    broadcastCreates(log, created);
    broadcastDeletes(log, deleted);
    broadcastRenames(log, renamed);
    broadcastWrites(log);
    broadcastWatchedChanges(log, fileEvents);

    respond(
      ApplyWorkspaceEditMessage.type.response(
        message.id,
        failure
          ? {
              applied: false,
              failureReason: failure.message,
              failedChange: changeIndex,
            }
          : { applied: true },
      ),
    );
  }
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
  const directoryHandle = await getDirectoryHandleFromPath(root, directoryPath);
  const floor = await readFloor(root);
  const directoryEntries = await getAllFilesRecursive(
    directoryHandle,
    directoryPath,
    [TRASH_DIR],
  );
  const listed = new Set(
    directoryEntries.map((entry) => getUriFromPath(entry.path)),
  );
  if (floor) {
    observeCommit(floor);
    raiseDirectoryFloor(directoryUri, floor);
    for (const uri of [...State.files.keys()]) {
      if (
        uri.startsWith(`${directoryUri}/`) &&
        !uri.includes(`/${TRASH_DIR}/`) &&
        !listed.has(uri) &&
        isSupersededCommit(State.commits.get(uri) ?? NO_COMMIT, floor)
      ) {
        evictFile(uri);
        touch([uri]);
        State.commits.set(uri, floor);
      }
    }
  }
  const files = await Promise.all(
    directoryEntries.map(async (entry) => {
      const uri = getUriFromPath(entry.path);
      const stale =
        floor != null &&
        isSupersededCommit(State.commits.get(uri) ?? NO_COMMIT, floor);
      if (!State.files.get(uri) || stale) {
        if (needsTextAtEnumeration(uri)) {
          await readFile(uri, { floor });
        } else {
          await statFile(uri, floor);
        }
      }
      return State.files.get(uri);
    }),
  );
  return files.filter((file): file is FileData => file != null);
};

const readFloor = async (
  root: FileSystemDirectoryHandle,
): Promise<FileCommit | undefined> => {
  const sequence = await readCommitSequence(root);
  return sequence == null ? undefined : { sequence, writer: "" };
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
  const directoryHandle = await getDirectoryHandleFromPath(root, directoryPath);
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
    log.record(uri, local, commit);
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
      log.record(getUriFromPath(removedPath), local, commit);
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

const statFile = async (fileUri: string, floor: FileCommit | undefined) => {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await getFileHandleFromUri(root, fileUri, false);
  const fileRef = await fileHandle.getFile();
  if (adoptStoredBytes(fileUri, floor)) {
    updateFileMetaCache(fileUri, fileRef.size, fileRef.lastModified);
  }
};

const readFile = async (
  fileUri: string,
  options?: { floor: FileCommit | undefined },
) => {
  const root = await navigator.storage.getDirectory();
  const floor = options ? options.floor : await readFloor(root);
  const fileHandle = await getFileHandleFromUri(root, fileUri, false);
  const fileRef = await fileHandle.getFile();
  const buffer = await fileRef.arrayBuffer();
  if (adoptStoredBytes(fileUri, floor)) {
    updateFileCache(fileUri, buffer, false, undefined, fileRef.lastModified);
    await enrichUrlAssetType(fileUri);
  }
  return buffer;
};

const zipFiles = async (
  files: { uri: string; path?: string }[],
  directories: string[] = [],
) => {
  const root = await navigator.storage.getDirectory();
  const refs = await Promise.all(
    files.map(async ({ uri, path }) => {
      const fileHandle = await getFileHandleFromUri(root, uri, false);
      const fileRef = await fileHandle.getFile();
      const data = await fileRef.arrayBuffer();
      return { path: path || fileRef.name, data };
    }),
  );
  const zipped = zipSync(buildZippable(refs, directories), {
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
      const beforeVersion = syncedDocument.version;
      const normalizedChanges: TextDocumentContentChangeEvent[] = [];
      for (const c of changes) {
        const normalizedText = c.newText.replace(NEWLINE_REGEX, "\n");
        if ("range" in c) {
          normalizedChanges.push({
            range: c.range,
            text: normalizedText,
          });
        } else {
          normalizedChanges.push({
            text: normalizedText,
          });
        }
      }
      const afterVersion = syncedDocument.version + 1;
      syncedDocument = TextDocument.update(
        syncedDocument,
        normalizedChanges,
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
    const directoryHandle = await getDirectoryHandleFromPath(
      root,
      directoryPath,
    );
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

const moveFilesToTrash = async (files: { uri: string }[]) => {
  const deleted: DeleteResult[] = [];
  if (files.length === 0) {
    return deleted;
  }
  const seen = new Set<string>();
  const uniqueFiles = files.filter((f) =>
    seen.has(f.uri) ? false : (seen.add(f.uri), true),
  );
  const projectId = getPathFromUri(uniqueFiles[0]!.uri).split("/")[0]!;
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
  const manifest = JSON.stringify({ deletedAt, entries });
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
  getDirectoryHandleFromPath(
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
  // @ts-ignore - values() exists
  for await (const handle of trash.values()) {
    if (handle.kind !== "directory") {
      continue;
    }
    try {
      const dir = handle as FileSystemDirectoryHandle;
      const file = await (await dir.getFileHandle(TRASH_MANIFEST)).getFile();
      const m = JSON.parse(await file.text()) as Omit<TrashBatch, "batchId">;
      batches.push({ batchId: handle.name, deletedAt: m.deletedAt, entries: m.entries });
    } catch {
    }
  }
  batches.sort((a, b) => b.deletedAt - a.deletedAt);
  return batches;
};

const removeTrashBatch = async (projectId: string, batchId: string) => {
  evictTrashCache(getUriFromPath(`${projectId}/${TRASH_DIR}/${batchId}/`));
  const trash = await getTrashDirHandle(projectId);
  await trash.removeEntry(batchId, { recursive: true }).catch(() => {});
};

const fileExists = async (uri: string): Promise<boolean> => {
  try {
    const root = await navigator.storage.getDirectory();
    await getFileHandleFromUri(root, uri, false);
    return true;
  } catch {
    return false;
  }
};

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
    if (!(await fileExists(candidate))) {
      return candidate;
    }
  }
};

const restoreTrashBatch = async (
  projectId: string,
  batchId: string,
): Promise<WriteResult[]> => {
  const trash = await getTrashDirHandle(projectId);
  let batchHandle: FileSystemDirectoryHandle;
  try {
    batchHandle = await trash.getDirectoryHandle(batchId);
  } catch {
    return [];
  }
  const manifestFile = await (
    await batchHandle.getFileHandle(TRASH_MANIFEST)
  ).getFile();
  const m = JSON.parse(await manifestFile.text()) as {
    entries: { relPath: string; originalUri: string }[];
  };
  const restored: WriteResult[] = [];
  const trashPrefix = `${projectId}/${TRASH_DIR}/${batchId}`;
  for (const entry of m.entries) {
    const data = await readFile(getUriFromPath(`${trashPrefix}/${entry.relPath}`));
    const targetUri = (await fileExists(entry.originalUri))
      ? await deconflictRestoreUri(entry.originalUri)
      : entry.originalUri;
    const [created] = await createFiles([{ uri: targetUri, data }]);
    if (created) {
      restored.push(created);
    }
  }
  await removeTrashBatch(projectId, batchId);
  return restored;
};

const emptyTrash = async (projectId: string) => {
  evictTrashCache(getUriFromPath(`${projectId}/${TRASH_DIR}/`));
  const proj = await getDirectoryHandleFromPath(
    await navigator.storage.getDirectory(),
    projectId,
  );
  await proj.removeEntry(TRASH_DIR, { recursive: true }).catch(() => {});
};

const purgeExpiredTrash = async (projectId: string, retentionMs: number) => {
  const trash = await getTrashDirHandle(projectId);
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
      const directoryHandle = await getDirectoryHandleFromPath(
        root,
        getParentPath(relativePath),
      );
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
  files: { oldUri: string; newUri: string }[],
): Promise<RenameOutcome[]> => {
  const outcomes: RenameOutcome[] = files.map((f) => ({
    oldUri: f.oldUri,
    newUri: f.newUri,
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
