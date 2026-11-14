import {
  imageThingsOf,
  type ImagePicture,
  type ImageThing,
} from "@impower/sparkdown/src/attributes/imageFileName";
import { byRasterOrder, rasterLayerOfPath } from "@impower/sparkdown/src/attributes/rasterSource";
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

export const AS_IS = "";

export const choicesOf = (group: StackGroup): string[] =>
  group.switch || group.default !== undefined ? group.options : [AS_IS, ...group.options];

const variantsOf = (groups: readonly StackGroup[]): number =>
  groups.reduce((count, group) => count * choicesOf(group).length, 1);

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const groupsOf = (names: readonly string[]): StackGroup[] => {
  const vocabulary = buildAttributeVocabulary(
    names.map((name, index) => ({ key: String(index), name })),
  );
  const defaults = vocabulary.folders[ATTRIBUTE_ROOT]!.defaults;
  return Object.entries(vocabulary.groups).map(([name, group]) => {
    const resting = defaults[name]?.[0];
    return {
      name,
      options: group.switch
        ? [...group.options]
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
  names: readonly string[],
): StackPicture => {
  const groups = groupsOf(names);
  return {
    alternate,
    name,
    ...(own === undefined ? {} : { path: own }),
    layers,
    groups,
    variants: variantsOf(groups),
  };
};

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
      [...picture.layers].sort((a, b) => compare(a.path, b.path)).map((layer) => layer.layer),
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
  const members = paths
    .map((path) => {
      const layer = rasterLayerOfPath(path)!;
      return { path, alternate: null, layer: layer.name, order: layer.order };
    })
    .sort((a, b) => byRasterOrder(a, b));
  const name = leafOf(directory);
  const picture = pictureOf(
    null,
    name,
    undefined,
    members.map((member) => member.path),
    members.map((member) => member.layer),
  );
  return {
    kind: "folder",
    name,
    folder: directory,
    paths,
    members,
    pictures: [picture],
    cover: members[0]!.path,
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
    const folder = folders.get(folderOf(path)) ?? { layers: [], files: [] };
    folders.set(folderOf(path), folder);
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
