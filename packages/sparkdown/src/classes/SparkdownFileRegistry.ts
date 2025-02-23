import { File } from "../types/File";

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

  add(params: { file: File }) {
    const file = params.file;
    this._syncedFiles.set(file.uri, file);
    return true;
  }

  update(params: { file: File }) {
    const file = params.file;
    let syncedFile = this._syncedFiles.get(file.uri);
    if (syncedFile) {
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
