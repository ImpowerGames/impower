import { Asset } from "../../types/Asset";
import { Create } from "../../types/Create";

export const _asset: Create<Asset> = (obj) => ({
  type: "text",
  src: "",
  ...(obj || {}),
});
