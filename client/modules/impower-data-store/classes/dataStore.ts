import { getClientCredentials } from "../../impower-api";
import { InternalDataStore } from "../types/aliases";

class DataStore {
  private static _instance: DataStore;

  public static get instance(): DataStore {
    if (!this._instance) {
      this._instance = new DataStore();
    }
    return this._instance;
  }

  private _listeners: ((internal: InternalDataStore) => void)[] = [];

  private _internal: InternalDataStore;

  async internal(): Promise<InternalDataStore> {
    if (this._internal === undefined) {
      this._internal = null;
      const { initializeApp, getApp } = await import("firebase/app");
      if (this._internal) {
        return this._internal;
      }
      try {
        getApp();
      } catch (e) {
        initializeApp(getClientCredentials());
      }
      const { getFirestore } = await import("firebase/firestore/lite");
      if (this._internal) {
        return this._internal;
      }
      const internal = getFirestore();
      try {
        if (process.env.NEXT_PUBLIC_ORIGIN.includes("localhost")) {
          const connectDataStoreEmulator = (
            await import("../utils/connectDataStoreEmulator")
          ).default;
          if (this._internal) {
            return this._internal;
          }
          connectDataStoreEmulator(internal);
          console.warn("USING FIRESTORE EMULATOR");
        }
      } catch (e) {
        console.warn(e);
        // already connected
      }
      this._internal = internal;
      this._listeners.forEach((l) => l(this._internal));
      this._listeners = [];
    }
    if (this._internal === null) {
      return new Promise((resolve) => {
        this._listeners.push(resolve);
      });
    }
    return this._internal;
  }
}

export default DataStore;
