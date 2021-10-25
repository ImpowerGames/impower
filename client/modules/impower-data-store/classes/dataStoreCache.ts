import {
  DocumentData,
  DocumentSnapshot,
  isQuerySnapshot,
  QueryDocumentSnapshot,
  QuerySnapshot,
} from "../types/aliases";

class DataStoreCache {
  private static _instance: DataStoreCache;

  public static get instance(): DataStoreCache {
    if (!this._instance) {
      this._instance = new DataStoreCache();
    }
    return this._instance;
  }

  private _cache: Record<string, DocumentSnapshot | QuerySnapshot>;

  private get cache(): Record<string, DocumentSnapshot | QuerySnapshot> {
    if (!this._cache) {
      this._cache = {};
    }
    return this._cache;
  }

  private _overrides: Record<string, Record<string, unknown>>;

  private get overrides(): Record<string, Record<string, unknown>> {
    if (!this._overrides) {
      this._overrides = {};
    }
    return this._overrides;
  }

  clear(...keys: string[]): void {
    if (keys?.length > 0) {
      keys.forEach((key) => {
        if (this._cache?.[key]) {
          delete this._cache[key];
        }
      });
    } else {
      this._cache = {};
    }
  }

  load<T extends DocumentSnapshot | QuerySnapshot>(key: string): T {
    return this.cache[key] as T;
  }

  save<T extends DocumentSnapshot | QuerySnapshot>(
    key: string,
    snapshot: T
  ): void {
    if (isQuerySnapshot(snapshot)) {
      const docs = [...snapshot.docs];
      snapshot.docs.forEach((s, index) => {
        const result = s.data();
        s.data = (): DocumentData => {
          const override = this.overrides[s.id];
          if (!override) {
            return result;
          }
          return { ...result, ...override };
        };
        docs[index] = s as QueryDocumentSnapshot;
      });
      this.cache[key] = { ...snapshot, docs } as QuerySnapshot;
      return;
    }
    const result = snapshot.data();
    snapshot.data = (): DocumentData => {
      const override = this.overrides[snapshot.id];
      if (!override) {
        return result;
      }
      return { ...result, ...override };
    };
    this.cache[key] = snapshot as DocumentSnapshot;
  }

  override<T extends Partial<Record<string, unknown>>>(
    id: string,
    data: T
  ): void {
    this.overrides[id] = { ...(this.overrides[id] || {}), ...data };
  }
}

export default DataStoreCache;
