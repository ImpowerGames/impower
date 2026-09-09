import type { File } from "../types/File";
import { ATTRIBUTE_VOCABULARY_VERSION, buildAttributeVocabulary, buildSVGAttributeVocabulary, decodeSVGSource, normalizeSVGAttributeNames } from "../../attributes";
import { buildSVGSource } from "../utils/buildSVGSource";

export class SparkdownFileRegistry {
  protected _syncedFiles = new Map<string, File>();

  get(uri: string) {
    return this._syncedFiles.get(uri);
  }

  has(uri: string) {
    return this._syncedFiles.has(uri);
  }

  keys() {
    return this._syncedFiles.keys();
  }

  all() {
    return this._syncedFiles.values();
  }

  processText(file: File) {
    if (file.type !== "image" || file.ext.toLowerCase() !== "svg") return;
    const incompatible = file.attribute_vocabulary && file.attribute_vocabulary.version !== ATTRIBUTE_VOCABULARY_VERSION;
    const source = file.text ?? file.data;
    if (source != null) {
      const normalized = normalizeSVGAttributeNames(decodeSVGSource(source));
      if (!file.attribute_vocabulary || incompatible)
        file.attribute_vocabulary = buildSVGAttributeVocabulary(normalized);
      file.data = buildSVGSource(normalized);
      delete file.text;
    } else if (incompatible) {
      file.attribute_vocabulary = buildAttributeVocabulary([]);
      file.attribute_vocabulary.diagnostics.push({
        code: "incompatible-attribute-vocabulary",
        severity: "warning",
        message: `Portrait "${file.name}" has incompatible cached attribute metadata. Reload the SVG source to rebuild its attributes.`,
      });
    }
  }

  add(params: { file: File }) {
    const file = params.file;
    this.processText(file);
    this._syncedFiles.set(file.uri, file);
    return true;
  }

  update(params: { file: File }) {
    const file = params.file;
    this.processText(file);
    let syncedFile = this._syncedFiles.get(file.uri);
    if (syncedFile) {
      this._syncedFiles.set(file.uri, file);
      return true;
    }
    this._syncedFiles.set(file.uri, file);
    return true;
  }

  remove(params: { file: { uri: string } }) {
    const file = params.file;
    const syncedFile = this._syncedFiles.get(file.uri);
    this._syncedFiles.delete(file.uri);
    return Boolean(syncedFile);
  }
}
