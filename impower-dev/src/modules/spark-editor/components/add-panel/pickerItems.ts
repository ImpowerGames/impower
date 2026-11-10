import {
  addMenuFiles,
  addMenuSubfolder,
  type AddMenuFolders,
  type AddMenuKind,
  ADD_MENU_FILE_TYPES,
} from "../../utils/addMenuFolders";
import {
  imageStacks,
  stackNameOf,
  stemOf,
  type ImageStack,
  type StackGroup,
} from "../../utils/imageStacks";

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

const joined = (...parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join(" · ");

const optionReference = (groups: readonly StackGroup[], group: StackGroup, option: string) => {
  const uses = groups.filter((other) => other.options.includes(option) || other.name === option).length;
  return uses === 1 && option !== "on" && option !== "off" ? option : `${group.name}.${option}`;
};

const backdropItems = (stack: ImageStack, place: string, srcOf: (path: string) => string | undefined) =>
  stack.pictures.map((picture): PickerItem => {
    const path = picture.path ?? picture.layers[0] ?? stack.cover;
    return {
      id: path,
      reference: picture.alternate === null ? stack.name : `${stack.name}@${picture.alternate}`,
      name: stack.name,
      caption: joined(place, picture.alternate),
      path,
      src: srcOf(path),
    };
  });

const portraitItems = (stack: ImageStack, place: string, srcOf: (path: string) => string | undefined) => {
  const base: PickerItem = {
    id: stack.cover,
    reference: stack.name,
    name: stack.name,
    caption: place,
    path: stack.cover,
    src: srcOf(stack.cover),
  };
  const groups = stack.pictures[0]?.groups ?? [];
  const first = groups.find((group) => !group.switch);
  return [
    base,
    ...(first?.options ?? []).map(
      (option): PickerItem => ({
        ...base,
        id: `${stack.cover}#${first!.name}.${option}`,
        reference: `${stack.name}:${optionReference(groups, first!, option)}`,
        caption: joined(place, option),
      }),
    ),
  ];
};

export const pickerItems = (
  kind: AddMenuKind,
  files: readonly PickerFile[],
  folders: AddMenuFolders,
): PickerItem[] => {
  const matched = addMenuFiles(files, kind, folders);
  const placeOf = (path: string) => addMenuSubfolder({ path, type: ADD_MENU_FILE_TYPES[kind] }, folders) ?? "";
  const byPlace = <T>(entries: T[], key: (entry: T) => [string, string]) =>
    entries.sort((a, b) => {
      const [placeA, nameA] = key(a);
      const [placeB, nameB] = key(b);
      return compare(placeA, placeB) || compare(nameA, nameB);
    });
  if (ADD_MENU_FILE_TYPES[kind] === "audio") {
    return byPlace(
      matched.map(
        (file): PickerItem => ({
          id: file.path,
          reference: stackNameOf(stemOf(file.path)),
          name: stackNameOf(stemOf(file.path)),
          caption: placeOf(file.path),
          path: file.path,
          src: file.src,
        }),
      ),
      (item) => [item.caption, item.name],
    );
  }
  const sources = new Map(matched.map((file) => [file.path, file.src]));
  const srcOf = (path: string) => sources.get(path);
  const stacks = byPlace(imageStacks(matched.map((file) => file.path)), (stack) => [
    placeOf(stack.cover),
    stack.name,
  ]);
  return stacks.flatMap((stack) =>
    kind === "portrait"
      ? portraitItems(stack, placeOf(stack.cover), srcOf)
      : backdropItems(stack, placeOf(stack.cover), srcOf),
  );
};

export const lengthLabel = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};
