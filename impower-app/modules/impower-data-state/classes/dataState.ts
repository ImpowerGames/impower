import { getClientCredentials } from "../../impower-api";
import { InternalDataState } from "../types/aliases";

class DataState {
  private static _instance: DataState;

  public static get instance(): DataState {
    if (!this._instance) {
      this._instance = new DataState();
    }
    return this._instance;
  }

  private _listeners: ((internal: InternalDataState) => void)[] = [];

  private _internal: InternalDataState;

  async internal(): Promise<InternalDataState> {
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
      const { getDatabase } = await import("firebase/database");
      if (this._internal) {
        return this._internal;
      }
      const internal = getDatabase();
      try {
        if (process.env.NEXT_PUBLIC_EMULATOR_HOST) {
          const connectDataStateEmulator = (
            await import("../utils/connectDataStateEmulator")
          ).default;
          if (this._internal) {
            return this._internal;
          }
          connectDataStateEmulator(internal);
          console.warn("USING REALTIME DATABASE EMULATOR");
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

export default DataState;
