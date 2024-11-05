import { Create } from "../../../core/types/Create";
import { LayeredImage } from "../types/LayeredImage";
import { Image } from "../types/Image";

export const default_layered_image: Create<LayeredImage> = (obj) => ({
  $type: "layered_image",
  $name: "$default",
  layers: [] as Image[],
  ...obj,
});
