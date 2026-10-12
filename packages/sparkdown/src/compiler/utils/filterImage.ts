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

/**
 * Everything derived from one root image and one ordered attribute list.
 *
 * The visibility walk visits every layer of the vocabulary, and an attribute
 * portrait's vocabulary runs to hundreds of layers, so a page that resolves
 * every displayed and every predicted image on each preview update pays for it
 * hundreds of times over. The walk, the attribute resolution and the SVG
 * rewrite above it are pure functions of `(root image, attributes)`, so each
 * is computed once and reused.
 *
 * `visibility`, `filteredSrc` and `filteredLayers` are filled on first demand:
 * a plain `image` root reaching a `?attributes=` URL needs only the selection.
 */
interface AttributeDerivation {
  selection: AttributeSelection;
  /** Vocabulary and selection diagnostics; the visibility walk adds its own. */
  diagnostics: AttributeDiagnostic[];
  visibility?: { visible: Record<string, boolean>; diagnostics: AttributeDiagnostic[] };
  filteredSrc?: string | undefined;
  filteredLayers?: any[];
}

/**
 * The vocabulary of one root image, with a derivation per attribute list.
 *
 * Keyed by the root struct's identity, and guarded by every field the
 * derivation reads: a struct that is rewritten in place — a root redefined
 * from an `image` to a `layered_image` (#340), a file whose bytes changed, a
 * vocabulary attached after a partial compile — fails the guard and derives
 * again. Nothing is written back onto the program's structs, so a warm-up
 * resolving on copies still cannot decide what the game renders.
 */
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

/** How many attribute lists one root keeps derivations for before starting over. */
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
      // Positional entries are explicitly listed images; only authored table
      // keys carry conditions. Automatic folders already have a vocabulary.
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
  // The key tells an empty list apart from a list holding one empty string:
  // the first selects nothing and says nothing, the second is what a
  // half-typed `portrait~` produces and earns an unknown-attribute warning.
  // No single separator can separate those two, so the encoding carries each
  // entry's own bounds.
  const key = JSON.stringify(attributes);
  const cached = entry.derivations.get(key);
  if (cached) return cached;
  const resolved = resolveAttributes(entry.vocabulary!, attributes);
  const derivation: AttributeDerivation = {
    selection: resolved.selection,
    diagnostics: [...entry.vocabulary!.diagnostics, ...resolved.diagnostics],
  };
  // A script cycling through looks would otherwise grow this without bound.
  if (entry.derivations.size >= MAX_DERIVATIONS_PER_ROOT) entry.derivations.clear();
  entry.derivations.set(key, derivation);
  return derivation;
};

const visibilityOf = (entry: RootMemo, derivation: AttributeDerivation) =>
  (derivation.visibility ??= evaluateAttributeVisibility(
    entry.vocabulary!,
    derivation.selection,
  ));

/** Resolve named looks from the root outward, so appended attributes win. */
const resolveChain = (context: ImageContext, struct: any): {
  image?: any;
  attributes: string[];
  circular?: boolean;
} => {
  const attributes: string[] = [];
  const seen = new Set<any>();
  const visit = (current: any): any => {
    if (!current || typeof current !== "object") return undefined;
    if (seen.has(current)) return "circular";
    seen.add(current);
    if (!current.$type) return visit(lookup(context, current));
    if (current.$type !== "filtered_image") return current;
    const image = visit(lookup(context, current.image));
    if (Array.isArray(current.attributes)) {
      attributes.push(...current.attributes.filter((value: unknown): value is string => typeof value === "string"));
    }
    return image;
  };
  const image = visit(struct);
  if (image === "circular") return { attributes, circular: true };
  return { image, attributes };
};

/**
 * The root image a named look resolves to, the attributes gathered along the
 * way, and what they select.
 *
 * `visibility: false` asks for the selection alone, skipping the walk over
 * every layer; the returned `diagnostics` then carry the vocabulary's and the
 * selection's, without the visibility warnings. Callers that report
 * diagnostics to an author leave it on.
 *
 * The selection and the diagnostic list are copies, so a caller that keeps or
 * edits either cannot reach the memo's own derivation and change what a later
 * caller renders.
 */
export const resolveImageAttributes = (context: ImageContext, struct: any, options?: {
  visibility?: boolean;
}): {
  image?: any;
  attributes: string[];
  vocabulary?: AttributeVocabulary;
  selection: AttributeSelection;
  diagnostics: AttributeDiagnostic[];
  circular?: boolean;
} => {
  const { image, attributes, circular } = resolveChain(context, struct);
  if (circular) return { attributes, selection: {}, diagnostics: [], circular: true };
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

/** Write the derived output of a named look onto the struct the caller holds. */
export const filterImage = (context: ImageContext, filteredImage: any): string | undefined => {
  if (!filteredImage) return undefined;
  delete filteredImage.filtered_src;
  delete filteredImage.filtered_layers;
  const { image, attributes, circular } = resolveChain(context, filteredImage);
  if (circular) return `${filteredImage.$type}.${filteredImage.$name}.image`;
  if (!image || typeof image !== "object") return undefined;
  const entry = rootMemo(image);
  const derivation = entry.vocabulary
    ? derivationOf(entry, attributes)
    : undefined;
  const selection = derivation?.selection ?? {};
  if (image.$type === "image") {
    if (derivation && "filteredSrc" in derivation) {
      filteredImage.filtered_src = derivation.filteredSrc;
      return undefined;
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
    // A fresh array each time: the memo's copy outlives this call, and a
    // caller holding `filtered_layers` must not be able to edit it.
    filteredImage.filtered_layers = [...layers];
  }
  return undefined;
};
