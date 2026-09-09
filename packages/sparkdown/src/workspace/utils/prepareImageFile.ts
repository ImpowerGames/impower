import {
  attributeVocabularyCacheKey,
  buildSVGAttributeVocabulary,
  normalizeSVGAttributeNames,
  type AttributeVocabulary,
} from "../../attributes";
import type { File } from "../../compiler/types/File";
import { buildSVGSource } from "../../compiler/utils/buildSVGSource";

/** Workspace-owned cache. Only one current signature per file is retained. */
export class ImageVocabularyCache {
  private entries = new Map<string, { signature: string; vocabulary: AttributeVocabulary }>();

  prepare(file: File): File {
    if (file.type !== "image" || file.ext.toLowerCase() !== "svg" || file.text == null) return file;
    const text = normalizeSVGAttributeNames(file.text);
    // Hosts normally supply mtime as version. The content hash also protects
    // callers without one and edits whose filesystem timestamp is unchanged.
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

/** The compiler receives metadata; only hosts needing inline previews send art. */
export const imageFileForCompiler = (file: File, stripImageData = false): File => {
  if (!stripImageData || file.type !== "image") return file;
  const copy = { ...file };
  delete copy.data;
  delete copy.text;
  return copy;
};
