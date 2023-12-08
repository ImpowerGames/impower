import { Create } from "../../types/Create";
import { Asset } from "../Asset";

export const _asset: Create<Asset> = (obj) => ({
  type: "text",
  src: "",
  ...(obj || {}),
});
