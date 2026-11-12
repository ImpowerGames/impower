import type { ListsState } from "@impower/spark-editor-protocol/src/types";
import { assetEndings, assetTypeOf } from "../utils/assetTypes";
import { inflateZipEntry, listZip, zipInflates } from "../utils/zipEntries";
import { findProjectRoot, isArchiveDropping } from "./projectImport";
import { landingFolder } from "./assetsListing";
import { isInside, joinPath, parentOf } from "./scriptsListing";
import { isDroppedFolder, walkDrop, type DropItem, type WalkedDrop } from "../utils/fileDrops";
import {
  beginUploadBatch,
  endUploadBatch,
  findingUploads,
  refuseUploads,
  storageLeft,
  withUploadGroup,
} from "./uploadSession";
import type { DroppedFile } from "./WorkspaceAssets";
import workspace from "./WorkspaceStore";

export type AddedFile = DroppedFile & { size: number };

type OpenedFiles = { files: readonly AddedFile[]; zip?: { name: string; inflates: () => boolean } };

const isZip = (files: readonly { name: string }[]): boolean =>
  files.length === 1 && /\.zip$/i.test(files[0]!.name);

const openZip = async (file: AddedFile): Promise<OpenedFiles | null> => {
  const refused: OpenedFiles = { files: [] };
  const data = await file.getBuffer().catch(() => null);
  if (!data) {
    refuseUploads([file.name], { kind: "unreadable" });
    return refused;
  }
  const unreadable = { kind: "refused", reason: "unreadable_zip" } as const;
  const listed = listZip(data);
  const root = listed ? findProjectRoot(listed.map((entry) => entry.path)) : unreadable;
  const found = root.kind === "root" && !zipInflates(data, listed ?? []) ? unreadable : root;
  if (found.kind === "root") {
    const { Workspace } = await import("./Workspace");
    await Workspace.window.requestProjectReplace(new File([data], file.name, { type: "application/zip" }));
    return null;
  }
  const files = (listed ?? [])
    .filter((entry) => !entry.path.endsWith("/") && !isArchiveDropping(entry.path))
    .map((entry) => ({
      name: entry.path,
      size: entry.size,
      getBuffer: async () => inflateZipEntry(data, entry.path),
    }));
  if (found.reason !== "no_main_script" || !files.length) {
    refuseUploads([file.name], {
      kind: "zip",
      reason: found.reason,
      folders: "folders" in found ? found.folders : undefined,
    });
    return refused;
  }
  const entries = files.map((entry) => ({ path: entry.name, size: entry.size }));
  return { files, zip: { name: file.name, inflates: () => zipInflates(data, entries) } };
};

const leafOf = (name: string) => name.slice(name.lastIndexOf("/") + 1);

const addWalked = async (
  projectId: string,
  { files, refused }: WalkedDrop,
  folder: string,
  { showUploads, unpack }: { showUploads?: () => void; unpack: boolean },
): Promise<string[]> => {
  const opened = unpack && isZip(files) ? await openZip(files[0]!) : { files };
  if (!opened) {
    return [];
  }
  showUploads?.();
  const refuseUnread = () => refused.forEach(({ name, reason }) => refuseUploads([name], reason));
  if (!opened.files.length) {
    if (refused.length) {
      await withUploadGroup(async () => refuseUnread());
    }
    return [];
  }
  const free = await storageLeft();
  const needed = opened.files.reduce((sum, file) => sum + file.size, 0);
  if (free !== null && needed > free) {
    const names = opened.zip ? [opened.zip.name] : opened.files.map((file) => leafOf(file.name));
    await withUploadGroup(async () => {
      refuseUnread();
      refuseUploads(names, { kind: "no_room", needed, free });
    });
    return [];
  }
  const zip = opened.zip;
  if (zip && !zip.inflates()) {
    await withUploadGroup(async () => refuseUploads([zip.name], { kind: "zip", reason: "unreadable_zip" }));
    return [];
  }
  const { Workspace } = await import("./Workspace");
  if (workspace.assetListing.peek()?.projectId !== projectId) {
    await Workspace.assets.load();
  }
  return withUploadGroup(async () => {
    refuseUnread();
    return Workspace.assets.upload(opened.files, folder);
  });
};

export const addAssetFiles = async (
  items: readonly DropItem[],
  folder: string,
  { showUploads }: { showUploads?: () => void } = {},
): Promise<string[]> => {
  const projectId = workspace.signals.projectId.peek();
  if (!items.length || !projectId) {
    return [];
  }
  if (!items.some(isDroppedFolder)) {
    return addWalked(projectId, { files: items as AddedFile[], refused: [] }, folder, { showUploads, unpack: true });
  }
  showUploads?.();
  beginUploadBatch();
  try {
    const walked = await findingUploads((found) => walkDrop(items, found));
    return await addWalked(projectId, walked, folder, { unpack: false });
  } finally {
    endUploadBatch();
  }
};

const rowIn = (path: string, folder: string): string =>
  joinPath(folder, path.slice(folder ? folder.length + 1 : 0).split("/")[0]!);

export const landedView = (
  landed: readonly string[],
  viewed: string,
): { last: string; lists?: Partial<ListsState> } | null => {
  const listing = workspace.assetListing.peek() ?? { files: {}, folders: [] };
  const files = listing.files;
  const shown = landed.filter((path) => Object.hasOwn(files, path));
  const here = shown.filter((path) => path.startsWith(viewed ? `${viewed}/` : "")).map((path) => rowIn(path, viewed));
  const last = here[here.length - 1] ?? shown[shown.length - 1];
  if (!last) {
    return null;
  }
  if (here.length) {
    return { last };
  }
  const type = assetTypeOf(last, assetEndings.peek(), files[last]?.address);
  const landing = landingFolder(listing, type, viewed);
  const opened = isInside(last, landing) ? landing : parentOf(last);
  const folders = workspace.state.peek().lists?.assetsFolders ?? {};
  return { last: rowIn(last, opened), lists: { assetsType: type, assetsFolders: { ...folders, [type]: opened } } };
};
