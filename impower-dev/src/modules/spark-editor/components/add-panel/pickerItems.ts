import GRAMMAR from "@impower/sparkdown/language/sparkdown.language-grammar.json";
import {
  addMenuFiles,
  addMenuSubfolder,
  type AddMenuFolders,
  type AddMenuKind,
  ADD_MENU_FILE_TYPES,
} from "../../utils/addMenuFolders";
import {
  imageThingsOf,
  stemOf,
  type ImagePicture,
} from "@impower/sparkdown/src/attributes/imageFileName";
import { imageStacks } from "../../utils/imageStacks";
import type { ImageVariant } from "../../utils/imageVariants";

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
  readonly variant?: ImageVariant;
}

interface Candidate {
  readonly reference: string;
  readonly name: string;
  readonly alternate: string | null;
  readonly path: string;
  readonly variant?: ImageVariant;
}

const compare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

const GRAMMAR_RULES = GRAMMAR.repository as unknown as Record<
  string,
  { match?: string } | undefined
>;

const grammarPattern = (rule: string, wrap: (source: string) => string) => {
  const match = GRAMMAR_RULES[rule]?.match;
  return match ? new RegExp(wrap(match), "u") : /(?!)/u;
};

const ASSET_NAME = grammarPattern("AssetCommandFileName", (m) => `^(?:${m})$`);

const NONE_KEYWORD = grammarPattern(
  "AssetCommandKeywordNone",
  (m) => `^(?:${m})$`,
);

const CLAUSE_KEYWORD = grammarPattern(
  "AssetCommandClauseKeyword",
  (m) => `^(?:${m})$`,
);

const writableName = (name: string) =>
  ASSET_NAME.test(name) &&
  !NONE_KEYWORD.test(name) &&
  !CLAUSE_KEYWORD.test(name);

const sharedNames = (names: readonly string[]) => {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return new Set(
    [...counts].filter(([, count]) => count > 1).map(([name]) => name),
  );
};

const restingLook = (image: string): ImageVariant => ({ image, attributes: [] });

const pictureFiles = (picture: ImagePicture): string[] => [
  ...(picture.path === undefined ? [] : [picture.path]),
  ...picture.duplicates,
  ...picture.layers.map((layer) => layer.path),
];

const pictureCandidate = (
  picture: ImagePicture,
  name: string,
  offered: ReadonlySet<string>,
): Candidate | null => {
  const files = pictureFiles(picture).filter((path) => offered.has(path));
  if (!files.length) return null;
  return {
    reference: picture.name,
    name,
    alternate: picture.alternate,
    path: picture.path !== undefined && offered.has(picture.path) ? picture.path : files[0]!,
    ...(picture.layers.length ? { variant: restingLook(picture.name) } : {}),
  };
};

const imageCandidates = (own: readonly string[], offered: ReadonlySet<string>) => {
  const things = imageThingsOf(own);
  const folders = imageStacks(own).filter((stack) => stack.kind === "folder");
  const shared = sharedNames([
    ...things.flatMap((thing) =>
      thing.pictures.flatMap((picture) =>
        Array<string>(picture.duplicates.length + 1).fill(picture.name),
      ),
    ),
    ...folders.map((stack) => stack.name),
  ]);
  const candidates = [
    ...things.flatMap((thing) =>
      thing.pictures.flatMap((picture) => pictureCandidate(picture, thing.name, offered) ?? []),
    ),
    ...folders
      .filter((stack) => stack.paths.some((path) => offered.has(path)))
      .map((stack): Candidate => ({
        reference: stack.name,
        name: stack.name,
        alternate: null,
        path: stack.cover,
        variant: restingLook(stack.name),
      })),
  ];
  return candidates.map((candidate) => ({
    candidate,
    writable: writableName(candidate.reference) && !shared.has(candidate.reference),
  }));
};

const candidatesOf = (
  kind: AddMenuKind,
  files: readonly PickerFile[],
  folders: AddMenuFolders,
) => {
  const type = ADD_MENU_FILE_TYPES[kind];
  const paths = addMenuFiles(files, kind, folders).map((file) => file.path);
  const own = files.filter((file) => file.type === type).map((file) => file.path);
  if (type === "audio") {
    const shared = sharedNames(own.map(stemOf));
    return paths.map((path) => {
      const name = stemOf(path);
      const candidate: Candidate = { reference: name, name, alternate: null, path };
      return { candidate, writable: writableName(name) && !shared.has(name) };
    });
  }
  return imageCandidates(own, new Set(paths));
};

export const pickerItems = (
  kind: AddMenuKind,
  files: readonly PickerFile[],
  folders: AddMenuFolders,
): PickerItem[] => {
  const type = ADD_MENU_FILE_TYPES[kind];
  const sources = new Map(files.map((file) => [file.path, file.src]));
  return candidatesOf(kind, files, folders)
    .filter(({ writable }) => writable)
    .map(({ candidate }) => ({
      candidate,
      folder: addMenuSubfolder({ path: candidate.path, type }, folders) ?? "",
    }))
    .sort(
      (a, b) =>
        compare(a.folder, b.folder) ||
        compare(a.candidate.name, b.candidate.name),
    )
    .map(({ candidate, folder }): PickerItem => ({
      id: candidate.path,
      reference: candidate.reference,
      name: candidate.name,
      caption: [folder, candidate.alternate].filter(Boolean).join(" · "),
      path: candidate.path,
      src: sources.get(candidate.path),
      ...(candidate.variant ? { variant: candidate.variant } : {}),
    }));
};

export const pickerLeftOut = (
  kind: AddMenuKind,
  files: readonly PickerFile[],
  folders: AddMenuFolders,
): number =>
  candidatesOf(kind, files, folders).filter(({ writable }) => !writable).length;

export const lengthLabel = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};
