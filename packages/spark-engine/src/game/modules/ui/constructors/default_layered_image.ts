import type { Create } from "../../../core/types/Create";
import type { LayeredImage } from "../types/LayeredImage";

export const default_layered_image: Create<LayeredImage> = (obj) => ({
  $type: "layered_image",
  $name: "$default",
  assets: [{ $type: "image", $name: "none" }],
  ...obj,
});
