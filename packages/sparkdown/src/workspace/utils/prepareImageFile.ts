import {
  attributeVocabularyCacheKey,
  buildSVGAttributeVocabulary,
  normalizeSVGAttributeNames,
  type AttributeVocabulary,
} from "../../attributes";
import type { File } from "../../compiler/types/File";
import { buildSVGSource } from "../../compiler/utils/buildSVGSource";

export class ImageVocabularyCache {
  private entries = new Map<string, { signature: string; vocabulary: AttributeVocabulary }>();

  prepare(file: File): File {
    if (file.type !== "image" || file.ext.toLowerCase() !== "svg" || file.text == null) return file;
    const text = normalizeSVGAttributeNames(file.text);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    const signature = `${attributeVocabularyCacheKey(file.uri, file.version ?? 0, text.length)}:${hash >>> 0}`;
    let entry = this.entries.get(file.uri);
    if (entry?.signature !== signature) {
      entry = { signature, vocabulary: buildSVGAttributeVocabulary(text) };
      this.entries.set(file.uri, entry);
    }
    const prepared: File = { ...file, data: buildSVGSource(text), attribute_vocabulary: entry.vocabulary };
    if (prepared.src?.startsWith("/file:/")) {
      const url = new URL(prepared.src, "https://sparkdown.invalid");
      url.searchParams.set("content", String(hash >>> 0));
      prepared.src = url.pathname + url.search + url.hash;
    }
    delete prepared.text;
    return prepared;
  }

  delete(uri: string) {
    this.entries.delete(uri);
  }
}

export const imageFileForCompiler = (file: File, stripImageData = false): File => {
  if (!stripImageData || file.type !== "image") return file;
  const copy = { ...file };
  delete copy.data;
  delete copy.text;
  return copy;
};
