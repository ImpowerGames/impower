import { Create } from "../../../core/types/Create";
import { LayeredImage } from "../types/LayeredImage";

export const default_layered_image: Create<LayeredImage> = (obj) => ({
  $type: "layered_image",
  $name: "$default",
  layers: [{ $type: "image", $name: "none" }],
  ...obj,
});
