import { Create } from "../../../core/types/Create";
import { Image } from "../types/Image";

export const _image: Create<Image> = (obj) => ({
  $type: "image",
  src: "",
  data: "",
  ...obj,
});
