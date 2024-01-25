import { Layer } from "../Layer";
import { _layer } from "./_layer";

export const IMAGE_LAYER_DEFAULTS: Record<string, Layer> = {
  default: _layer(),
  backdrop: _layer({ preserve: true }),
};
