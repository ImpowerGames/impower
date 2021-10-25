import {
  FirebaseStorage,
  UploadTaskSnapshot as _UploadTaskSnapshot,
} from "firebase/storage";
import { CustomFileMetadata } from "../../impower-core";

export type InternalStorage = FirebaseStorage;

export type UploadTaskSnapshot = _UploadTaskSnapshot;

export interface StorageError {
  code: string;
  message: string;
  name: string;
}

export interface FileProgress {
  transfered: number;
  total: number;
}

export interface StringData {
  [field: string]: string;
}

export interface SettableCustomFileMetadata extends StringData {
  storageKey?: string;
  fileType?: string;
  fileExtension?: string;
  fileName?: string;
}

export interface FileMetadata {
  bucket: string;
  generation: string;
  metageneration: string;
  fullPath: string;
  name: string;
  size: number;
  timeCreated: string;
  updated: string;
  md5Hash: string;
  cacheControl: string;
  contentDisposition: string;
  contentEncoding: string;
  contentLanguage: string;
  contentType: string;
  customMetadata: CustomFileMetadata;
}

export interface SettableFileMetadata {
  cacheControl?: string | null;
  contentDisposition?: string | null;
  contentEncoding?: string | null;
  contentLanguage?: string | null;
  contentType?: string | null;
  customMetadata: SettableCustomFileMetadata;
}
