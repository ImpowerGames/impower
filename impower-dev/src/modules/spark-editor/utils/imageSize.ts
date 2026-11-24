import type { ImageSize } from "@impower/sparkdown/src/workspace/utils/imageSize";

export type TileShapeName = "portrait" | "landscape";

export const majorityShape = (sizes: readonly (ImageSize | undefined)[]): TileShapeName => {
  const known = sizes.filter((size): size is ImageSize => !!size);
  const tall = known.filter((size) => size.height > size.width).length;
  return tall * 2 > known.length ? "portrait" : "landscape";
};
