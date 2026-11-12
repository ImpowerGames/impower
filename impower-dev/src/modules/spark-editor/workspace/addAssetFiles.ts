import type { ListsState } from "@impower/spark-editor-protocol/src/types";
import { assetEndings, assetTypeOf } from "../utils/assetTypes";
import getValidFileName from "../utils/getValidFileName";
import { importFiles } from "../utils/importDroppedFiles";
import { isScriptPath } from "../utils/scriptFiles";
import { findProjectRoot } from "./projectImport";
import { joinPath, parentOf, scriptsHome } from "./scriptsListing";
import { refuseUploads, storageLeft, withUploadGroup } from "./uploadSession";
import type { DroppedFile } from "./WorkspaceAssets";
import workspace from "./WorkspaceStore";

export type AddedFile = DroppedFile & { size: number };

export const isProjectZipDrop = (files: readonly { name: string }[]): boolean =>
  files.length === 1 && /\.zip$/i.test(files[0]!.name);

export const openDroppedZip = async (file: AddedFile): Promise<"replace" | "refused"> => {
  const { Workspace } = await import("./Workspace");
  const data = await file.getBuffer().catch(() => null);
  if (!data) {
    refuseUploads([file.name], { kind: "unreadable" });
    return "refused";
  }
  const entries = await Workspace.fs.unzipFiles({ data: data.slice(0) }).catch(() => null);
  const found = entries
    ? findProjectRoot(entries.map((entry) => entry.filename))
    : ({ kind: "refused", reason: "unreadable_zip" } as const);
  if (found.kind === "root") {
    await Workspace.window.requestProjectReplace(new File([data], file.name, { type: "application/zip" }));
    return "replace";
  }
  refuseUploads([file.name], {
    kind: "zip",
    reason: found.reason,
    folders: "folders" in found ? found.folders : undefined,
  });
  return "refused";
};

export const addAssetFiles = async (
  files: readonly AddedFile[],
  folder: string,
  { dropped }: { dropped: boolean },
): Promise<string[]> => {
  if (!files.length) {
    return [];
  }
  if (dropped && isProjectZipDrop(files)) {
    await openDroppedZip(files[0]!);
    return [];
  }
  const { Workspace } = await import("./Workspace");
  const projectId = workspace.signals.projectId.peek();
  if (!projectId) {
    return [];
  }
  const free = await storageLeft();
  const needed = files.reduce((sum, file) => sum + file.size, 0);
  if (free !== null && needed > free) {
    await withUploadGroup(async () => refuseUploads(files.map((file) => file.name), { kind: "no_room", needed, free }));
    return [];
  }
  if (workspace.assetListing.peek()?.projectId !== projectId) {
    await Workspace.assets.load();
  }
  const scripts = files.filter((file) => isScriptPath(getValidFileName(file.name)));
  const assets = files.filter((file) => !scripts.includes(file));
  return withUploadGroup(async () => {
    const home = scriptsHome({ folders: workspace.assetListing.peek()?.folders ?? [] });
    const written = scripts.length
      ? await importFiles(
          projectId,
          scripts.map((file) => ({ rel: joinPath(home, getValidFileName(file.name)), getBuffer: file.getBuffer })),
        )
      : [];
    return [...written, ...(assets.length ? await Workspace.assets.upload(assets, folder) : [])];
  });
};

export const landedView = (
  landed: readonly string[],
  viewed: string,
): { last: string; lists?: Partial<ListsState> } | null => {
  const files = workspace.assetListing.peek()?.files ?? {};
  const shown = landed.filter((path) => Object.hasOwn(files, path));
  const here = shown.filter((path) => parentOf(path) === viewed);
  const last = here[here.length - 1] ?? shown[shown.length - 1];
  if (!last) {
    return null;
  }
  if (here.length) {
    return { last };
  }
  const type = assetTypeOf(last, assetEndings.peek(), files[last]?.address);
  const folders = workspace.state.peek().lists?.assetsFolders ?? {};
  return { last, lists: { assetsType: type, assetsFolders: { ...folders, [type]: parentOf(last) } } };
};
