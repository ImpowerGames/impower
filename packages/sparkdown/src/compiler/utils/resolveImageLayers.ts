import { filterImage, resolveImageMember, resolveImageRoot } from "./filterImage";
import { resolveImageReference } from "./resolveImageReference";

export interface ImageLayer {
  src: string;
  uri?: string;
  version?: number;
  struct?: any;
}

export const resolveImageLayers = (
  context: { [type: string]: { [name: string]: any } } | undefined,
  struct: any,
  visited = new Set<any>(),
): ImageLayer[] => {
  if (!struct || typeof struct !== "object" || visited.has(struct)) {
    return [];
  }
  visited.add(struct);

  const type = struct["$type"];

  if (type === "image") {
    const filtered = context ? filterImage(context, struct) : {};
    const src = filtered.src || struct["src"] || struct["data"] || struct["uri"];
    const version = /\.url(?:[?#]|$)/i.test(struct["uri"] ?? "")
      ? undefined
      : struct["version"];
    return src ? [{ src, uri: struct["uri"], ...(typeof version === "number" && Number.isFinite(version) && version >= 0 ? { version } : {}), struct }] : [];
  }

  if (type === "filtered_image") {
    const filtered = context ? filterImage(context, struct) : {};
    if (filtered.src) {
      return [{ src: filtered.src, struct }];
    }
    const filteredLayers = filtered.layers;
    if (filteredLayers) {
      const containing = new Set(visited).add(resolveImageRoot(context, struct));
      return filteredLayers.flatMap((layer: unknown) =>
        resolveImageLayers(
          context,
          resolveImageMember(context, layer, containing),
          new Set(containing),
        ),
      );
    }
    return resolveImageLayers(
      context,
      resolveImageReference(context, struct["image"]),
      visited,
    );
  }

  if (type === "layered_image") {
    const assets = (context ? filterImage(context, struct).layers : undefined) ?? struct["assets"];
    const layers = Array.isArray(assets)
      ? assets
      : assets && typeof assets === "object"
        ? Object.values(assets)
        : [];
    return layers.flatMap((layer) =>
      resolveImageLayers(
        context,
        resolveImageMember(context, layer, visited),
        new Set(visited),
      ),
    );
  }

  if (!type) {
    const resolved = resolveImageReference(context, struct);
    if (resolved && resolved !== struct) {
      return resolveImageLayers(context, resolved, visited);
    }
  }
  return [];
};
