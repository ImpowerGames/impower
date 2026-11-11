import { onProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { CompiledProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import type { SparkDiagnostic } from "@impower/sparkdown/src/compiler/types/SparkDiagnostic";
import { DidChangeDirectoriesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeDirectoriesMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { assetEndings, assetTypeOf, isLinkPath } from "../utils/assetTypes";
import { availableName, NameError, plural, validName } from "../utils/fileListModel";
import { IMAGE_HEADER_BYTES, imageSizeOf, type ImageSize } from "../utils/imageSize";
import { canMoveFolder } from "../utils/fileTree";
import { downloadFile } from "../utils/downloadFile";
import { reasonOf, type FileMove } from "../utils/fileMoves";
import { recordCreate, recordMove, recordMoves, recordReplace, renameFile, renameFiles, REPLACED_MESSAGE } from "../utils/fileUndo";
import { rasterLayerOfPath } from "@impower/sparkdown/src/attributes/rasterSource";
import { imageStacks, isStacked, stackBaseOf, type ImageStack } from "../utils/imageStacks";
import type { ImageVariant } from "../utils/imageVariants";
import { variantPicture } from "../utils/variantPicture";
import getUniqueFileName from "../utils/getUniqueFileName";
import getValidFileName from "../utils/getValidFileName";
import { importFiles } from "../utils/importDroppedFiles";
import { renameOrReport } from "../utils/renameOrReport";
import { showSnackbar } from "../utils/snackbar";
import { undo } from "../utils/undoManager";
import { replacementOf } from "../utils/replaceRule";
import { isScriptPath, scriptFilesGlob } from "../utils/scriptFiles";
import {
  assetHomes,
  assetMoveCheck,
  assetName,
  coveredFiles,
  coveredPaths,
  folderStackReason,
  landingFolder,
  sameNamedPictures,
  thingNames,
  thingsLabel,
  type AssetListing,
} from "./assetsListing";
import { moveToTrash } from "./moveToTrash";
import type { SearchGroup } from "./searchState";
import { groupLocations } from "./WorkspaceSearch";
import { commonFolder, isInside, joinPath, nameOf, parentOf } from "./scriptsListing";
import type WorkspaceFileSystem from "./WorkspaceFileSystem";
import type WorkspaceLanguageServer from "./WorkspaceLanguageServer";
import type WorkspaceWindow from "./WorkspaceWindow";
import workspace from "./WorkspaceStore";

type Deps = {
  fs: Pick<
    WorkspaceFileSystem,
    | "getFiles"
    | "getFolders"
    | "getFileUri"
    | "getFilename"
    | "getRelativePath"
    | "createFiles"
    | "createFolder"
    | "moveFile"
    | "moveFolder"
    | "renameFileWithReferences"
    | "deleteFiles"
    | "deleteFolder"
    | "renameFilesWithReferences"
    | "createFolders"
    | "deleteFolders"
    | "zipFiles"
    | "readFile"
    | "getFileText"
    | "writeTextDocument"
  >;
  ls: Pick<
    WorkspaceLanguageServer,
    "getFileReferences" | "getFileDiagnostics" | "onPublishedDiagnostics" | "getProgram"
  >;
  window: Pick<WorkspaceWindow, "recordScriptChange" | "recordAssetChange">;
  autoRenameFiles: () => boolean;
};

export interface DroppedFile {
  name: string;
  getBuffer: () => Promise<ArrayBuffer>;
}

const extensionOf = (path: string) => {
  const name = nameOf(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
};

const MEASURE_BATCH = 8;

const TAGGED_NAME = "Use a name without @ or ~. They mark a picture's alternates and layers.";

const DOTTED_NAME =
  "Use a name without a dot for a picture with alternates or layers. Scripts name a picture by the part before its first dot.";

const keepBase = (base: string) =>
  `Keep ${base} before the @ or ~. That part names the picture the file belongs to; rename the picture to change it.`;

const keepOrder = (name: string) =>
  `Keep the number and underscore at the start, as in 10_face.happy. They place the file among ${name}'s layers.`;

const showRenamed = (name: string, lines: number, also: readonly FileMove[]) =>
  showSnackbar({
    message: `Renamed ${name}${lines ? ` and ${plural(lines, "line")}` : ""}.${
      also.length
        ? ` Also renamed ${also.map((move) => move.from).join(", ")}, which ${also.length === 1 ? "shares" : "share"} its name.`
        : ""
    }`,
    actionLabel: "Undo",
    onAction: () => void undo(),
  });

export interface InspectorFacts {
  uses: SearchGroup[] | null;
  problems: SparkDiagnostic[] | null;
}

const sameBytes = (a: ArrayBuffer, b: ArrayBuffer) => {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  return x.every((byte, index) => byte === y[index]);
};


const failedWrite = (
  prefix: string,
  written: { unchanged: boolean; error: unknown },
  unchanged: string,
) =>
  `${prefix}: ${reasonOf(written.error)}. ${
    written.unchanged ? unchanged : "What it holds now could not be confirmed, so open it to check."
  }`;

const readImageSize = async (src: string): Promise<ImageSize | null> => {
  try {
    const response = await fetch(src, { headers: { Range: `bytes=0-${IMAGE_HEADER_BYTES - 1}` } });
    if (!response.ok) {
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return imageSizeOf(bytes.subarray(0, IMAGE_HEADER_BYTES)) ?? null;
  } catch {
    return null;
  }
};

const DURATION_TIMEOUT_MS = 5000;

const readAudioDuration = (src: string): Promise<number | null> =>
  new Promise((resolve) => {
    const audio = new Audio();
    const done = (seconds: number | null) => {
      clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      resolve(seconds);
    };
    const timer = setTimeout(() => done(null), DURATION_TIMEOUT_MS);
    audio.preload = "metadata";
    audio.onloadedmetadata = () =>
      done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = src;
  });

export default class WorkspaceAssets {
  protected readonly _workspace: Deps;

  protected _generation = 0;

  protected readonly _measuring = new Set<string>();

  constructor(deps: Deps) {
    this._workspace = deps;
  }

  protected get projectId() {
    return workspace.signals.projectId.peek();
  }

  protected get listing(): AssetListing {
    return workspace.assetListing.peek() ?? { files: {}, folders: [] };
  }

  protected requireProject(): string {
    const projectId = this.projectId;
    if (!projectId) {
      throw new NameError("No project is open.");
    }
    return projectId;
  }

  async load(): Promise<AssetListing | null> {
    const projectId = this.projectId;
    if (!projectId) {
      return null;
    }
    const generation = ++this._generation;
    const { fs } = this._workspace;
    const all = await fs.getFiles(projectId);
    const folders = await fs.getFolders(projectId);
    const byPath = new Map(
      Object.entries(all).map(([uri, file]) => [fs.getRelativePath(projectId, uri), file]),
    );
    const homes = assetHomes({ files: Object.fromEntries(byPath), folders });
    const files: AssetListing["files"] = {};
    for (const [path, file] of byPath) {
      const inHome = homes.some((home) => isInside(path, home) && path !== home);
      if (!inHome || nameOf(path).startsWith(".") || isScriptPath(path)) {
        continue;
      }
      files[path] = {
        modified: file.modified ?? 0,
        size: file.size ?? 0,
        src: file.src,
        ...(isLinkPath(path) && file.src ? { address: file.src } : {}),
      };
    }
    if (generation !== this._generation || projectId !== this.projectId) {
      return null;
    }
    const listing = { projectId, files, folders };
    workspace.assetListing.value = listing;
    return listing;
  }

  watch(): () => void {
    const reload = () => void this.load();
    const detachEndings = scriptFilesGlob.subscribe(reload);
    const detachFiles = onProtocolMessage(DidChangeWatchedFilesMessage.type, reload);
    const detachFolders = onProtocolMessage(DidChangeDirectoriesMessage.type, reload);
    return () => {
      detachEndings();
      detachFiles();
      detachFolders();
    };
  }

  protected kindOf(path: string): "file" | "folder" {
    return Object.hasOwn(this.listing.files, path) ? "file" : "folder";
  }

  protected siblings(folder: string): string[] {
    const listing = this.listing;
    return [...Object.keys(listing.files), ...listing.folders]
      .filter((p) => parentOf(p) === folder)
      .map(nameOf);
  }

  async createFolder(parent: string, name: string): Promise<string> {
    const projectId = this.requireProject();
    const path = joinPath(parent, availableName(name, this.siblings(parent)));
    await this._workspace.fs.createFolder(projectId, path);
    await this._workspace.window.recordAssetChange();
    await this.load();
    return path;
  }

  async upload(files: readonly DroppedFile[], folder: string): Promise<string[]> {
    const listing = this.listing;
    const endings = assetEndings.peek();
    return this.importAt(files, (file) => {
      const name = getValidFileName(file.name);
      return joinPath(landingFolder(listing, assetTypeOf(name, endings), folder), name);
    });
  }

  async addBeside(files: readonly DroppedFile[], path: string): Promise<string[]> {
    return this.importAt(files, (file) => joinPath(parentOf(path), validName(file.name)));
  }

  protected async importAt(
    files: readonly DroppedFile[],
    place: (file: DroppedFile) => string,
  ): Promise<string[]> {
    const projectId = this.requireProject();
    const written = await importFiles(
      projectId,
      files.map((file) => ({ rel: place(file), getBuffer: file.getBuffer })),
    );
    await this.load();
    return written;
  }

  async addLink(url: string, name: string, folder: string): Promise<string> {
    const projectId = this.requireProject();
    const { fs, window } = this._workspace;
    const filenames = Object.keys(await fs.getFiles(projectId)).map((uri) =>
      fs.getFilename(uri),
    );
    const filename = getUniqueFileName(filenames, `${getValidFileName(name) || "asset"}.url`);
    const type = assetTypeOf(filename, assetEndings.peek(), url);
    const path = joinPath(landingFolder(this.listing, type, folder), filename);
    const uri = fs.getFileUri(projectId, path);
    await fs.createFiles({ files: [{ uri, data: new TextEncoder().encode(url).buffer }] });
    await window.recordAssetChange();
    recordCreate(projectId, [uri], filename);
    await this.load();
    return path;
  }

  protected covered(paths: readonly string[]): string[] {
    return coveredPaths(this.listing, paths, assetEndings.peek());
  }

  async rename(path: string, name: string): Promise<string> {
    const projectId = this.requireProject();
    const kind = this.kindOf(path);
    const [stack] = kind === "file" && this.typeOf(path) === "image" ? imageStacks(this.covered([path])) : [];
    if (stack?.kind === "folder") {
      throw new NameError(folderStackReason(stack.name));
    }
    if (stack) {
      const members = sameNamedPictures(this.listing, stack.name, assetEndings.peek());
      if (isStacked(stack) || members.length > 1) {
        return this.renameStack(projectId, path, stack, members, name);
      }
    }
    const folder = parentOf(path);
    const leaf = availableName(
      name,
      this.siblings(folder),
      kind === "file" ? extensionOf(path) : "",
      nameOf(path),
    );
    const to = joinPath(folder, leaf);
    if (to === path) {
      return path;
    }
    if (kind === "folder") {
      return this.moveFolder(projectId, path, to);
    }
    const { window } = this._workspace;
    const renamed = await renameOrReport(path, to, () =>
      renameFile(this._workspace, projectId, path, to),
    );
    if (!renamed.renamed) {
      return path;
    }
    if (renamed.result.referencesUpdated > 0) {
      await window.recordScriptChange();
    }
    await window.recordAssetChange();
    const also = renamed.result.also ?? [];
    if (also.length) {
      recordMoves(projectId, [{ from: path, to }, ...also], leaf);
    } else {
      recordMove(projectId, path, to, false);
    }
    await this.load();
    showRenamed(assetName(path), renamed.result.referencesUpdated, also);
    return to;
  }

  protected typeOf(path: string) {
    return assetTypeOf(path, assetEndings.peek(), this.listing.files[path]?.address);
  }

  protected async renameStack(
    projectId: string,
    path: string,
    stack: ImageStack,
    members: readonly string[],
    name: string,
  ): Promise<string> {
    const plain = !isStacked(stack);
    const extension = extensionOf(stack.cover);
    const own = plain
      ? availableName(name, this.siblings(parentOf(path)), extensionOf(path), nameOf(path))
      : undefined;
    const typed = own ? own.split(".")[0]! : validName(name, extension).slice(0, -extension.length || undefined);
    if (/[@~]/.test(own ?? typed)) {
      throw new NameError(TAGGED_NAME);
    }
    if (!plain && typed.includes(".")) {
      throw new NameError(DOTTED_NAME);
    }
    const moves: FileMove[] = members
      .map((from) => ({
        from,
        to: joinPath(
          parentOf(from),
          from === path && own ? own : typed + nameOf(from).slice(stack.name.length),
        ),
      }))
      .filter((move) => move.to !== move.from);
    if (!moves.length) {
      return path;
    }
    await this.applyRenames(projectId, moves, typed, stack);
    return moves.find((move) => move.from === path)?.to ?? path;
  }

  async renameMember(path: string, name: string): Promise<string> {
    const projectId = this.requireProject();
    const stack = imageStacks(this.covered([path])).find((candidate) => candidate.paths.includes(path));
    if (!stack || !isStacked(stack)) {
      return this.rename(path, name);
    }
    const folder = parentOf(path);
    const leaf = availableName(name, this.siblings(folder), extensionOf(path), nameOf(path));
    const to = joinPath(folder, leaf);
    if (stack.kind === "folder" && !rasterLayerOfPath(to)) {
      throw new NameError(keepOrder(stack.name));
    }
    if (stack.kind === "files" && stackBaseOf(to) !== stack.base) {
      throw new NameError(stackBaseOf(to).includes(".") ? DOTTED_NAME : keepBase(stack.base));
    }
    if (to === path) {
      return path;
    }
    await this.applyRenames(projectId, [{ from: path, to }], nameOf(path), stack);
    return to;
  }

  protected async applyRenames(
    projectId: string,
    moves: readonly FileMove[],
    label: string,
    stack: ImageStack,
  ): Promise<void> {
    let outcome;
    try {
      outcome = await renameFiles(this._workspace, projectId, moves);
    } catch (error) {
      await this.load().catch(() => null);
      throw new NameError(reasonOf(error));
    }
    const { window } = this._workspace;
    if (outcome.referencesUpdated > 0) {
      await window.recordScriptChange();
    }
    await window.recordAssetChange();
    recordMoves(projectId, [...moves, ...outcome.also], label);
    await this.load();
    showRenamed(stack.name, outcome.referencesUpdated, [
      ...moves.filter((move) => !stack.paths.includes(move.from)),
      ...outcome.also,
    ]);
  }

  async move(paths: readonly string[], folder: string): Promise<FileMove[]> {
    const projectId = this.requireProject();
    const listing = this.listing;
    const covered = this.covered(paths);
    const check = assetMoveCheck(listing, covered, folder, assetEndings.peek());
    if ("refused" in check) {
      throw new NameError(check.refused);
    }
    if (!check.moving.length) {
      return [];
    }
    const moves: FileMove[] = check.moving.map((from) => ({
      from,
      to: joinPath(folder, nameOf(from)),
      isDir: !Object.hasOwn(listing.files, from),
    }));
    try {
      await renameFiles(this._workspace, projectId, moves);
    } catch (error) {
      await this.load().catch(() => null);
      throw new NameError(reasonOf(error));
    }
    await this._workspace.window.recordAssetChange();
    recordMoves(projectId, moves, thingsLabel(listing, covered, assetEndings.peek()), "Move");
    await this.load();
    return moves;
  }

  async measureImages(paths: readonly string[]): Promise<void> {
    const files = this.listing.files;
    const known = workspace.assetSizes.peek();
    const wanted = [
      ...new Set(
        paths
          .filter((path) => !isLinkPath(path))
          .map((path) => files[path]?.src)
          .filter((src): src is string => !!src && !Object.hasOwn(known, src) && !this._measuring.has(src)),
      ),
    ];
    if (!wanted.length) {
      return;
    }
    for (const src of wanted) this._measuring.add(src);
    const measured: Record<string, ImageSize | null> = {};
    for (let at = 0; at < wanted.length; at += MEASURE_BATCH) {
      await Promise.all(
        wanted.slice(at, at + MEASURE_BATCH).map(async (src) => {
          measured[src] = await readImageSize(src);
        }),
      );
    }
    for (const src of wanted) this._measuring.delete(src);
    workspace.assetSizes.value = { ...workspace.assetSizes.peek(), ...measured };
  }

  async measureDurations(paths: readonly string[]): Promise<void> {
    const files = this.listing.files;
    const known = workspace.assetDurations.peek();
    const wanted = [
      ...new Set(
        paths
          .map((path) => files[path]?.src)
          .filter((src): src is string => !!src && !Object.hasOwn(known, src) && !this._measuring.has(src)),
      ),
    ];
    if (!wanted.length) {
      return;
    }
    for (const src of wanted) this._measuring.add(src);
    const measured: Record<string, number | null> = {};
    for (let at = 0; at < wanted.length; at += MEASURE_BATCH) {
      await Promise.all(
        wanted.slice(at, at + MEASURE_BATCH).map(async (src) => {
          measured[src] = await readAudioDuration(src);
        }),
      );
    }
    for (const src of wanted) this._measuring.delete(src);
    workspace.assetDurations.value = { ...workspace.assetDurations.peek(), ...measured };
  }

  protected async moveFolder(projectId: string, from: string, to: string): Promise<string> {
    if (!canMoveFolder(from, to)) {
      return from;
    }
    try {
      await renameFiles(this._workspace, projectId, [{ from, to, isDir: true }]);
    } catch (error) {
      await this.load().catch(() => null);
      throw new NameError(reasonOf(error));
    }
    await this._workspace.window.recordAssetChange();
    recordMove(projectId, from, to, true);
    await this.load();
    return to;
  }

  async remove(paths: readonly string[]): Promise<void> {
    const items = this.covered(paths);
    await this.trash(items, thingsLabel(this.listing, items, assetEndings.peek()));
  }

  async removeMember(path: string): Promise<void> {
    await this.trash([path], nameOf(path));
  }

  protected async trash(items: readonly string[], label: string): Promise<void> {
    const projectId = this.requireProject();
    const trashed = items.map((path) => ({ path, folder: this.kindOf(path) === "folder" }));
    await moveToTrash(this._workspace.fs, projectId, trashed, label);
    await this._workspace.window.recordAssetChange();
    await this.load();
  }

  async usedBy(paths: readonly string[]): Promise<SearchGroup[] | null> {
    const files = coveredFiles(this.listing, this.covered(paths));
    try {
      return files.length ? await this.uses(files) : [];
    } catch {
      return null;
    }
  }

  async downloadAll(paths: readonly string[]): Promise<void> {
    const projectId = this.requireProject();
    const listing = this.listing;
    const covered = this.covered(paths);
    const files = coveredFiles(listing, covered);
    const [only] = files;
    if (files.length === 1 && only && covered.length === 1 && covered[0] === only) {
      await this.download(only);
      return;
    }
    const base = covered.length === 1 ? parentOf(covered[0]!) : commonFolder(covered);
    const relative = (path: string) => (base ? path.slice(base.length + 1) : path);
    const { fs } = this._workspace;
    const zip = await fs.zipFiles({
      files: files.map((path) => ({ uri: fs.getFileUri(projectId, path), path: relative(path) })),
      directories: listing.folders
        .filter((folder) => covered.some((item) => isInside(folder, item)))
        .map(relative),
    });
    const names = thingNames(listing, covered, assetEndings.peek());
    downloadFile(`${names.length === 1 ? names[0] : "Assets"}.zip`, "application/zip", zip);
  }

  async uses(paths: readonly string[]): Promise<SearchGroup[]> {
    const projectId = this.projectId;
    if (!projectId) {
      return [];
    }
    const { fs, ls } = this._workspace;
    const found = await Promise.all(
      paths.map((path) => ls.getFileReferences(fs.getFileUri(projectId, path))),
    );
    return groupLocations(found.flat(), (uri) => fs.getFileText(uri));
  }

  async problems(paths: readonly string[]): Promise<SparkDiagnostic[]> {
    const projectId = this.projectId;
    if (!projectId) {
      return [];
    }
    const { fs, ls } = this._workspace;
    const found = await Promise.all(
      paths.map((path) => ls.getFileDiagnostics(fs.getFileUri(projectId, path))),
    );
    const seen = new Set<string>();
    return found.flat().filter((problem) => {
      const key = `${problem.severity}:${typeof problem.message === "string" ? problem.message : problem.message.value}`;
      return seen.has(key) ? false : (seen.add(key), true);
    });
  }

  watchFacts(paths: readonly string[], listener: (facts: InspectorFacts) => void): () => void {
    let alive = true;
    let request = 0;
    const refresh = async () => {
      const mine = ++request;
      const [uses, problems] = await Promise.all([
        this.uses(paths).catch(() => null),
        this.problems(paths).catch(() => null),
      ]);
      if (alive && mine === request) {
        listener({ uses, problems });
      }
    };
    const projectId = this.projectId;
    const { fs, ls } = this._workspace;
    const uris = new Set(projectId ? paths.map((path) => fs.getFileUri(projectId, path)) : []);
    const detachCompiled = onProtocolMessage(CompiledProgramMessage.type, () => void refresh());
    const detachPublished = ls.onPublishedDiagnostics(({ uri }) => {
      if (uris.has(uri)) {
        void refresh();
      }
    });
    void refresh();
    return () => {
      alive = false;
      detachCompiled();
      detachPublished();
    };
  }

  watchPicture(variant: ImageVariant, listener: (src: string | null) => void): () => void {
    let alive = true;
    let request = 0;
    const draw = async (program?: { context?: Parameters<typeof variantPicture>[0] }) => {
      const mine = ++request;
      const compiled = program ?? (await this._workspace.ls.getProgram().catch(() => undefined));
      const src = await variantPicture(compiled?.context, variant).catch(() => null);
      if (alive && mine === request) {
        listener(src);
      }
    };
    const detach = onProtocolMessage(CompiledProgramMessage.type, (message) => void draw(message.params.program));
    void draw();
    return () => {
      alive = false;
      detach();
    };
  }

  async readText(path: string): Promise<string> {
    const projectId = this.requireProject();
    const { fs } = this._workspace;
    return fs.getFileText(fs.getFileUri(projectId, path));
  }

  async setAddress(path: string, address: string): Promise<void> {
    const projectId = this.requireProject();
    if (!isLinkPath(path)) {
      throw new NameError(`${nameOf(path)} is not a link.`);
    }
    const text = address.trim();
    if (!text) {
      throw new NameError("Enter the address the link points to.");
    }
    const { fs, window } = this._workspace;
    await fs.writeTextDocument({ textDocument: { uri: fs.getFileUri(projectId, path), version: 0, text } });
    await window.recordAssetChange();
    await this.load();
  }

  async download(path: string): Promise<void> {
    const projectId = this.requireProject();
    const { fs } = this._workspace;
    const data = await fs.readFile({ file: { uri: fs.getFileUri(projectId, path) } });
    downloadFile(nameOf(path), "application/octet-stream", data);
  }

  async replace(path: string, file: DroppedFile): Promise<string> {
    const projectId = this.requireProject();
    const facts = this.listing.files[path];
    const rule = replacementOf(
      {
        path,
        type: assetTypeOf(path, assetEndings.peek(), facts?.address),
        link: isLinkPath(path),
      },
      file.name,
      assetEndings.peek(),
    );
    if ("refused" in rule) {
      throw new NameError(rule.refused);
    }
    const { fs } = this._workspace;
    const uri = fs.getFileUri(projectId, rule.path);
    const leaf = nameOf(rule.path);
    const before = await fs.readFile({ file: { uri } });
    const data = await file.getBuffer();
    const written = await this.writeChecked(uri, data, before);
    if (!written.landed) {
      throw new NameError(failedWrite(`Couldn't replace ${leaf}`, written, "The old file is still there."));
    }
    const restore = (bytes: ArrayBuffer, from: ArrayBuffer, verb: string) => async () => {
      const restored = await this.writeChecked(uri, bytes, from);
      if (!restored.landed) {
        showSnackbar({
          message: failedWrite(`Couldn't ${verb} the replace of ${leaf}`, restored, "Its contents are unchanged."),
        });
      }
    };
    recordReplace({
      label: leaf,
      message: written.error
        ? `Replaced, though saving ${leaf} reported a problem: ${reasonOf(written.error)}`
        : REPLACED_MESSAGE,
      undo: restore(before, data, "undo"),
      redo: restore(data, before, "redo"),
    });
    return rule.path;
  }

  protected async writeChecked(
    uri: string,
    data: ArrayBuffer,
    previous: ArrayBuffer,
  ): Promise<{ landed: true; error?: unknown } | { landed: false; unchanged: boolean; error: unknown }> {
    const { fs, window } = this._workspace;
    try {
      await fs.createFiles({ files: [{ uri, data: data.slice(0) }] });
    } catch (error) {
      const now = await fs.readFile({ file: { uri } }).catch(() => null);
      if (now && sameBytes(now, data)) {
        await window.recordAssetChange();
        await this.load();
        return { landed: true, error };
      }
      const unchanged = !!now && sameBytes(now, previous);
      if (!unchanged) {
        await this.load().catch(() => null);
      }
      return { landed: false, unchanged, error };
    }
    await window.recordAssetChange();
    await this.load();
    return { landed: true };
  }
}
