import { doc as _doc, getDoc as _getDoc } from "firebase/firestore/lite";
import { DocumentPath } from "../../impower-api";
import { DataDocument } from "../../impower-core";
import { DocumentSnapshot } from "../types/aliases";
import DataStore from "./dataStore";
import DataStoreCache from "./dataStoreCache";

class DataStoreRead<T extends DocumentPath = DocumentPath> {
  protected _path: T;

  public get path(): string {
    return this._path.join("/");
  }

  public get key(): string {
    return this._path.join("%");
  }

  constructor(...pathSegments: T) {
    this._path = pathSegments;
  }

  /**
   * Reads the document.
   *
   * Note: By default, get() attempts to provide up-to-date data when possible
   * by waiting for data from the server, but it will fail
   * if you are offline and the server cannot be reached.
   *
   * @return A Promise resolved with a DocumentSnapshot containing the
   * current document contents.
   */
  async get<D extends DataDocument>(
    checkCacheFirst = true
  ): Promise<DocumentSnapshot<D>> {
    const internal = await DataStore.instance.internal();
    const logInfo = (await import("../../impower-logger/utils/logInfo"))
      .default;
    const logInfoEnd = (await import("../../impower-logger/utils/logInfoEnd"))
      .default;
    const ref = _doc(internal, this.path);
    const cacheKey = this.key;
    if (checkCacheFirst) {
      const cachedSnap = DataStoreCache.instance.load(cacheKey);
      if (cachedSnap) {
        logInfo("DataStore", `GET CACHED (${this.path})`, cacheKey);
        const result = cachedSnap as DocumentSnapshot<D>;
        logInfoEnd("DataStore", `GET CACHED (${this.path})`, cacheKey);
        return result;
      }
    }
    logInfo("DataStore", `GET (${this.path})`);
    const snap = await _getDoc(ref);
    DataStoreCache.instance.save(cacheKey, snap);
    const result = snap as DocumentSnapshot<D>;
    logInfoEnd("DataStore", `GET (${this.path})`);
    return result;
  }
}

export default DataStoreRead;
