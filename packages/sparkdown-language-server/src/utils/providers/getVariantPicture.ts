import {
  getImagePreviewSrcComposited,
  type ImageCompositeOptions,
} from "@impower/sparkdown/src/compiler/utils/getImageComposite";
import { resolveImageRoot } from "@impower/sparkdown/src/compiler/utils/filterImage";
import { resolveImageLayers } from "@impower/sparkdown/src/compiler/utils/resolveImageLayers";

export type ImageContext = { [type: string]: { [name: string]: any } };

export interface ImageVariant {
  image: string;
  attributes: string[];
}

export interface VariantPicture {
  src: string;
  layers: (string | null)[];
}

export const getVariantPicture = async (
  context: ImageContext | undefined,
  variant: ImageVariant,
  options?: ImageCompositeOptions,
): Promise<VariantPicture | null> => {
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
    return { src: "", layers: [] };
  }
  const shown = options?.shownLayers ? options.shownLayers(context, struct) : resolveImageLayers(context, struct);
  const src = await getImagePreviewSrcComposited(context, struct, options);
  return src === undefined
    ? null
    : { src, layers: shown.map((layer) => layer.uri ?? resolveImageRoot(context, layer.struct)?.uri ?? null) };
};
