import { filterImage } from "./filterImage";
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
    if (context) filterImage(context, struct);
    const src = struct["filtered_src"] || struct["src"] || struct["data"] || struct["uri"];
    const version = /\.url(?:[?#]|$)/i.test(struct["uri"] ?? "")
      ? undefined
      : struct["version"];
    return src ? [{ src, uri: struct["uri"], ...(typeof version === "number" && Number.isFinite(version) && version >= 0 ? { version } : {}), struct }] : [];
  }

  if (type === "filtered_image") {
    if (context) {
      filterImage(context, struct);
    }
    if (struct["filtered_src"]) {
      return [{ src: struct["filtered_src"], struct }];
    }
    const filteredLayers = struct["filtered_layers"];
    if (filteredLayers) {
      return filteredLayers.flatMap((layer: unknown) =>
        resolveImageLayers(
          context,
          resolveImageReference(context, layer),
          new Set(visited),
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
    if (context) filterImage(context, struct);
    const assets = struct["filtered_layers"] ?? struct["assets"];
    const layers = Array.isArray(assets)
      ? assets
      : assets && typeof assets === "object"
        ? Object.values(assets)
        : [];
    return layers.flatMap((layer) =>
      resolveImageLayers(
        context,
        resolveImageReference(context, layer),
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
