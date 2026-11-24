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

export interface LayeredMorphFile {
  key: string;
  name: string;
  src: string;
  uri?: string;
  struct: any;
}

export interface LayeredMorphArtwork {
  text: string;
  files: LayeredMorphFile[];
  paths: Record<string, number>;
  uri?: string;
}

export const layeredMorphRoot = (context: Context | undefined, struct: any): any => {
  const root = context && struct && typeof struct === "object" ? resolveImageRoot(context, struct) : undefined;
  return root?.$type === "layered_image" ? root : undefined;
};

const escapeAttribute = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function layeredMorphArtwork(context: Context | undefined, image: any): LayeredMorphArtwork | undefined {
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
    return {
      key: layer.key,
      name: layer.name,
      src: drawn.src,
      ...(typeof drawn.uri === "string" ? { uri: drawn.uri } : {}),
      struct: drawn.struct,
    };
  };
  const box = `x="0" y="0" width="${LAYERED_MORPH_EXTENT}" height="${LAYERED_MORPH_EXTENT}"`;
  let unreadable = false;
  const emit = (parent: string, path: string, start = 0): string =>
    (children.get(parent) ?? [])
      .map((layer, offset) => {
        const at = `${path}/${start + offset}`;
        const file = fileOf(layer);
        if (file === null) unreadable = true;
        const nested = children.get(layer.key)?.length;
        const name = `data-name="${escapeAttribute(layer.name)}"`;
        const drawn = (named: boolean, where: string) => {
          if (!file) return "";
          paths[where] = files.length;
          files.push(file);
          return `<image ${named ? `${name} ` : ""}data-layer="${files.length - 1}" ${box}/>`;
        };
        if (!nested) return file ? drawn(true, at) : `<g ${name}/>`;
        const own = drawn(false, `${at}/0`);
        return `<g ${name}>${own}${emit(layer.key, at, own ? 1 : 0)}</g>`;
      })
      .join("");
  const body = emit(ATTRIBUTE_ROOT, "/0");
  if (unreadable || files.length === 0) return undefined;
  const bottom = files[0]!;
  const uri = bottom.uri ?? (typeof image.uri === "string" ? image.uri : undefined);
  return {
    text: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LAYERED_MORPH_EXTENT} ${LAYERED_MORPH_EXTENT}" width="${LAYERED_MORPH_EXTENT}" height="${LAYERED_MORPH_EXTENT}">${body}</svg>`,
    files,
    paths,
    ...(uri === undefined ? {} : { uri }),
  };
}

export interface LayeredMorphDrawn {
  file: number;
  opacity: number;
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

export function layeredMorphDrawn(model: LayeredMorphModel, frame?: MorphFrameState): LayeredMorphDrawn[] {
  const drawn: LayeredMorphDrawn[] = [];
  for (const { file, chain } of model.chains) {
    let opacity = 1;
    let shown = true;
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
    if (shown && opacity > 0) drawn.push({ file, opacity });
  }
  return drawn;
}
