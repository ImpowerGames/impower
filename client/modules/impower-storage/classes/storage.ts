import {
  getDownloadURL as _getDownloadURL,
  ref as _ref,
  uploadBytes as _uploadBytes,
  uploadBytesResumable as _uploadBytesResumable,
} from "firebase/storage";
import { getClientCredentials } from "../../impower-api";
import API from "../../impower-api/classes/api";
import {
  FileMetadata,
  InternalStorage,
  SettableFileMetadata,
  UploadTaskSnapshot,
} from "../types/aliases";

class Storage {
  private static _instance: Storage;

  public static get instance(): Storage {
    if (!this._instance) {
      this._instance = new Storage();
    }
    return this._instance;
  }

  private _listeners: ((internal: InternalStorage) => void)[] = [];

  private _internal: InternalStorage;

  async internal(): Promise<InternalStorage> {
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
      const { getStorage } = await import("firebase/storage");
      if (this._internal) {
        return this._internal;
      }
      const internal = getStorage();
      try {
        if (process.env.NEXT_PUBLIC_ORIGIN.includes("localhost")) {
          const connectStorageEmulator = (
            await import("../utils/connectStorageEmulator")
          ).default;
          if (this._internal) {
            return this._internal;
          }
          connectStorageEmulator(internal);
          console.warn("USING STORAGE EMULATOR");
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

  async put(
    object: Blob | Uint8Array | ArrayBuffer,
    metadata?: Partial<FileMetadata>,
    onProgress?: (snapshot: UploadTaskSnapshot) => void,
    onStart?: (storageKey: string) => void
  ): Promise<string> {
    const internal = await this.internal();
    const claims = await API.instance.verifyUploadClaim();
    const storageKey = claims?.storage?.key;
    if (onStart) {
      onStart(storageKey);
    }
    const logInfo = (await import("../../impower-logger/utils/logInfo"))
      .default;
    logInfo("Storage", "PUT FILE", storageKey, metadata);
    const newMetadata: SettableFileMetadata = {
      ...metadata,
      cacheControl: "public,max-age=31536000",
      customMetadata: {
        ...metadata.customMetadata,
        storageKey,
      },
    };
    const ref = _ref(internal, storageKey);
    const uploadTask = _uploadBytesResumable(ref, object, newMetadata);
    return new Promise<string>((resolve, reject): void => {
      const onComplete = async (): Promise<void> => {
        const { ref } = uploadTask.snapshot;
        const url = await _getDownloadURL(ref);
        resolve(url);
      };
      const onError = (error: unknown): void => {
        reject(error);
      };
      uploadTask.on("state_changed", onProgress, onError, onComplete);
    });
  }

  async delete(storageKey: string): Promise<void> {
    const internal = await this.internal();
    const logInfo = (await import("../../impower-logger/utils/logInfo"))
      .default;
    logInfo("Storage", "DELETE FILE", storageKey);
    // Rather than allowing the user to hard delete a file,
    // only allow them to soft a file by overwriting it with an empty blob.
    // This preserves the file's metadata, and allows us to properly rate limit upload requests
    // while also saving us some storage space
    const ref = _ref(internal, storageKey);
    return _uploadBytes(ref, Buffer.allocUnsafe(0)).then();
  }
}

export default Storage;
