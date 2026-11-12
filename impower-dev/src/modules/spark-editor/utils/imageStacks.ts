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
}

export interface ImageStack {
  kind: "files" | "folder";
  name: string;
  base: string;
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

export const stemOf = (path: string): string => {
  const leaf = leafOf(path);
  const dot = leaf.lastIndexOf(".");
  return dot > 0 ? leaf.slice(0, dot) : leaf;
};

export const stackBaseOf = (path: string): string => stemOf(path).split(/[@~]/)[0]!;

export const stackNameOf = (base: string): string => {
  const dot = base.indexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
};

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
      options: [...group.options],
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
    variants: groups.reduce((count, group) => count * group.options.length, 1),
  };
};

const memberOf = (path: string): StackMember => {
  const stem = stemOf(path);
  const cut = stem.indexOf("~");
  const name = cut < 0 ? stem : stem.slice(0, cut);
  const at = name.indexOf("@");
  return {
    path,
    alternate: at < 0 ? null : name.slice(at + 1),
    ...(cut < 0 ? {} : { layer: stem.slice(cut + 1) }),
  };
};

const stackOf = (folder: string, base: string, paths: string[]): ImageStack => {
  const members = paths.map(memberOf);
  const pictures = new Map<string | null, { name: string; own?: string; layers: StackMember[] }>();
  for (const member of members) {
    const stem = stemOf(member.path);
    const cut = stem.indexOf("~");
    const name = cut < 0 ? stem : stem.slice(0, cut);
    const picture = pictures.get(member.alternate) ?? { name, layers: [] };
    pictures.set(member.alternate, picture);
    if (member.layer === undefined) picture.own ??= member.path;
    else picture.layers.push(member);
  }
  const ordered = [...pictures.entries()]
    .sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : compare(a, b)))
    .map(([alternate, picture]) => {
      const layers = picture.layers.sort((a, b) => compare(a.path, b.path));
      return pictureOf(
        alternate,
        picture.name,
        picture.own,
        layers.map((layer) => layer.path),
        layers.map((layer) => layer.layer!),
      );
    });
  const first = ordered[0]!;
  return {
    kind: "files",
    name: stackNameOf(base),
    base,
    folder,
    paths,
    members,
    pictures: ordered,
    cover: first.path ?? first.layers[0]!,
    variantCount: ordered.reduce((count, picture) => count + picture.variants, 0),
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
    base: name,
    folder: directory,
    paths,
    members,
    pictures: [picture],
    cover: members[0]!.path,
    variantCount: picture.variants,
  };
};

export const isStacked = (stack: ImageStack): boolean =>
  stack.kind === "folder" || stack.paths.length > 1 || stemOf(stack.cover) !== stack.base;

export const imageStacks = (paths: readonly string[]): ImageStack[] => {
  const layered = (path: string) => rasterLayerOfPath(path) !== undefined;
  const keyOf = (path: string) =>
    layered(path) ? `${folderOf(path)}/` : `${folderOf(path)}/${stackBaseOf(path)}`;
  const rolled = new Set(
    paths
      .filter((path) => layered(path) || (stackBaseOf(path) && /[@~]/.test(stemOf(path))))
      .map(keyOf),
  );
  const members = new Map<string, string[]>();
  const stacks: (ImageStack | string)[] = [];
  for (const path of [...paths].sort(compare)) {
    const key = keyOf(path);
    if (!rolled.has(key)) {
      stacks.push(stackOf(folderOf(path), stemOf(path), [path]));
      continue;
    }
    const list = members.get(key);
    if (list) list.push(path);
    else {
      members.set(key, [path]);
      stacks.push(key);
    }
  }
  return stacks.map((entry) => {
    if (typeof entry !== "string") return entry;
    const list = members.get(entry)!;
    return layered(list[0]!)
      ? folderStackOf(folderOf(list[0]!), list)
      : stackOf(folderOf(list[0]!), stackBaseOf(list[0]!), list);
  });
};
