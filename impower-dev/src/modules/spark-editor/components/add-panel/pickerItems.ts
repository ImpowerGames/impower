import { isWritableAssetReference } from "@impower/sparkdown/src/attributes/assetReference";
import {
  addMenuFiles,
  addMenuSubfolder,
  type AddMenuFolders,
  type AddMenuKind,
  ADD_MENU_FILE_TYPES,
} from "../../utils/addMenuFolders";
import {
  assetNameOf,
  imageThingsOf,
  type ImagePicture,
} from "@impower/sparkdown/src/attributes/imageFileName";
import { imageStacks, type ImageStack } from "../../utils/imageStacks";
import {
  ALTERNATE,
  optionLabel,
  testerGroups,
  variantOf,
  type ImageVariant,
} from "../../utils/imageVariants";

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
  readonly id: string;
  readonly reference: string;
  readonly base: string;
  readonly name: string;
  readonly note: string | null;
  readonly path: string;
  readonly variant?: ImageVariant;
}

const compare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

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
  const path = picture.path !== undefined && offered.has(picture.path) ? picture.path : files[0]!;
  return {
    id: path,
    reference: picture.name,
    base: picture.name,
    name,
    note: picture.alternate,
    path,
    ...(picture.layers.length ? { variant: restingLook(picture.name) } : {}),
  };
};

const optionCandidates = (stack: ImageStack, base: Candidate): Candidate[] => {
  const group = testerGroups(stack, {}).find((candidate) => candidate.key !== ALTERNATE);
  if (!group) return [];
  return group.options
    .filter((option) => option !== group.default)
    .map((option): Candidate => {
      const variant = variantOf(stack, { [group.key]: option });
      const reference = [variant.image, ...variant.attributes].join(":");
      const layers = group.switch ? [group.key] : [`${group.key}.${option}`];
      const member = stack.members.find(
        (candidate) => candidate.layer !== undefined && layers.includes(candidate.layer.split(" ")[0]!),
      );
      const path = member?.path ?? base.path;
      return {
        id: `${path}#${reference}`,
        reference,
        base: base.base,
        name: base.name,
        note: `${optionLabel(group.key)}: ${optionLabel(option)}`,
        path,
        variant,
      };
    });
};

const imageCandidates = (
  kind: AddMenuKind,
  own: readonly string[],
  offered: ReadonlySet<string>,
) => {
  const things = imageThingsOf(own);
  const stacks = imageStacks(own);
  const folders = stacks.filter((stack) => stack.kind === "folder");
  const shared = sharedNames([
    ...things.flatMap((thing) =>
      thing.pictures.flatMap((picture) =>
        Array<string>(picture.duplicates.length + 1).fill(picture.name),
      ),
    ),
    ...folders.map((stack) => stack.name),
  ]);
  const writable = (candidate: Candidate) =>
    isWritableAssetReference(kind, candidate.reference) && !shared.has(candidate.base);
  const withOptions = (stack: ImageStack | undefined, base: Candidate) =>
    kind === "portrait" && stack && writable(base) ? [base, ...optionCandidates(stack, base)] : [base];
  const stackNamed = (name: string) =>
    stacks.find((stack) => stack.kind === "files" && stack.name === name);
  const candidates = [
    ...things.flatMap((thing) =>
      thing.pictures.flatMap((picture, index) => {
        const base = pictureCandidate(picture, thing.name, offered);
        if (!base) return [];
        return index === 0 ? withOptions(stackNamed(thing.name), base) : [base];
      }),
    ),
    ...folders
      .filter((stack) => stack.paths.some((path) => offered.has(path)))
      .flatMap((stack) =>
        withOptions(stack, {
          id: stack.cover,
          reference: stack.name,
          base: stack.name,
          name: stack.name,
          note: null,
          path: stack.cover,
          variant: restingLook(stack.name),
        }),
      ),
  ];
  return candidates.map((candidate) => ({ candidate, writable: writable(candidate) }));
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
    const shared = sharedNames(own.map((path) => assetNameOf(path, type)));
    return paths.map((path) => {
      const name = assetNameOf(path, type);
      const candidate: Candidate = { id: path, reference: name, base: name, name, note: null, path };
      return { candidate, writable: isWritableAssetReference(kind, name) && !shared.has(name) };
    });
  }
  return imageCandidates(kind, own, new Set(paths));
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
      id: candidate.id,
      reference: candidate.reference,
      name: candidate.name,
      caption: [folder, candidate.note].filter(Boolean).join(" · "),
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
