import { ATTRIBUTE_ROOT, type AttributeLayer } from "../attributes";
import { resolveImageAttributes, resolveImageMember, resolveImageRoot } from "../compiler/utils/filterImage";
import { resolveImageLayers } from "../compiler/utils/resolveImageLayers";
import { parse, type Node } from "../txml/txml";
import { readAlpha } from "./color";
import { own } from "./own";
import { poseLeaf, type MorphFrameState } from "./render";
import { styleProperty } from "./svgDocument";
import type { MorphArtifact } from "./types";

type Context = { [type: string]: { [name: string]: any } };
type Element = Exclude<Node, string | null>;

export const LAYERED_MORPH_EXTENT = 100;

export interface LayeredMorphSize {
  width: number;
  height: number;
}

export interface LayeredMorphFile {
  key: string;
  name: string;
  src: string;
  uri?: string;
  struct: any;
  size?: LayeredMorphSize;
}

export interface LayeredMorphArtwork {
  text: string;
  files: LayeredMorphFile[];
  paths: Record<string, number>;
  uri?: string;
  size?: LayeredMorphSize;
}

export const layeredMorphRoot = (context: Context | undefined, struct: any): any => {
  const root = context && struct && typeof struct === "object" ? resolveImageRoot(context, struct) : undefined;
  return root?.$type === "layered_image" ? root : undefined;
};

const escapeAttribute = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const sizeOf = (struct: any): LayeredMorphSize | undefined => {
  const width = struct?.width;
  const height = struct?.height;
  return typeof width === "number" && typeof height === "number" && width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)
    ? { width, height }
    : undefined;
};

interface LayeredMorphNode {
  name: string;
  file?: number;
  children?: LayeredMorphNode[];
}

interface LayeredMorphStack {
  nodes: LayeredMorphNode[];
  files: LayeredMorphFile[];
  paths: Record<string, number>;
  uri?: string;
}

function layeredMorphStack(context: Context | undefined, image: any): LayeredMorphStack | undefined {
  if (!context || image?.$type !== "layered_image") return undefined;
  const vocabulary = resolveImageAttributes(context, image, { visibility: false }).vocabulary;
  if (!vocabulary) return undefined;
  const children = new Map<string, AttributeLayer[]>();
  for (const layer of vocabulary.layers) {
    const list = children.get(layer.parent) ?? [];
    list.push(layer);
    children.set(layer.parent, list);
  }
  const files: LayeredMorphFile[] = [];
  const paths: Record<string, number> = Object.create(null);
  const containing = new Set<any>([image]);
  const fileOf = (layer: AttributeLayer): LayeredMorphFile | undefined | null => {
    const asset = own(image.assets ?? {}, layer.key);
    if (asset === undefined) return undefined;
    const resolved = resolveImageLayers(context, resolveImageMember(context, asset, containing), new Set(containing));
    if (resolved.length === 0) return undefined;
    if (resolved.length > 1) return null;
    const drawn = resolved[0]!;
    const root = drawn.struct?.$type === "filtered_image" ? resolveImageRoot(context, drawn.struct) : drawn.struct;
    const file = root?.$type === "image" ? root : undefined;
    const size = sizeOf(file);
    const uri = typeof drawn.uri === "string" ? drawn.uri : typeof file?.uri === "string" ? file.uri : undefined;
    return {
      key: layer.key,
      name: layer.name,
      src: drawn.src,
      ...(uri === undefined ? {} : { uri }),
      struct: drawn.struct,
      ...(size ? { size } : {}),
    };
  };
  let unreadable = false;
  const collect = (parent: string, path: string, start = 0): LayeredMorphNode[] =>
    (children.get(parent) ?? []).map((layer, offset) => {
      const at = `${path}/${start + offset}`;
      const file = fileOf(layer);
      if (file === null) unreadable = true;
      const nested = children.get(layer.key)?.length;
      const add = (where: string) => {
        if (!file) return undefined;
        paths[where] = files.length;
        files.push(file);
        return files.length - 1;
      };
      if (!nested) {
        const index = add(at);
        return index === undefined ? { name: layer.name } : { name: layer.name, file: index };
      }
      const index = add(`${at}/0`);
      const below = collect(layer.key, at, index === undefined ? 0 : 1);
      return index === undefined ? { name: layer.name, children: below } : { name: layer.name, file: index, children: below };
    });
  const nodes = collect(ATTRIBUTE_ROOT, "/0");
  if (unreadable || files.length === 0) return undefined;
  const uri = files[0]!.uri ?? (typeof image.uri === "string" ? image.uri : undefined);
  return { nodes, files, paths, ...(uri === undefined ? {} : { uri }) };
}

export interface LayeredSizeMismatch {
  file: LayeredMorphFile;
  size: LayeredMorphSize;
  bottom: LayeredMorphFile;
  pictureSize: LayeredMorphSize;
}

const mismatchesOf = (files: readonly LayeredMorphFile[]): LayeredSizeMismatch[] => {
  const bottom = files[0];
  const pictureSize = bottom?.size;
  if (!bottom || !pictureSize) return [];
  return files.flatMap((file) =>
    file.size && (file.size.width !== pictureSize.width || file.size.height !== pictureSize.height)
      ? [{ file, size: file.size, bottom, pictureSize }]
      : [],
  );
};

export function layeredSizeMismatches(context: Context | undefined, image: any): LayeredSizeMismatch[] {
  const stack = layeredMorphStack(context, image);
  return stack ? mismatchesOf(stack.files) : [];
}

export interface LayeredSizeWarning {
  uri: string;
  message: string;
}

const fileLabel = (file: LayeredMorphFile) => {
  if (!file.uri) return file.name;
  const leaf = file.uri.slice(file.uri.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(leaf);
  } catch {
    return leaf;
  }
};

const sizeLabel = (size: LayeredMorphSize) => `${size.width}×${size.height}`;

export function layeredSizeWarnings(
  picture: string,
  pictureUri: string | undefined,
  mismatches: readonly LayeredSizeMismatch[],
): LayeredSizeWarning[] {
  return mismatches.flatMap(({ file, size, bottom, pictureSize }) => {
    const uri = file.uri ?? bottom.uri ?? pictureUri;
    if (!uri) return [];
    return [
      {
        uri,
        message: `Layer file "${fileLabel(file)}" is ${sizeLabel(size)} pixels, but picture "${picture}" is ${sizeLabel(pictureSize)}, the size of its bottom layer "${fileLabel(bottom)}". Morphs do not play on "${picture}" while its layer files differ in size. Export every layer at the document size.`,
      },
    ];
  });
}

export function layeredMorphArtwork(context: Context | undefined, image: any): LayeredMorphArtwork | undefined {
  const stack = layeredMorphStack(context, image);
  if (!stack || mismatchesOf(stack.files).length > 0) return undefined;
  const size = stack.files[0]!.size;
  const width = size?.width ?? LAYERED_MORPH_EXTENT;
  const height = size?.height ?? LAYERED_MORPH_EXTENT;
  const box = `x="0" y="0" width="${width}" height="${height}"`;
  const render = (nodes: readonly LayeredMorphNode[]): string =>
    nodes
      .map((node) => {
        const name = `data-name="${escapeAttribute(node.name)}"`;
        const drawn = (named: boolean) =>
          node.file === undefined ? "" : `<image ${named ? `${name} ` : ""}data-layer="${node.file}" ${box}/>`;
        if (!node.children) return node.file === undefined ? `<g ${name}/>` : drawn(true);
        return `<g ${name}>${drawn(false)}${render(node.children)}</g>`;
      })
      .join("");
  const extent = size ? ` width="${width}" height="${height}"` : "";
  return {
    text: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"${extent}>${render(stack.nodes)}</svg>`,
    files: stack.files,
    paths: stack.paths,
    ...(stack.uri === undefined ? {} : { uri: stack.uri }),
    ...(size ? { size } : {}),
  };
}

export interface LayeredMorphDrawn {
  file: number;
  opacity: number;
  motions: LayeredMorphMotion[];
}

export interface LayeredMorphMotion {
  label: string;
  wrapper: number;
}

export interface LayeredMorphModel {
  files: number[];
  chains: { file: number; chain: Element[] }[];
}

export function layeredMorphModel(artifact: Pick<MorphArtifact, "parts">): LayeredMorphModel | undefined {
  const chains: LayeredMorphModel["chains"] = [];
  const walk = (nodes: Node[], above: Element[]) => {
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const chain = [...above, node];
      const index = node.tagName.toLowerCase() === "image" ? Number(node.attributes["data-layer"]) : Number.NaN;
      if (Number.isSafeInteger(index) && index >= 0) chains.push({ file: index, chain });
      walk(node.children, chain);
    }
  };
  for (const part of artifact.parts) {
    let parsed: ReturnType<typeof parse>;
    try {
      parsed = parse(part.svg);
    } catch {
      return undefined;
    }
    walk(Array.isArray(parsed) ? parsed : [parsed], []);
  }
  return { files: [...new Set(chains.map(({ file }) => file))], chains };
}

const posed = (element: Element, frame: MorphFrameState | undefined): Element => {
  const copy: Element = { tagName: element.tagName, attributes: { ...element.attributes }, children: [] };
  const node = element.attributes["data-morph"];
  if (frame && node) poseLeaf(copy, node, frame);
  return copy;
};

const chainMotions = new WeakMap<LayeredMorphModel, LayeredMorphMotion[][]>();

export function layeredMorphMotions(model: LayeredMorphModel): LayeredMorphMotion[][] {
  let motions = chainMotions.get(model);
  if (!motions) {
    const wrappers = new Map<Element, number>();
    motions = model.chains.map(({ chain }) =>
      chain.flatMap((element) => {
        const label = element.attributes["data-morph-motion"];
        if (!label) return [];
        if (!wrappers.has(element)) wrappers.set(element, wrappers.size);
        return [{ label, wrapper: wrappers.get(element)! }];
      }),
    );
    chainMotions.set(model, motions);
  }
  return motions;
}

export function layeredMorphDrawn(model: LayeredMorphModel, frame?: MorphFrameState): LayeredMorphDrawn[] {
  const drawn: LayeredMorphDrawn[] = [];
  const motionsOf = layeredMorphMotions(model);
  model.chains.forEach(({ file, chain }, at) => {
    let opacity = 1;
    let shown = true;
    const motions = motionsOf[at]!;
    chain.forEach((element, index) => {
      const pose = posed(element, frame);
      const display = styleProperty(pose, "display") ?? pose.attributes["display"];
      if (display?.trim().toLowerCase() === "none") shown = false;
      if (index === chain.length - 1) {
        const visibility = styleProperty(pose, "visibility") ?? pose.attributes["visibility"];
        if (visibility && visibility.trim().toLowerCase() !== "visible") shown = false;
      }
      opacity *= readAlpha(styleProperty(pose, "opacity") ?? pose.attributes["opacity"] ?? "1") ?? 1;
    });
    if (shown && opacity > 0) drawn.push({ file, opacity, motions });
  });
  return drawn;
}
