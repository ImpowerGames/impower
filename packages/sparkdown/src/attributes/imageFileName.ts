import { byRasterOrder, rasterLayerOfPath } from "./rasterSource";

export interface ImageFileName {
  name: string;
  picture: string;
  alternate: string | null;
  layer?: string;
  order?: number;
}

export interface ImageLayerFile {
  path: string;
  layer: string;
  order?: number;
}

export interface ImagePicture {
  name: string;
  alternate: string | null;
  path?: string;
  duplicates: string[];
  layers: ImageLayerFile[];
  unnumbered: string[];
}

export interface ImageThing {
  name: string;
  pictures: ImagePicture[];
}

const leafOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const ORDERED_LAYER = /^(\d+)_(.+)$/;

export const stemOf = (path: string): string => {
  const leaf = leafOf(path);
  const dot = leaf.lastIndexOf(".");
  return dot > 0 ? leaf.slice(0, dot) : leaf;
};

export const thingNameOf = (name: string): string => name.split(/[@~]/)[0]!;

export const stackBaseOf = (path: string): string => thingNameOf(stemOf(path));

export const stackNameOf = (base: string): string => {
  const dot = base.indexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
};

const layerOf = (part: string): { layer: string; order?: number } => {
  const match = ORDERED_LAYER.exec(part);
  const order = match ? Number(match[1]) : NaN;
  return match && Number.isSafeInteger(order) ? { layer: match[2]!, order } : { layer: part };
};

export const imageFileNameOf = (path: string): ImageFileName => {
  const stem = stemOf(path);
  const cut = rasterLayerOfPath(path) ? -1 : stem.indexOf("~");
  const picture = cut < 0 ? stem : stem.slice(0, cut);
  const at = picture.indexOf("@");
  return {
    name: stackNameOf(picture),
    picture,
    alternate: at < 0 ? null : picture.slice(at + 1),
    ...(cut < 0 ? {} : layerOf(stem.slice(cut + 1))),
  };
};

export const imageMemberOf = (file: ImageFileName): string =>
  file.layer === undefined
    ? file.name
    : `${file.picture}~${file.order === undefined ? "" : `${file.order}_`}${file.layer}`;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const byLayerStacking = (a: ImageLayerFile, b: ImageLayerFile): number => {
  if (a.order !== undefined && b.order !== undefined) {
    return byRasterOrder({ order: a.order, path: a.path }, { order: b.order, path: b.path });
  }
  if (a.order !== undefined || b.order !== undefined) {
    return a.order === undefined ? -1 : 1;
  }
  return compare(leafOf(a.path), leafOf(b.path)) || compare(a.path, b.path);
};

export const imageThingsOf = (paths: Iterable<string>): ImageThing[] => {
  const pictures = new Map<string, ImagePicture>();
  for (const path of paths) {
    if (rasterLayerOfPath(path)) continue;
    const file = imageFileNameOf(path);
    const name = file.name.replaceAll("%40", "@");
    const picture = pictures.get(name) ?? {
      name,
      alternate: name.includes("@") ? name.slice(name.indexOf("@") + 1) : null,
      duplicates: [],
      layers: [],
      unnumbered: [],
    };
    pictures.set(name, picture);
    if (file.layer === undefined) {
      if (picture.path === undefined || compare(path, picture.path) < 0) {
        if (picture.path !== undefined) picture.duplicates.push(picture.path);
        picture.path = path;
      } else {
        picture.duplicates.push(path);
      }
    } else {
      picture.layers.push({ path, layer: file.layer, ...(file.order === undefined ? {} : { order: file.order }) });
    }
  }
  const things = new Map<string, ImageThing>();
  for (const picture of [...pictures.values()].sort((a, b) => compare(a.name, b.name))) {
    picture.duplicates.sort(compare);
    picture.layers.sort(byLayerStacking);
    if (picture.layers.some((layer) => layer.order !== undefined)) {
      picture.unnumbered = picture.layers.filter((layer) => layer.order === undefined).map((layer) => layer.path);
    }
    const thingName = thingNameOf(picture.name);
    const thing = things.get(thingName) ?? { name: thingName, pictures: [] };
    things.set(thingName, thing);
    thing.pictures.push(picture);
  }
  for (const thing of things.values()) {
    thing.pictures.sort((a, b) =>
      a.alternate === null ? -1 : b.alternate === null ? 1 : compare(a.alternate, b.alternate),
    );
  }
  return [...things.values()];
};
