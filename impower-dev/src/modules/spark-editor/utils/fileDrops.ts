import type { AddedFile } from "../workspace/addAssetFiles";
import { isArchiveDropping } from "../workspace/projectImport";
import type { UploadReason } from "../workspace/uploadSession";

export const FILE_DROP_HIDE_MS = 160;

export const FILE_DROP_TARGET = "data-file-drop-target";

export type DroppedFolder = { folder: FileSystemDirectoryEntry };

export type DropItem = AddedFile | DroppedFolder;

export type DropRefusal = { name: string; reason: Extract<UploadReason, { kind: "unreadable" | "unreadable_folder" | "empty_folder" }> };

export type WalkedDrop = { files: AddedFile[]; refused: DropRefusal[] };

export const isDroppedFolder = (item: DropItem): item is DroppedFolder => "folder" in item;

export const carriesFiles = (event: DragEvent): boolean =>
  Array.from(event.dataTransfer?.types ?? []).includes("Files");

const fromFile = (file: File, name = file.name): AddedFile => ({
  name,
  size: file.size,
  getBuffer: () => file.arrayBuffer(),
});

export const droppedItems = (event: DragEvent): DropItem[] => {
  const items = Array.from(event.dataTransfer?.items ?? []).filter((item) => item.kind === "file");
  if (!items.length) {
    return Array.from(event.dataTransfer?.files ?? []).map((file) => fromFile(file));
  }
  return items.flatMap((item): DropItem[] => {
    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) {
      return [{ folder: entry as FileSystemDirectoryEntry }];
    }
    const file = item.getAsFile();
    return file ? [fromFile(file)] : [];
  });
};

const isSkipped = (name: string): boolean =>
  name.startsWith(".") || isArchiveDropping(name);

const readPage = (reader: FileSystemDirectoryReader) =>
  new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));

const fileOf = (entry: FileSystemFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject));

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export const walkDrop = async (
  items: readonly DropItem[],
  onFound: (count: number) => void = () => {},
): Promise<WalkedDrop> => {
  const files: AddedFile[] = [];
  const refused: DropRefusal[] = [];
  for (const item of items) {
    if (!isDroppedFolder(item)) {
      files.push(item);
      continue;
    }
    const before = files.length + refused.length;
    const queue: [FileSystemDirectoryEntry, string][] = [[item.folder, item.folder.name]];
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [folder, path] = next;
      const reader = folder.createReader();
      for (;;) {
        const page = await readPage(reader).catch(() => null);
        if (!page) {
          refused.push({ name: folder.name, reason: { kind: "unreadable_folder" } });
          break;
        }
        if (!page.length) {
          break;
        }
        const kept = page.filter((entry) => !isSkipped(entry.name));
        for (const entry of kept) {
          if (entry.isDirectory) {
            queue.push([entry as FileSystemDirectoryEntry, `${path}/${entry.name}`]);
          }
        }
        const read = await Promise.all(
          kept
            .filter((entry) => entry.isFile)
            .map((entry) =>
              fileOf(entry as FileSystemFileEntry).then(
                (file) => fromFile(file, `${path}/${entry.name}`),
                () => {
                  refused.push({ name: entry.name, reason: { kind: "unreadable" } });
                  return null;
                },
              ),
            ),
        );
        files.push(...read.filter((file): file is AddedFile => !!file));
        onFound(files.length);
        await nextTask();
      }
    }
    if (files.length + refused.length === before) {
      refused.push({ name: item.folder.name, reason: { kind: "empty_folder" } });
    }
  }
  return { files, refused };
};
