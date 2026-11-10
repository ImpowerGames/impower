import {
  addMenuFiles,
  addMenuSubfolder,
  type AddMenuFolders,
  type AddMenuKind,
  ADD_MENU_FILE_TYPES,
} from "../../utils/addMenuFolders";
import { imageStacks, stemOf } from "../../utils/imageStacks";

export interface PickerFile {
  readonly path: string;
  readonly type: string;
  readonly src?: string;
}

export interface PickerItem {
  readonly id: string;
  readonly reference: string;
  readonly name: string;
  readonly caption: string;
  readonly path: string;
  readonly src?: string;
}

const compare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

const REFERENCE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const referable = (path: string) =>
  REFERENCE.test(stemOf(path)) ? [{ name: stemOf(path), path }] : [];

const basePictures = (paths: readonly string[]) =>
  imageStacks(paths).flatMap((stack) => {
    const base = stack.pictures[0];
    return base?.alternate === null && base.path !== undefined ? referable(base.path) : [];
  });

const soundFiles = (paths: readonly string[]) => paths.flatMap(referable);

export const pickerItems = (
  kind: AddMenuKind,
  files: readonly PickerFile[],
  folders: AddMenuFolders,
): PickerItem[] => {
  const type = ADD_MENU_FILE_TYPES[kind];
  const matched = addMenuFiles(files, kind, folders);
  const sources = new Map(matched.map((file) => [file.path, file.src]));
  const paths = matched.map((file) => file.path);
  const things = type === "audio" ? soundFiles(paths) : basePictures(paths);
  return things
    .map(
      ({ name, path }): PickerItem => ({
        id: path,
        reference: name,
        name,
        caption: addMenuSubfolder({ path, type }, folders) ?? "",
        path,
        src: sources.get(path),
      }),
    )
    .sort((a, b) => compare(a.caption, b.caption) || compare(a.name, b.name));
};

export const lengthLabel = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};
