import { writeBatch as _writeBatch } from "firebase/firestore/lite";
import { InternalDataStore, WriteBatch } from "../types/aliases";
import DataStore from "./dataStore";

class DataStoreBatch {
  protected _internal: InternalDataStore;

  protected _batch: WriteBatch;

  public get batch(): WriteBatch {
    return this._batch;
  }

  async start(): Promise<WriteBatch> {
    const internal = await DataStore.instance.internal();
    const logInfo = (await import("../../impower-logger/utils/logInfo"))
      .default;
    logInfo("DataStore", "START BATCH");
    this._batch = _writeBatch(internal);
    return this._batch;
  }

  async commit(): Promise<void> {
    const logInfo = (await import("../../impower-logger/utils/logInfo"))
      .default;
    logInfo("DataStore", "COMMIT BATCH");
    return this._batch.commit();
  }
}

export default DataStoreBatch;
