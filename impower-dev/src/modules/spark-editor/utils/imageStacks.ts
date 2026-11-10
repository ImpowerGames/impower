import { buildAttributeVocabulary } from "@impower/sparkdown/src/attributes/vocabulary";

export interface StackGroup {
  name: string;
  options: string[];
  switch: boolean;
}

export interface StackPicture {
  alternate: string | null;
  name: string;
  path?: string;
  layers: string[];
  groups: StackGroup[];
  variants: number;
}

export interface ImageStack {
  name: string;
  base: string;
  folder: string;
  paths: string[];
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

const groupsOf = (layers: readonly string[]): StackGroup[] => {
  const vocabulary = buildAttributeVocabulary(
    layers.map((path, index) => {
      const stem = stemOf(path);
      return { key: String(index), name: stem.slice(stem.indexOf("~") + 1) };
    }),
  );
  return Object.entries(vocabulary.groups).map(([name, group]) => ({
    name,
    options: [...group.options],
    switch: group.switch,
  }));
};

const pictureOf = (alternate: string | null, name: string, own: string | undefined, layers: string[]): StackPicture => {
  const groups = groupsOf(layers);
  return {
    alternate,
    name,
    ...(own === undefined ? {} : { path: own }),
    layers,
    groups,
    variants: groups.reduce((count, group) => count * group.options.length, 1),
  };
};

const stackOf = (folder: string, base: string, paths: string[]): ImageStack => {
  const pictures = new Map<string | null, { name: string; own?: string; layers: string[] }>();
  for (const path of paths) {
    const stem = stemOf(path);
    const cut = stem.indexOf("~");
    const name = cut < 0 ? stem : stem.slice(0, cut);
    const at = name.indexOf("@");
    const alternate = at < 0 ? null : name.slice(at + 1);
    const picture = pictures.get(alternate) ?? { name, layers: [] };
    pictures.set(alternate, picture);
    if (cut < 0) picture.own ??= path;
    else picture.layers.push(path);
  }
  const ordered = [...pictures.entries()]
    .sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : compare(a, b)))
    .map(([alternate, picture]) =>
      pictureOf(alternate, picture.name, picture.own, picture.layers.sort(compare)),
    );
  const first = ordered[0]!;
  return {
    name: stackNameOf(base),
    base,
    folder,
    paths,
    pictures: ordered,
    cover: first.path ?? first.layers[0]!,
    variantCount: ordered.reduce((count, picture) => count + picture.variants, 0),
  };
};

export const imageStacks = (paths: readonly string[]): ImageStack[] => {
  const keyOf = (path: string) => `${folderOf(path)}/${stackBaseOf(path)}`;
  const rolled = new Set(
    paths.filter((path) => stackBaseOf(path) && /[@~]/.test(stemOf(path))).map(keyOf),
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
    return stackOf(folderOf(list[0]!), stackBaseOf(list[0]!), list);
  });
};
