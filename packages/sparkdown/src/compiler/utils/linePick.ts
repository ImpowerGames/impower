import { MORPH_PICK_NONE } from "../../morph/types";
import { getImageOwner } from "./getImageOwner";
import type { ImageLayer } from "./resolveImageLayers";

export const linePick = (
  context: Record<string, any>,
  imageName: string,
  layer: ImageLayer,
  pick: string | undefined,
  speaker: string | undefined,
): string | undefined => {
  const owner = getImageOwner(context, imageName) ?? getImageOwner(context, layer.struct?.$name);
  return owner !== undefined && owner !== speaker ? MORPH_PICK_NONE : pick;
};
