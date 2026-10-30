import { filterImage } from "./filterImage";
import { resolveImageReference } from "./resolveImageReference";

export const getImagePreviewSrc = (
  context: { [type: string]: { [name: string]: any } } | undefined,
  struct: any,
  visited = new Set<any>(),
): string | undefined => {
  if (!struct || typeof struct !== "object") {
    return undefined;
  }
  if (visited.has(struct)) {
    return undefined;
  }
  visited.add(struct);

  const type = struct["$type"];

  if (type === "image") {
    if (context && struct.attribute_vocabulary) {
      filterImage(context, struct);
      if (struct.filtered_src) return struct.filtered_src;
    }
    return struct["src"] || struct["data"] || struct["uri"] || undefined;
  }

  if (type === "filtered_image") {
    if (context) {
      filterImage(context, struct);
    }
    if (struct["filtered_src"]) {
      return struct["filtered_src"];
    }
    const filteredLayers = struct["filtered_layers"];
    if (filteredLayers) {
      for (const layer of filteredLayers) {
        const src = getImagePreviewSrc(
          context,
          resolveImageReference(context, layer),
          visited,
        );
        if (src) {
          return src;
        }
      }
      return undefined;
    }
    return getImagePreviewSrc(
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
    for (const layer of layers) {
      const src = getImagePreviewSrc(
        context,
        resolveImageReference(context, layer),
        visited,
      );
      if (src) {
        return src;
      }
    }
    return undefined;
  }

  if (!type) {
    const resolved = resolveImageReference(context, struct);
    if (resolved && resolved !== struct) {
      return getImagePreviewSrc(context, resolved, visited);
    }
  }
  return undefined;
};

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export const IMAGE_PREVIEW_HEIGHT = 180;

// workaround(vscode): the markdown sanitizer drops the style attribute, so the thumbnail height is also written as an HTML height attribute
export const buildImagePreviewMarkup = (src: string, name: string): string =>
  `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(
    name,
  )}" height="${IMAGE_PREVIEW_HEIGHT}" style="height:${IMAGE_PREVIEW_HEIGHT}px" />`;

export const getImagePreviewMarkup = (
  context: { [type: string]: { [name: string]: any } } | undefined,
  struct: any,
): string | undefined => {
  const src = getImagePreviewSrc(context, struct);
  if (!src) {
    return undefined;
  }
  const name = struct?.["$name"] ?? "";
  return buildImagePreviewMarkup(src, name);
};
