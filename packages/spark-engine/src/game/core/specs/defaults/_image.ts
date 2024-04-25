import { Asset } from "../../types/Asset";
import { Create } from "../../types/Create";

export const _image: Create<Asset> = (obj) => ({
  $type: "image",
  src: "",
  ...obj,
});
