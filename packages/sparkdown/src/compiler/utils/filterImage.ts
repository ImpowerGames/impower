import { buildFilteredSrc } from "../../filters/filteredSvg";
import { filterMatchesName } from "./filterMatchesName";
import { filterSVG } from "./filterSVG";

const getNestedFilters = (
  name: string,
  context: { [type: string]: { [name: string]: any } },
  // `a -> b -> a` would otherwise recurse until the stack blows. The
  // self-reference check below only catches a chain of length one.
  seen = new Set<string>(),
): { includes: unknown[]; excludes: unknown[] }[] => {
  const filteredImage = context?.["filtered_image"]?.[name];
  if (filteredImage && !seen.has(name)) {
    seen.add(name);
    const filters: { includes: unknown[]; excludes: unknown[] }[] =
      filteredImage?.["filters"]?.map?.(
        (reference: { $type: "filtered_image"; $name: string }) =>
          context?.["filter"]?.[reference?.$name],
      ) || [];
    const imageToFilterName = filteredImage?.["image"]?.["$name"];
    if (imageToFilterName !== name) {
      filters.push(...getNestedFilters(imageToFilterName, context, seen));
    }
    return filters;
  }
  return [];
};

const getRootImage = (
  name: string,
  context: { [type: string]: { [name: string]: any } },
  stack: Set<{ $type: string; $name: string }>,
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
  filteredImage: any,
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
      stack,
    );
    if (imageToFilter) {
      if (imageToFilter === "circular") {
        return `${filteredImage.$type}.${filteredImage.$name}.image`;
      } else {
        if (
          imageToFilter.$type === "image" &&
          !imageToFilter.$name.startsWith("$")
        ) {
          // Structs are carried across incremental compiles by identity, so a
          // root that flipped from layered_image to image would otherwise keep
          // the layer set derived when it was still layered, and consumers
          // would draw it alongside the fresh `filtered_src`. (The reverse
          // flip stays stale: `filtered_src` is already set by then, so the
          // early-out above means this never re-runs.)
          filteredImage.filtered_layers = undefined;
          if (imageToFilter.data) {
            filteredImage.filtered_src = filterSVG(
              imageToFilter.data,
              combinedFilter,
            );
          } else {
            // stripImageData host (#299): the root's SVG source is not
            // inlined; resolve to an on-demand URL that the service worker
            // filters lazily. Falls back to the PLAIN root src for remote or
            // raster roots and for no-op filters (an unfiltered image beats
            // no image).
            const filteredSrc = buildFilteredSrc(imageToFilter, combinedFilter);
            if (filteredSrc) {
              filteredImage.filtered_src = filteredSrc;
            }
          }
        }
        if (
          imageToFilter.$type === "layered_image" &&
          !imageToFilter.$name.startsWith("$")
        ) {
          // `filtered_layers` is the set of layers to DRAW, so it accumulates
          // the layers the filter does NOT match: `filterMatchesName` selects
          // what gets filtered OUT (`filterSVG` deletes the nodes it matches).
          // Layers that aren't filterable, and `default` ones, never match and
          // so always survive — which is what makes a filter-less
          // `filtered_image` show exactly the default layers.
          // One array across every layer, so it outlives a single iteration.
          const filteredLayers: {
            $type: "image";
            $name: string;
          }[] = [];
          // `assets` is absent on a malformed or still-being-typed
          // layered_image, and this runs on every hover and preview — guard so
          // one incomplete struct doesn't throw out of the whole compile.
          for (const [key, layerImage] of Object.entries(
            imageToFilter.assets ?? {},
          )) {
            const keyIsArrayIndex = !Number.isNaN(Number(key));
            // Positional entries carry no key to match on, so the layer's own
            // name is the subject; a keyed table names each layer by its key.
            const layerName = keyIsArrayIndex ? layerImage.$name : key;
            if (!filterMatchesName(layerName, combinedFilter)) {
              filteredLayers.push(layerImage);
            }
          }
          filteredImage.filtered_layers = filteredLayers;
        }
      }
    }
  }
  return undefined;
};
