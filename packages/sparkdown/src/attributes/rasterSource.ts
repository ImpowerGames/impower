import type { File } from "../compiler/types/File";
import { buildAttributeVocabulary } from "./index";
import type { AttributeDiagnostic, AttributeLayerInput, AttributeVocabulary } from "./types";
import { ATTRIBUTE_ROOT } from "./vocabulary";

const RASTER_EXTENSION = /^(?:png|webp|jpe?g|gif|avif|bmp)$/i;

export interface RasterLayerFolder {
  segment: string;
  order: number;
  name: string;
}

export interface RasterLayerPath {
  folder: string;
  directory: string;
  order: number;
  name: string;
  folders: RasterLayerFolder[];
}

const isAssets = (part: string) => part.toLowerCase() === "assets";

const numberedFolderOf = (segment: string): RasterLayerFolder | undefined => {
  const match = /^(\d+) (.+)$/.exec(segment.replaceAll("%20", " "));
  const order = match ? Number(match[1]) : NaN;
  return match && Number.isSafeInteger(order) ? { segment, order, name: match[2]! } : undefined;
};

const layerFileOf = (filename: string): { order: number; name: string } | undefined => {
  const match = /^(\d+) (.+)\.([^.]+)$/.exec(filename.replaceAll("%20", " "));
  if (!match || !RASTER_EXTENSION.test(match[3]!)) return undefined;
  const order = Number(match[1]);
  return Number.isSafeInteger(order) ? { order, name: match[2]! } : undefined;
};

const placeOf = (path: string) => {
  const parts = path.split("/");
  const filename = parts.pop() ?? "";
  const folders: RasterLayerFolder[] = [];
  let index = parts.length - 1;
  for (; index >= 0; index--) {
    const folder = numberedFolderOf(parts[index]!);
    if (!folder) break;
    folders.unshift(folder);
  }
  return { parts, filename, index, folders };
};

export const rasterLayerOfPath = (path: string): RasterLayerPath | undefined => {
  const { parts, filename, index, folders } = placeOf(path);
  const layer = layerFileOf(filename);
  const folder = parts[index];
  if (!layer || !folder || isAssets(folder) || !parts.slice(0, index).some(isAssets)) return undefined;
  return { folder, directory: parts.slice(0, index + 1).join("/"), ...layer, folders };
};

export const strayLayerFolderOf = (path: string): string | undefined => {
  const { parts, filename, index, folders } = placeOf(path);
  if (!folders.length || !layerFileOf(filename) || index < 0 || !isAssets(parts[index]!)) return undefined;
  return folders[0]!.segment.replaceAll("%20", " ");
};

export const byRasterOrder = (
  a: { order: number; path: string },
  b: { order: number; path: string },
): number => b.order - a.order || a.path.localeCompare(b.path);

const pathOfFile = (file: File): string | undefined => {
  if (file.type !== "image" || !RASTER_EXTENSION.test(file.ext)) return undefined;
  try {
    return decodeURIComponent(new URL(file.uri).pathname);
  } catch {
    return undefined;
  }
};

export const rasterLayerOfFile = (file: File): RasterLayerPath | undefined => {
  const path = pathOfFile(file);
  return path === undefined ? undefined : rasterLayerOfPath(path);
};

export const isRasterLayerFile = (file: File): boolean => Boolean(rasterLayerOfFile(file));

interface RasterEntry {
  file: File;
  layer: RasterLayerPath;
  filename: string;
}

export interface RasterStackItem {
  path: string;
  layer: RasterLayerPath;
}

const folderKeyOf = (layer: RasterLayerPath, depth: number): string =>
  layer.folders.slice(0, depth).map((folder) => folder.segment).join("/");

const stackItemOf = ({ path, layer }: RasterStackItem, depth: number) => {
  const below = layer.folders.length - depth;
  const folder = layer.folders[depth];
  return folder
    ? { segment: folder.segment, order: folder.order, path: path.split("/").slice(0, -below).join("/") }
    : { segment: undefined, order: layer.order, path };
};

export const byRasterStacking = (a: RasterStackItem, b: RasterStackItem): number => {
  for (let depth = 0; ; depth++) {
    const x = stackItemOf(a, depth);
    const y = stackItemOf(b, depth);
    if (x.segment === undefined || x.segment !== y.segment) return byRasterOrder(x, y);
  }
};

export const byRasterStackingTopFirst = (a: RasterStackItem, b: RasterStackItem): number => byRasterStacking(b, a);

export const rasterLayerInputs = (
  layers: readonly RasterLayerPath[],
  onFolder: (key: string, folder: RasterLayerFolder, index: number) => void = () => {},
): AttributeLayerInput[] => {
  const inputs: AttributeLayerInput[] = [];
  const seen = new Set<string>();
  layers.forEach((layer, index) => {
    for (let depth = 1; depth <= layer.folders.length; depth++) {
      const key = folderKeyOf(layer, depth);
      if (seen.has(key)) continue;
      seen.add(key);
      const folder = layer.folders[depth - 1]!;
      onFolder(key, folder, index);
      inputs.push({ key, name: folder.name, ...(depth > 1 ? { parent: folderKeyOf(layer, depth - 1) } : {}) });
    }
    inputs.push({ key: String(index), name: layer.name, ...(layer.folders.length ? { parent: folderKeyOf(layer, layer.folders.length) } : {}) });
  });
  return inputs;
};

const conflictingDefaults = (
  portrait: string,
  vocabulary: AttributeVocabulary,
  diagnostic: AttributeDiagnostic,
  labels: Map<string, { label: string; firstFile: string }>,
): AttributeDiagnostic[] => {
  const scope = diagnostic.path === ATTRIBUTE_ROOT ? portrait : labels.get(diagnostic.path!)?.label ?? portrait;
  const marked = vocabulary.layers.filter((layer) =>
    layer.parent === diagnostic.path && layer.parsed.default &&
    layer.parsed.conditions.some((condition) => condition.group === diagnostic.group));
  const names = marked.map((layer) => labels.get(layer.key)!.label);
  const where = scope === portrait ? `Portrait folder "${portrait}"` : `Folder "${scope}" in portrait "${portrait}"`;
  return marked.map((layer) => ({
    ...diagnostic,
    path: labels.get(layer.key)!.firstFile,
    folder: scope,
    message: `${where} marks more than one default for ${diagnostic.group}: ${names.join(", ")}. Keep default on one of them.`,
  }));
};

export const createRasterImageDefinitions = (files: readonly File[]) => {
  const portraits = new Map<string, RasterEntry[]>();
  const strays: { file: File; folder: string; filename: string }[] = [];
  for (const file of files) {
    const path = pathOfFile(file);
    if (path === undefined) continue;
    const filename = path.slice(path.lastIndexOf("/") + 1);
    const layer = rasterLayerOfPath(path);
    if (!layer) {
      const stray = strayLayerFolderOf(path);
      if (stray !== undefined) strays.push({ file, folder: stray, filename });
      continue;
    }
    const list = portraits.get(layer.directory) ?? [];
    list.push({ file, layer, filename });
    portraits.set(layer.directory, list);
  }
  const ownerOf = (directory: string): { portrait: string; folder?: string } | undefined => {
    const { parts, index, folders } = placeOf(`${directory}/`);
    const entries = portraits.get(parts.slice(0, index + 1).join("/"));
    if (!entries) return undefined;
    const folder = folders.at(-1)?.segment.replaceAll("%20", " ");
    return { portrait: entries[0]!.layer.folder, ...(folder === undefined ? {} : { folder }) };
  };
  const images: Record<string, any> = Object.create(null);
  const layeredImages: Record<string, any> = Object.create(null);
  const origins: Record<string, string> = Object.create(null);
  const collisions: { name: string; firstUri: string; otherUri: string }[] = [];
  const diagnostics: { uri: string; folder: string; message: string }[] = [];
  for (const [directory, entries] of [...portraits].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    entries.sort((a, b) => byRasterStacking({ path: a.file.uri, layer: a.layer }, { path: b.file.uri, layer: b.layer }));
    const portrait = entries[0]!.layer.folder;
    const enclosing = ownerOf(directory.slice(0, directory.lastIndexOf("/")));
    if (enclosing) {
      const around = enclosing.folder === undefined
        ? `portrait folder "${enclosing.portrait}"`
        : `folder "${enclosing.folder}" of portrait "${enclosing.portrait}"`;
      for (const { file } of entries) {
        diagnostics.push({ uri: file.uri, folder: portrait,
          message: `Folder "${portrait}" sits in ${around} but is not a layer of "${enclosing.portrait}", so it is read as a portrait of its own. To make it a layer of "${enclosing.portrait}", start its name with a number and a space, as in "10 ${portrait}".`,
        });
      }
    }
    if (Object.hasOwn(origins, portrait)) {
      collisions.push({ name: portrait, firstUri: origins[portrait]!, otherUri: entries[0]!.file.uri });
      continue;
    }
    origins[portrait] = entries[0]!.file.uri;
    const labels = new Map<string, { label: string; firstFile: string }>();
    const inputs = rasterLayerInputs(entries.map((entry) => entry.layer), (key, folder, index) =>
      labels.set(key, { label: folder.segment.replaceAll("%20", " "), firstFile: String(index) }));
    const assets = entries.map(({ file, filename }, index) => {
      const key = String(index);
      labels.set(key, { label: filename, firstFile: key });
      const name = `$raster:${file.uri}`;
      images[name] = { ...file, $type: "image", $name: name };
      return { $type: "image", $name: name };
    });
    const vocabulary = buildAttributeVocabulary(inputs);
    vocabulary.diagnostics = vocabulary.diagnostics.flatMap((diagnostic) =>
      diagnostic.code === "conflicting-defaults"
        ? conflictingDefaults(portrait, vocabulary, diagnostic, labels)
        : [diagnostic],
    );
    layeredImages[portrait] = {
      $type: "layered_image",
      $name: portrait,
      uri: directory,
      assets,
      attribute_vocabulary: vocabulary,
    };
  }
  for (const { file, folder, filename } of strays) {
    diagnostics.push({ uri: file.uri, folder,
      message: `Raster file "${filename}" is in folder "${folder}", which sits directly in assets and not in a portrait folder, so it is neither a layer nor a portrait. Move "${folder}" into a portrait folder to make it a layer of that portrait.`,
    });
  }
  for (const file of files) {
    const path = pathOfFile(file);
    if (path === undefined || rasterLayerOfPath(path)) continue;
    const slash = path.lastIndexOf("/");
    const owner = ownerOf(path.slice(0, slash));
    if (!owner) continue;
    const filename = path.slice(slash + 1);
    const where = owner.folder === undefined ? "" : ' in folder "' + owner.folder + '"';
    diagnostics.push({ uri: file.uri, folder: owner.portrait,
      message: 'Raster file "' + filename + '"' + where + ' is omitted from automatic portrait "' + owner.portrait + '" because it has no stacking number. Rename it to "NN ' + filename + '" (replace NN with its stacking number), or list it in an explicit layered_image.',
    });
  }
  return { images, layeredImages, origins, collisions, diagnostics };
};
