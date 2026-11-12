import {
  getImagePreviewSrcComposited,
  type ImageCompositeOptions,
} from "@impower/sparkdown/src/compiler/utils/getImageComposite";
import { resolveImageLayers } from "@impower/sparkdown/src/compiler/utils/resolveImageLayers";

export type ImageContext = { [type: string]: { [name: string]: any } };

export interface ImageVariant {
  image: string;
  attributes: string[];
}

export const getVariantPicture = async (
  context: ImageContext | undefined,
  variant: ImageVariant,
  options?: ImageCompositeOptions,
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
  if (!resolveImageLayers(context, struct).length) {
    return "";
  }
  return (await getImagePreviewSrcComposited(context, struct, options)) ?? null;
};
