import { rasterLayerOfPath } from "./rasterSource";

export interface ImageFileName {
  name: string;
  picture: string;
  alternate: string | null;
  layer?: string;
}

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

export const imageFileNameOf = (path: string): ImageFileName => {
  const stem = stemOf(path);
  const cut = rasterLayerOfPath(path) ? -1 : stem.indexOf("~");
  const picture = cut < 0 ? stem : stem.slice(0, cut);
  const at = picture.indexOf("@");
  return {
    name: stackNameOf(picture),
    picture,
    alternate: at < 0 ? null : picture.slice(at + 1),
    ...(cut < 0 ? {} : { layer: stem.slice(cut + 1) }),
  };
};

export const imageMemberOf = (file: ImageFileName): string =>
  file.layer === undefined ? file.name : `${file.picture}~${file.layer}`;
