import { Create } from "../../../core/types/Create";
import { LayeredImage } from "../types/LayeredImage";

export const _layeredImage: Create<LayeredImage> = (obj) => ({
  $type: "layered_image",
  assets: [],
  ...obj,
});
