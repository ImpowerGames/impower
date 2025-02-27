import { File } from "../types/File";
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
    if (file.text != null) {
      if (file.type === "image" && file.ext === "svg") {
        file.data = buildSVGSource(file.text);
        delete file.text;
      }
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
    let syncedFile = this._syncedFiles.get(file.uri);
    if (syncedFile) {
      this.processText(file);
      this._syncedFiles.set(file.uri, file);
      return true;
    }
    return false;
  }

  remove(params: { file: { uri: string } }) {
    const file = params.file;
    const syncedFile = this._syncedFiles.get(file.uri);
    this._syncedFiles.delete(file.uri);
    return Boolean(syncedFile);
  }
}
