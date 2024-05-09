import { Create } from "../../../core/types/Create";
import { ImageFilter } from "../types/ImageFilter";

export const _imageFilter: Create<ImageFilter> = (obj) => ({
  $type: "image_filter",
  ...obj,
  includes: obj.includes ?? [],
  excludes: obj.excludes ?? [],
});
