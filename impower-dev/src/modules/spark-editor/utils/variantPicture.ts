import { getImageCompositeSrc } from "@impower/sparkdown/src/compiler/utils/getImageComposite";
import { resolveImageLayers } from "@impower/sparkdown/src/compiler/utils/resolveImageLayers";
import type { ImageVariant } from "./imageVariants";

export type ImageContext = { [type: string]: { [name: string]: any } };

export const variantPicture = async (
  context: ImageContext | undefined,
  variant: ImageVariant,
): Promise<string | null> => {
  if (!context) {
    return null;
  }
  const struct = {
    $type: "filtered_image",
    $name: [variant.image, ...variant.attributes].join("~"),
    image: { $name: variant.image },
    attributes: [...variant.attributes],
  };
  const layers = resolveImageLayers(context, struct);
  if (layers.length <= 1) {
    return layers[0]?.src ?? null;
  }
  return (await getImageCompositeSrc(context, struct)) ?? null;
};
