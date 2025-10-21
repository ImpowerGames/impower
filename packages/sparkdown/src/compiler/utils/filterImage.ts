import { filterMatchesName } from "./filterMatchesName";
import { filterSVG } from "./filterSVG";

const getNestedFilters = (
  name: string,
  context: { [type: string]: { [name: string]: any } }
): { includes: unknown[]; excludes: unknown[] }[] => {
  const filteredImage = context?.["filtered_image"]?.[name];
  if (filteredImage) {
    const filters: { includes: unknown[]; excludes: unknown[] }[] =
      filteredImage?.["filters"]?.map?.(
        (reference: { $type: "filtered_image"; $name: string }) =>
          context?.["filter"]?.[reference?.$name]
      ) || [];
    const imageToFilterName = filteredImage?.["image"]?.["$name"];
    if (imageToFilterName !== name) {
      filters.push(...getNestedFilters(imageToFilterName, context));
    }
    return filters;
  }
  return [];
};

const getRootImage = (
  name: string,
  context: { [type: string]: { [name: string]: any } },
  stack: Set<{ $type: string; $name: string }>
):
  | { $type: "image"; $name: string; src: string; data: string }
  | {
      $type: "layered_image";
      $name: string;
      assets: Record<string, { $type: "image"; $name: string }>;
    }
  | "circular"
  | undefined => {
  const image = context?.["image"]?.[name];
  if (image) {
    return image;
  }
  const layeredImage = context?.["layered_image"]?.[name];
  if (layeredImage) {
    return layeredImage;
  }
  const filteredImage = context?.["filtered_image"]?.[name];
  if (filteredImage) {
    if (stack.has(filteredImage)) {
      return "circular";
    }
    stack.add(filteredImage);
    return getRootImage(filteredImage?.["image"]?.["$name"], context, stack);
  }
  return undefined;
};

export const filterImage = (
  context: { [type: string]: { [name: string]: any } },
  filteredImage: any
): string | undefined => {
  if (filteredImage && !filteredImage.filtered_src) {
    const filters = getNestedFilters(filteredImage.$name, context);
    const includes = filters.flatMap((filter) => filter?.includes || []);
    const excludes = filters.flatMap((filter) => filter?.excludes || []);
    const combinedFilter = {
      includes,
      excludes,
    };
    const stack = new Set<{ $type: string; $name: string }>();
    const imageToFilter = getRootImage(
      filteredImage?.image?.$name,
      context,
      stack
    );
    if (imageToFilter) {
      if (imageToFilter === "circular") {
        return `${filteredImage.$type}.${filteredImage.$name}.image`;
      } else {
        if (
          imageToFilter.$type === "image" &&
          !imageToFilter.$name.startsWith("$")
        ) {
          if (imageToFilter.data) {
            filteredImage.filtered_src = filterSVG(
              imageToFilter.data,
              combinedFilter
            );
          }
        }
        if (
          imageToFilter.$type === "layered_image" &&
          !imageToFilter.$name.startsWith("$")
        ) {
          for (const [key, layerImage] of Object.entries(
            imageToFilter.assets
          )) {
            const filteredLayers: {
              $type: "image";
              $name: string;
            }[] = [];
            const keyIsArrayIndex = !Number.isNaN(Number(key));
            if (keyIsArrayIndex) {
              if (filterMatchesName(layerImage.$name, combinedFilter)) {
                filteredLayers.push(layerImage);
              }
            } else {
              if (filterMatchesName(key, combinedFilter)) {
                filteredLayers.push(layerImage);
              }
            }
            filteredImage.filtered_layers = filteredLayers;
          }
        }
      }
    }
  }
  return undefined;
};
