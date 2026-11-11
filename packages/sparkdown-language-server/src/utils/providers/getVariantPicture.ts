import {
  getImagePreviewSrcComposited,
  type ImageCompositeOptions,
} from "@impower/sparkdown/src/compiler/utils/getImageComposite";

export type ImageContext = { [type: string]: { [name: string]: any } };

export interface ImageVariant {
  image: string;
  attributes: string[];
}

export const getVariantPicture = async (
  context: ImageContext | undefined,
  variant: ImageVariant,
  options?: ImageCompositeOptions,
): Promise<string | null> =>
  context
    ? ((await getImagePreviewSrcComposited(
        context,
        {
          $type: "filtered_image",
          $name: [variant.image, ...variant.attributes].join("~"),
          image: { $name: variant.image },
          attributes: [...variant.attributes],
        },
        options,
      )) ?? null)
    : null;
