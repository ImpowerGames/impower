import { MORPH_PICK_NONE } from "../../morph/types";
import { getImageOwner } from "./getImageOwner";
import { resolveImageLayers } from "./resolveImageLayers";
import { resolveImageReference } from "./resolveImageReference";

export const linePick = (
  context: Record<string, any>,
  imageNames: readonly string[],
  pick: string | undefined,
  speaker: string | undefined,
): string | undefined => {
  const owners = imageNames.flatMap((imageName) => {
    const owner = getImageOwner(context, imageName);
    if (owner) {
      return [owner];
    }
    const image = resolveImageReference(context, { $type: "", $name: imageName });
    return resolveImageLayers(context, image).flatMap(
      (layer) => getImageOwner(context, layer.struct?.$name) ?? [],
    );
  });
  return owners.length > 0 &&
    (speaker === undefined || !owners.includes(speaker))
    ? MORPH_PICK_NONE
    : pick;
};
