import { MY_ID } from "../constants";
import { getClient } from "../utils";

export const getToday = (currentDate: Date): number => {
  return Math.trunc(currentDate.getTime() / 1000 / 60 / 60 / 24);
};

export const getTodayFolder = (currentDate: Date): string => {
  return "users" + "/" + MY_ID + "/" + getToday(currentDate);
};

export const getTodayStorageKey = (
  currentDate: Date,
  fileId: string
): string => {
  return getTodayFolder(currentDate) + "/" + fileId;
};

export const getTestFileBuffer = (size: number): Buffer => {
  return Buffer.allocUnsafe(size);
};

export const downloadFile = async (path: string): Promise<void> => {
  const client = getClient();
  try {
    await client.storage().ref().child(path).getDownloadURL();
  } catch (error) {
    throw new Error(`permission denied: ${error}`);
  }
};

export const uploadFile = async (
  path: string,
  data: Blob | Uint8Array | ArrayBuffer
): Promise<void> => {
  const client = getClient();
  try {
    await client.storage().ref().child(path).put(data).then();
  } catch (error) {
    throw new Error(`permission denied: ${error}`);
  }
};

export const softDeleteFile = async (path: string): Promise<void> => {
  const client = getClient();
  try {
    await client.storage().ref().child(path).put(Buffer.allocUnsafe(0)).then();
  } catch (error) {
    throw new Error(`permission denied: ${error}`);
  }
};
export const deleteFile = async (path: string): Promise<void> => {
  const client = getClient();
  try {
    await client.storage().ref().child(path).delete();
  } catch (error) {
    throw new Error(`permission denied: ${error}`);
  }
};

export const getMetadata = async (path: string): Promise<void> => {
  const client = getClient();
  try {
    await client.storage().ref().child(path).getMetadata();
  } catch (error) {
    throw new Error(`permission denied: ${error}`);
  }
};

export const updateMetadata = async (
  path: string,
  metadata: {
    cacheControl?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    contentLanguage?: string;
    contentType?: string;
    customMetadata?: Record<string, string>;
  }
): Promise<void> => {
  const client = getClient();
  try {
    await client.storage().ref().child(path).updateMetadata(metadata);
  } catch (error) {
    throw new Error(`permission denied: ${error}`);
  }
};
