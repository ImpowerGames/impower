import GRAMMAR from "@impower/sparkdown/language/sparkdown.language-grammar.json";
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

const UNWRITABLE: Record<string, RegExp> = {
  image: /\s|^\d/u,
  audio: /[\s.]/u,
};

const GRAMMAR_VARIABLES = GRAMMAR.variables as unknown as Record<
  string,
  unknown
>;

const CLAUSE_WORDS = new Set(
  ["IMAGE_CLAUSE_KEYWORDS", "AUDIO_CLAUSE_KEYWORDS"].flatMap((key) => {
    const words = GRAMMAR_VARIABLES[key];
    return Array.isArray(words) ? words.map(String) : [];
  }),
);

const sharedNames = (files: readonly PickerFile[], type: string) => {
  const counts = new Map<string, number>();
  for (const file of files) {
    if (file.type === type) {
      const name = stemOf(file.path);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return new Set(
    [...counts].filter(([, count]) => count > 1).map(([name]) => name),
  );
};

const candidatesOf = (
  kind: AddMenuKind,
  files: readonly PickerFile[],
  folders: AddMenuFolders,
) => {
  const type = ADD_MENU_FILE_TYPES[kind];
  const paths = addMenuFiles(files, kind, folders).map((file) => file.path);
  const bases =
    type === "audio"
      ? paths
      : imageStacks(paths).flatMap((stack) => {
          const base = stack.pictures[0];
          return base?.alternate === null && base.path !== undefined
            ? [base.path]
            : [];
        });
  const shared = sharedNames(files, type);
  return bases.map((path) => {
    const name = stemOf(path);
    return {
      name,
      path,
      writable:
        !UNWRITABLE[type]!.test(name) &&
        !CLAUSE_WORDS.has(name) &&
        !shared.has(name),
    };
  });
};

export const pickerItems = (
  kind: AddMenuKind,
  files: readonly PickerFile[],
  folders: AddMenuFolders,
): PickerItem[] => {
  const type = ADD_MENU_FILE_TYPES[kind];
  const sources = new Map(files.map((file) => [file.path, file.src]));
  return candidatesOf(kind, files, folders)
    .filter((candidate) => candidate.writable)
    .map(({ name, path }): PickerItem => ({
      id: path,
      reference: name,
      name,
      caption: addMenuSubfolder({ path, type }, folders) ?? "",
      path,
      src: sources.get(path),
    }))
    .sort((a, b) => compare(a.caption, b.caption) || compare(a.name, b.name));
};

export const pickerLeftOut = (
  kind: AddMenuKind,
  files: readonly PickerFile[],
  folders: AddMenuFolders,
): number =>
  candidatesOf(kind, files, folders).filter((candidate) => !candidate.writable)
    .length;

export const lengthLabel = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};
