import { Asset } from "../Asset";
import { _asset } from "./_asset";

export const IMAGE_DEFAULTS: Record<string, Asset> = {
  default: _asset({ type: "image" }),
};
