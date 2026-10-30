import {
  buildAttributeVocabulary,
  buildSVGAttributeVocabulary,
  evaluateAttributeVisibility,
  resolveAttributes,
  type AttributeDiagnostic,
  type AttributeSelection,
  type AttributeVocabulary,
} from "../../attributes";
import { buildFilteredSrc } from "../../filters/filteredSvg";
import { filterSVG } from "./filterSVG";
import { buildSVGSource } from "./buildSVGSource";
import { getContextEntry } from "./getContextEntry";

type ImageContext = { [type: string]: { [name: string]: any } };

const lookup = (context: ImageContext, ref: any): any => {
  if (!ref?.$name) return undefined;
  if (ref.$type) return getContextEntry(context, ref.$type, ref.$name);
  return getContextEntry(context, "filtered_image", ref.$name) ??
    getContextEntry(context, "layered_image", ref.$name) ??
    getContextEntry(context, "image", ref.$name);
};

interface AttributeDerivation {
  selection: AttributeSelection;
  diagnostics: AttributeDiagnostic[];
  visibility?: { visible: Record<string, boolean>; diagnostics: AttributeDiagnostic[] };
  filteredSrc?: string | undefined;
  filteredLayers?: any[];
}

interface RootMemo {
  $type: unknown;
  $name: unknown;
  src: unknown;
  data: unknown;
  ext: unknown;
  attribute_vocabulary: unknown;
  assets: unknown;
  vocabulary?: AttributeVocabulary;
  derivations: Map<string, AttributeDerivation>;
}

const MAX_DERIVATIONS_PER_ROOT = 64;

const memo = new WeakMap<object, RootMemo>();

const rootMemo = (image: any): RootMemo => {
  const cached = memo.get(image);
  if (
    cached &&
    cached.$type === image.$type &&
    cached.$name === image.$name &&
    cached.src === image.src &&
    cached.data === image.data &&
    cached.ext === image.ext &&
    cached.attribute_vocabulary === image.attribute_vocabulary &&
    cached.assets === image.assets
  ) {
    return cached;
  }
  let vocabulary: AttributeVocabulary | undefined = image.attribute_vocabulary;
  if (!vocabulary && image.$type === "image" && image.data) {
    vocabulary = buildSVGAttributeVocabulary(image.data);
  }
  if (!vocabulary && image.$type === "layered_image") {
    vocabulary = buildAttributeVocabulary(Object.keys(image.assets ?? {}).map((key) => ({
      key,
      name: key,
    })));
  }
  const entry: RootMemo = {
    $type: image.$type, $name: image.$name, src: image.src, data: image.data,
    ext: image.ext, attribute_vocabulary: image.attribute_vocabulary, assets: image.assets,
    vocabulary, derivations: new Map(),
  };
  memo.set(image, entry);
  return entry;
};

const derivationOf = (entry: RootMemo, attributes: string[]): AttributeDerivation => {
  const key = JSON.stringify(attributes);
  const cached = entry.derivations.get(key);
  if (cached) return cached;
  const resolved = resolveAttributes(entry.vocabulary!, attributes);
  const derivation: AttributeDerivation = {
    selection: resolved.selection,
    diagnostics: [...entry.vocabulary!.diagnostics, ...resolved.diagnostics],
  };
  if (entry.derivations.size >= MAX_DERIVATIONS_PER_ROOT) entry.derivations.clear();
  entry.derivations.set(key, derivation);
  return derivation;
};

const visibilityOf = (entry: RootMemo, derivation: AttributeDerivation) =>
  (derivation.visibility ??= evaluateAttributeVisibility(
    entry.vocabulary!,
    derivation.selection,
  ));

const resolveChain = (context: ImageContext, struct: any): {
  image?: any;
  attributes: string[];
  cycle?: any[];
} => {
  const attributes: string[] = [];
  const seen = new Set<any>();
  const looks: any[] = [];
  let cycle: any[] | undefined;
  const visit = (current: any): any => {
    if (!current || typeof current !== "object") return undefined;
    if (seen.has(current)) {
      const start = looks.indexOf(current.$type ? current : lookup(context, current));
      cycle = looks.slice(Math.max(start, 0));
      return undefined;
    }
    seen.add(current);
    if (!current.$type) return visit(lookup(context, current));
    if (current.$type !== "filtered_image") return current;
    looks.push(current);
    const image = visit(lookup(context, current.image));
    if (Array.isArray(current.attributes)) {
      attributes.push(...current.attributes.filter((value: unknown): value is string => typeof value === "string"));
    }
    return image;
  };
  const image = visit(struct);
  if (cycle) return { attributes, cycle };
  return { image, attributes };
};

export const resolveImageAttributes = (context: ImageContext, struct: any, options?: {
  visibility?: boolean;
}): {
  image?: any;
  attributes: string[];
  vocabulary?: AttributeVocabulary;
  selection: AttributeSelection;
  diagnostics: AttributeDiagnostic[];
  cycle?: any[];
} => {
  const { image, attributes, cycle } = resolveChain(context, struct);
  if (cycle) return { attributes, selection: {}, diagnostics: [], cycle };
  const entry = image && typeof image === "object" ? rootMemo(image) : undefined;
  if (!entry?.vocabulary) return { image, attributes, selection: {}, diagnostics: [] };
  const derivation = derivationOf(entry, attributes);
  const selection = { ...derivation.selection };
  if (options?.visibility === false) {
    return { image, attributes, vocabulary: entry.vocabulary,
      selection, diagnostics: [...derivation.diagnostics] };
  }
  const visibility = visibilityOf(entry, derivation);
  return { image, attributes, vocabulary: entry.vocabulary, selection,
    diagnostics: [...derivation.diagnostics, ...visibility.diagnostics] };
};

export const filterImage = (context: ImageContext, filteredImage: any): void => {
  if (!filteredImage) return;
  delete filteredImage.filtered_src;
  delete filteredImage.filtered_layers;
  const { image, attributes } = resolveChain(context, filteredImage);
  if (!image || typeof image !== "object") return;
  const entry = rootMemo(image);
  const derivation = entry.vocabulary
    ? derivationOf(entry, attributes)
    : undefined;
  const selection = derivation?.selection ?? {};
  if (image.$type === "image") {
    if (derivation && "filteredSrc" in derivation) {
      filteredImage.filtered_src = derivation.filteredSrc;
      return;
    }
    let filteredSrc: string | undefined;
    if (image.data && (image.ext === "svg" || image.data.includes("<svg") || /^data:image\/svg\+xml[;,]/i.test(image.data))) {
      const filtered = filterSVG(image.data, selection);
      filteredSrc = filtered.startsWith("data:") ? filtered : buildSVGSource(filtered);
    } else {
      filteredSrc = buildFilteredSrc(image, selection) ?? image.src;
    }
    if (derivation) derivation.filteredSrc = filteredSrc;
    filteredImage.filtered_src = filteredSrc;
  } else if (image.$type === "layered_image") {
    let layers = derivation?.filteredLayers;
    if (!layers) {
      const visible = derivation && entry.vocabulary
        ? visibilityOf(entry, derivation).visible
        : undefined;
      layers = Object.entries(image.assets ?? {})
        .filter(([key]) => !visible || visible[key] !== false)
        .map(([, value]) => value);
      if (derivation) derivation.filteredLayers = layers;
    }
    filteredImage.filtered_layers = [...layers];
  }
};
