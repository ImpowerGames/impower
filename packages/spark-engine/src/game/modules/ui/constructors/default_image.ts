import { Create } from "../../../core/types/Create";
import { Image } from "../types/Image";

export const default_image: Create<Image> = (obj) => ({
  $type: "image",
  $name: "$default",
  src: "",
  data: "",
  ...obj,
});
