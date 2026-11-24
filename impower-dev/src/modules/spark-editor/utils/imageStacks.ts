import {
  imageThingsOf,
  type ImagePicture,
  type ImageThing,
} from "@impower/sparkdown/src/attributes/imageFileName";
import {
  byRasterStacking,
  rasterLayerInputs,
  rasterLayerOfPath,
} from "@impower/sparkdown/src/attributes/rasterSource";
import type { AttributeLayerInput, AttributeVocabulary } from "@impower/sparkdown/src/attributes/types";
import { evaluateAttributeVisibility } from "@impower/sparkdown/src/attributes/visibility";
import { ATTRIBUTE_ROOT, buildAttributeVocabulary } from "@impower/sparkdown/src/attributes/vocabulary";

export interface StackGroup {
  name: string;
  options: string[];
  switch: boolean;
  default?: string;
}

export interface StackPicture {
  alternate: string | null;
  name: string;
  path?: string;
  layers: string[];
  groups: StackGroup[];
  variants: number;
  vocabulary?: AttributeVocabulary;
}

export interface StackMember {
  path: string;
  alternate: string | null;
  layer?: string;
  order?: number;
  duplicate?: true;
}

export interface ImageStack {
  kind: "files" | "folder";
  name: string;
  folder: string;
  paths: string[];
  members: StackMember[];
  pictures: StackPicture[];
  cover: string;
  variantCount: number;
}

const folderOf = (path: string) => {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
};

const leafOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export const stackFolderOf = (path: string): string => rasterLayerOfPath(path)?.directory ?? folderOf(path);

export const portraitOfFolder = (folder: string): string | undefined => {
  const directory = rasterLayerOfPath(`${folder}/0 layer.png`)?.directory;
  return directory !== undefined && directory !== folder ? directory : undefined;
};

export const AS_IS = "";

export const choicesOf = (group: StackGroup): string[] =>
  group.switch || group.default !== undefined ? group.options : [AS_IS, ...group.options];

const variantsOf = (groups: readonly StackGroup[]): number =>
  groups.reduce((count, group) => count * choicesOf(group).length, 1);

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const restingOptions = (
  vocabulary: AttributeVocabulary,
  selection: Readonly<Record<string, string>> = {},
): Record<string, string> => {
  const { visible } = evaluateAttributeVisibility(vocabulary, { ...selection });
  const depthOf = (key: string): number => {
    let depth = 0;
    for (let parent = vocabulary.folders[key]?.parent; parent !== undefined; parent = vocabulary.folders[parent]?.parent) {
      depth++;
    }
    return depth;
  };
  const resting: Record<string, { option: string; depth: number }> = Object.create(null);
  for (const [key, scope] of Object.entries(vocabulary.folders)) {
    if (key !== ATTRIBUTE_ROOT && !visible[key]) continue;
    const depth = depthOf(key);
    for (const [group, options] of Object.entries(scope.defaults)) {
      const held = resting[group];
      if (options[0] !== undefined && (held === undefined || depth > held.depth)) {
        resting[group] = { option: options[0], depth };
      }
    }
  }
  return Object.fromEntries(Object.entries(resting).map(([group, { option }]) => [group, option]));
};

const groupsOf = (vocabulary: AttributeVocabulary): StackGroup[] => {
  const defaults = restingOptions(vocabulary);
  return Object.entries(vocabulary.groups).map(([name, group]) => {
    const resting = defaults[name];
    return {
      name,
      options: group.switch
        ? ["off", "on"]
        : [...group.options].sort((a, b) =>
            a === resting ? -1 : b === resting ? 1 : compare(a, b),
          ),
      switch: group.switch,
      ...(resting === undefined ? {} : { default: resting }),
    };
  });
};

const pictureOf = (
  alternate: string | null,
  name: string,
  own: string | undefined,
  layers: string[],
  inputs: readonly AttributeLayerInput[],
): StackPicture => {
  const vocabulary = buildAttributeVocabulary(inputs);
  const groups = groupsOf(vocabulary);
  return {
    alternate,
    name,
    ...(own === undefined ? {} : { path: own }),
    layers,
    groups,
    variants: variantsOf(groups),
    ...(inputs.some((input) => input.parent !== undefined) ? { vocabulary } : {}),
  };
};

const flatInputs = (names: readonly string[]): AttributeLayerInput[] =>
  names.map((name, index) => ({ key: String(index), name }));

const membersOf = ({ alternate, path, duplicates, layers }: ImagePicture): StackMember[] => [
  ...(path === undefined ? [] : [{ path, alternate }]),
  ...duplicates.map((duplicate) => ({ path: duplicate, alternate, duplicate: true as const })),
  ...layers.map(({ path: layer, layer: name, order }) => ({
    path: layer,
    alternate,
    layer: name,
    ...(order === undefined ? {} : { order }),
  })),
];

const stackOf = (folder: string, thing: ImageThing): ImageStack => {
  const members = thing.pictures.flatMap(membersOf).sort((a, b) => compare(a.path, b.path));
  const pictures = thing.pictures.map((picture) =>
    pictureOf(
      picture.alternate,
      picture.name,
      picture.path,
      picture.layers.map((layer) => layer.path),
      flatInputs([...picture.layers].sort((a, b) => compare(a.path, b.path)).map((layer) => layer.layer)),
    ),
  );
  const paths = members.map((member) => member.path);
  const first = pictures[0]!;
  return {
    kind: "files",
    name: thing.name,
    folder,
    paths,
    members,
    pictures,
    cover: first.path ?? first.layers[0]!,
    variantCount: pictures.reduce((count, picture) => count + picture.variants, 0),
  };
};

const folderStackOf = (directory: string, paths: string[]): ImageStack => {
  const layers = paths.map((path) => ({ path, layer: rasterLayerOfPath(path)! })).sort(byRasterStacking);
  const members = layers.map(({ path, layer }) => ({
    path,
    alternate: null,
    layer: layer.name,
    order: layer.order,
  }));
  const name = leafOf(directory);
  const picture = pictureOf(
    null,
    name,
    undefined,
    members.map((member) => member.path),
    rasterLayerInputs(layers.map(({ layer }) => layer)),
  );
  return {
    kind: "folder",
    name,
    folder: directory,
    paths,
    members,
    pictures: [picture],
    cover: members.find((member) => folderOf(member.path) === directory)?.path ?? members[0]!.path,
    variantCount: picture.variants,
  };
};

export const isStacked = (stack: ImageStack): boolean =>
  stack.kind === "folder" ||
  stack.paths.length > 1 ||
  stack.pictures[0]!.alternate !== null ||
  stack.pictures[0]!.layers.length > 0;

export const imageStacks = (paths: readonly string[]): ImageStack[] => {
  const sorted = [...paths].sort(compare);
  const folders = new Map<string, { layers: string[]; files: string[] }>();
  for (const path of sorted) {
    const folder = folders.get(stackFolderOf(path)) ?? { layers: [], files: [] };
    folders.set(stackFolderOf(path), folder);
    (rasterLayerOfPath(path) ? folder.layers : folder.files).push(path);
  }
  const stackFor = new Map<string, ImageStack>();
  for (const [folder, { layers, files }] of folders) {
    if (layers.length) {
      const stack = folderStackOf(folder, layers);
      for (const path of layers) stackFor.set(path, stack);
    }
    for (const thing of imageThingsOf(files)) {
      const stack = stackOf(folder, thing);
      for (const path of stack.paths) stackFor.set(path, stack);
    }
  }
  return [...new Set(sorted.map((path) => stackFor.get(path)!))];
};
