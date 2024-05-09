import { Create } from "../../../core/types/Create";
import { ImageGroup } from "../types/ImageGroup";

export const _imageGroup: Create<ImageGroup> = (obj) => ({
  $type: "image_group",
  assets: [],
  ...obj,
});
