import {
  deleteDoc as _deleteDoc,
  doc as _doc,
  setDoc as _setDoc,
  updateDoc as _updateDoc,
} from "firebase/firestore/lite";
import { DocumentPath } from "../../impower-api";
import {
  DataDocument,
  isTimestamp,
  RecursivePartial,
} from "../../impower-core";
import {
  isFieldValue,
  timestampServerValue,
  WriteBatch,
} from "../types/aliases";
import deleteReadOnlyFields from "../utils/deleteReadOnlyFields";
import getDocumentCreateMetadata from "../utils/getDocumentCreateMetadata";
import getDocumentUpdateMetadata from "../utils/getDocumentUpdateMetadata";
import DataStore from "./dataStore";

class DataStoreWrite<T extends DocumentPath = DocumentPath> {
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
   * Creates the document.
   *
   * (The result of this write will only be reflected in document reads that occur
   * after the returned Promise resolves. If the client is offline, the
   * write fails.)
   *
   * @param data - A map of the fields and values for the document.
   *
   * @returns A Promise resolved once the data has been successfully written
   * to the backend.
   */
  async create<D extends DataDocument = DataDocument>(
    update?: RecursivePartial<D>,
    batch?: WriteBatch
  ): Promise<void> {
    const internal = await DataStore.instance.internal();
    const logInfo = (await import("../../impower-logger/utils/logInfo"))
      .default;
    const logInfoEnd = (await import("../../impower-logger/utils/logInfoEnd"))
      .default;
    const d = update || {
      _documentType: "SlugDocument",
    };
    const docPath = this.path;
    const metadata = await getDocumentCreateMetadata();
    const newDoc = {
      ...d,
      ...metadata,
    };
    const validDoc: Record<string, unknown> = {
      ...newDoc,
    };
    if (validDoc.pitchedAt && !isFieldValue(validDoc.pitchedAt)) {
      if (
        validDoc.pitched &&
        isTimestamp(validDoc.pitchedAt) &&
        validDoc.pitchedAt.server
      ) {
        validDoc.pitchedAt = timestampServerValue();
      } else {
        delete validDoc.pitchedAt;
      }
    }
    if (validDoc.repitchedAt && !isFieldValue(validDoc.repitchedAt)) {
      if (
        validDoc.pitched &&
        isTimestamp(validDoc.repitchedAt) &&
        validDoc.repitchedAt.server
      ) {
        validDoc.repitchedAt = timestampServerValue();
      } else {
        delete validDoc.repitchedAt;
      }
    }
    if (validDoc.publishedAt && !isFieldValue(validDoc.publishedAt)) {
      if (
        validDoc.published &&
        isTimestamp(validDoc.publishedAt) &&
        validDoc.publishedAt.server
      ) {
        validDoc.publishedAt = timestampServerValue();
      } else {
        delete validDoc.publishedAt;
      }
    }
    if (validDoc.republishedAt && !isFieldValue(validDoc.republishedAt)) {
      if (
        validDoc.published &&
        isTimestamp(validDoc.republishedAt) &&
        validDoc.republishedAt.server
      ) {
        validDoc.republishedAt = timestampServerValue();
      } else {
        delete validDoc.republishedAt;
      }
    }
    if (validDoc.accessedAt && !isFieldValue(validDoc.accessedAt)) {
      if (isTimestamp(validDoc.accessedAt) && validDoc.accessedAt.server) {
        validDoc.accessedAt = timestampServerValue();
      } else {
        delete validDoc.accessedAt;
      }
    }
    deleteReadOnlyFields(validDoc);
    const ref = _doc(internal, docPath);
    if (batch) {
      logInfo("DataStore", `BATCH CREATE DOC (${ref.path})`, validDoc);
      batch.set(ref, validDoc);
      logInfoEnd("DataStore", `BATCH CREATE DOC (${ref.path})`, validDoc);
      return;
    }
    logInfo("DataStore", `CREATE DOC (${ref.path})`, validDoc);
    await _setDoc(ref, validDoc);
    logInfoEnd("DataStore", `CREATE DOC (${ref.path})`, validDoc);
  }

  /**
   * Updates fields in the document.
   * The update will fail if applied to a document that does not exist.
   *
   * (The result of this update will only be reflected in document reads that occur
   * after the returned Promise resolves. If the client is offline, the
   * update fails.)
   *
   * @param data - An object containing the fields and values with which to
   * update the document. Fields can contain dots to reference nested fields
   * within the document.
   *
   * @returns A Promise resolved once the data has been successfully written
   * to the backend.
   */
  async update<D extends DataDocument = DataDocument>(
    update: RecursivePartial<D>,
    batch?: WriteBatch
  ): Promise<void> {
    const internal = await DataStore.instance.internal();
    const logInfo = (await import("../../impower-logger/utils/logInfo"))
      .default;
    const logInfoEnd = (await import("../../impower-logger/utils/logInfoEnd"))
      .default;
    const d = update;
    const docPath = this.path;
    const metadata = await getDocumentUpdateMetadata();
    const newDoc = {
      ...d,
      ...metadata,
    };
    if (newDoc._createdAt) {
      delete newDoc._createdAt;
    }
    if (newDoc._updates) {
      // delete _updates if not incrementing using dot notation
      // i.e. _updates: {18824: 1} instead of _updates.18824: increment(1)
      delete newDoc._updates;
    }
    const validDoc: Record<string, unknown> = { ...newDoc };
    if (validDoc.pitchedAt) {
      delete validDoc.pitchedAt;
    }
    if (validDoc.repitchedAt && !isFieldValue(validDoc.repitchedAt)) {
      if (
        validDoc.pitched &&
        isTimestamp(validDoc.repitchedAt) &&
        validDoc.repitchedAt.server
      ) {
        validDoc.repitchedAt = timestampServerValue();
      } else {
        delete validDoc.repitchedAt;
      }
    }
    if (validDoc.publishedAt) {
      delete validDoc.publishedAt;
    }
    if (validDoc.republishedAt && !isFieldValue(validDoc.republishedAt)) {
      if (
        validDoc.published &&
        isTimestamp(validDoc.republishedAt) &&
        validDoc.republishedAt.server
      ) {
        validDoc.republishedAt = timestampServerValue();
      } else {
        delete validDoc.republishedAt;
      }
    }
    if (validDoc.accessedAt && !isFieldValue(validDoc.accessedAt)) {
      if (isTimestamp(validDoc.accessedAt) && validDoc.accessedAt.server) {
        validDoc.accessedAt = timestampServerValue();
      } else {
        delete validDoc.accessedAt;
      }
    }
    deleteReadOnlyFields(validDoc);
    const ref = _doc(internal, docPath);
    if (batch) {
      logInfo("DataStore", `BATCH UPDATE DOC (${ref.path})`, validDoc);
      batch.update(ref, validDoc);
      logInfoEnd("DataStore", `BATCH UPDATE DOC (${ref.path})`, validDoc);
      return;
    }
    logInfo("DataStore", `UPDATE DOC (${ref.path})`, validDoc);
    await _updateDoc(ref, validDoc);
    logInfoEnd("DataStore", `UPDATE DOC (${ref.path})`, validDoc);
  }

  /**
   * Deletes the document.
   *
   * (The deletion will only be reflected in document reads that occur after the
   * returned Promise resolves. If the client is offline, the
   * delete fails.)
   *
   * @returns A Promise resolved once the document has been successfully
   * deleted from the backend.
   */
  async delete(batch?: WriteBatch): Promise<void> {
    const internal = await DataStore.instance.internal();
    const logInfo = (await import("../../impower-logger/utils/logInfo"))
      .default;
    const logInfoEnd = (await import("../../impower-logger/utils/logInfoEnd"))
      .default;
    const docPath = this.path;
    const ref = _doc(internal, docPath);
    if (batch) {
      logInfo("DataStore", `BATCH DELETE DOC (${ref.path})`);
      batch.delete(ref);
      logInfoEnd("DataStore", `BATCH DELETE DOC (${ref.path})`);
      return;
    }
    logInfo("DataStore", `DELETE DOC (${ref.path})`);
    await _deleteDoc(ref);
    logInfoEnd("DataStore", `DELETE DOC (${ref.path})`);
  }
}

export default DataStoreWrite;
