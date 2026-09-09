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

type ImageContext = { [type: string]: { [name: string]: any } };

const lookup = (context: ImageContext, ref: any): any => {
  if (!ref?.$name) return undefined;
  if (ref.$type) return context[ref.$type]?.[ref.$name];
  return context["filtered_image"]?.[ref.$name] ??
    context["layered_image"]?.[ref.$name] ?? context["image"]?.[ref.$name];
};

/** Resolve named looks from the root outward, so appended attributes win. */
export const resolveImageAttributes = (context: ImageContext, struct: any): {
  image?: any;
  attributes: string[];
  vocabulary?: AttributeVocabulary;
  selection: AttributeSelection;
  diagnostics: AttributeDiagnostic[];
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
  if (image === "circular") return { attributes, selection: {}, diagnostics: [], circular: true };
  let vocabulary: AttributeVocabulary | undefined = image?.attribute_vocabulary;
  if (!vocabulary && image?.$type === "image" && image.data) {
    vocabulary = buildSVGAttributeVocabulary(image.data);
  }
  if (!vocabulary && image?.$type === "layered_image") {
    vocabulary = buildAttributeVocabulary(Object.keys(image.assets ?? {}).map((key) => ({
      key,
      // Positional entries are explicitly listed images; only authored table
      // keys carry conditions. Automatic folders already have a vocabulary.
      name: key,
    })));
  }
  if (!vocabulary) return { image, attributes, selection: {}, diagnostics: [] };
  const resolved = resolveAttributes(vocabulary, attributes);
  const visible = evaluateAttributeVisibility(vocabulary, resolved.selection);
  return { image, attributes, vocabulary, selection: resolved.selection,
    diagnostics: [...vocabulary.diagnostics, ...resolved.diagnostics, ...visible.diagnostics] };
};

/** Refresh derived output on every call: named looks and asset data can change. */
export const filterImage = (context: ImageContext, filteredImage: any): string | undefined => {
  if (!filteredImage) return undefined;
  delete filteredImage.filtered_src;
  delete filteredImage.filtered_layers;
  const resolved = resolveImageAttributes(context, filteredImage);
  if (resolved.circular) return `${filteredImage.$type}.${filteredImage.$name}.image`;
  const image = resolved.image;
  if (!image) return undefined;
  if (image.$type === "image") {
    if (image.data && (image.ext === "svg" || image.data.includes("<svg") || /^data:image\/svg\+xml[;,]/i.test(image.data))) {
      const filtered = filterSVG(image.data, resolved.selection);
      filteredImage.filtered_src = filtered.startsWith("data:") ? filtered : buildSVGSource(filtered);
    } else {
      filteredImage.filtered_src = buildFilteredSrc(image, resolved.selection) ?? image.src;
    }
  } else if (image.$type === "layered_image") {
    const visible = resolved.vocabulary
      ? evaluateAttributeVisibility(resolved.vocabulary, resolved.selection).visible
      : undefined;
    filteredImage.filtered_layers = Object.entries(image.assets ?? {})
      .filter(([key]) => !visible || visible[key] !== false)
      .map(([, value]) => value);
  }
  return undefined;
};
