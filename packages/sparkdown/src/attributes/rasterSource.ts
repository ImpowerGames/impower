import type { File } from "../compiler/types/File";
import { buildAttributeVocabulary } from "./index";

const RASTER_EXTENSION = /^(?:png|webp|jpe?g|gif|avif|bmp)$/i;

const rasterLayer = (file: File) => {
  if (file.type !== "image" || !RASTER_EXTENSION.test(file.ext)) return undefined;
  let path: string;
  try {
    path = decodeURIComponent(new URL(file.uri).pathname);
  } catch {
    return undefined;
  }
  const parts = path.split("/");
  const filename = parts.pop() ?? "";
  const folder = parts.at(-1);
  if (!folder || folder === "assets" || !parts.includes("assets")) return undefined;
  const match = /^(\d+)_(.+)\.[^.]+$/.exec(filename);
  if (!match) return undefined;
  const order = Number(match[1]);
  if (!Number.isSafeInteger(order)) return undefined;
  return { folder, directory: parts.join("/"), order, name: match[2]! };
};

export const isRasterLayerFile = (file: File): boolean => Boolean(rasterLayer(file));

/** Assets are bottom-first; a lower export index paints above a higher one. */
export const createRasterImageDefinitions = (files: readonly File[]) => {
  const folders = new Map<string, { file: File; layer: NonNullable<ReturnType<typeof rasterLayer>> }[]>();
  for (const file of files) {
    const layer = rasterLayer(file);
    if (!layer) continue;
    const list = folders.get(layer.directory) ?? [];
    list.push({ file, layer });
    folders.set(layer.directory, list);
  }
  const images: Record<string, any> = Object.create(null);
  const layeredImages: Record<string, any> = Object.create(null);
  for (const [directory, files] of folders) {
    files.sort((a, b) => b.layer.order - a.layer.order || a.file.uri.localeCompare(b.file.uri));
    const folder = files[0]!.layer.folder;
    const assets = files.map(({ file }) => {
      const name = `$raster:${file.uri}`;
      images[name] = { ...file, $type: "image", $name: name };
      return { $type: "image", $name: name };
    });
    const vocabulary = buildAttributeVocabulary(files.map(({ layer }, index) => ({
      key: String(index), name: layer.name,
    })));
    layeredImages[folder] = {
      $type: "layered_image",
      $name: folder,
      uri: directory,
      assets,
      attribute_vocabulary: vocabulary,
    };
  }
  return { images, layeredImages };
};
