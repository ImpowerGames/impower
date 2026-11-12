import { unzipSync } from "fflate";

export type ZipEntry = { path: string; size: number };

export const listZip = (data: ArrayBuffer): ZipEntry[] | null => {
  const entries: ZipEntry[] = [];
  try {
    unzipSync(new Uint8Array(data), {
      filter: (file) => {
        entries.push({ path: file.name, size: file.originalSize });
        return false;
      },
    });
  } catch {
    return null;
  }
  return entries;
};

export const inflateZipEntry = (data: ArrayBuffer, path: string): ArrayBuffer => {
  const bytes = unzipSync(new Uint8Array(data), { filter: (file) => file.name === path })[path];
  if (!bytes) {
    throw new Error(`${path} is not in the zip`);
  }
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? (bytes.buffer as ArrayBuffer)
    : (bytes.slice().buffer as ArrayBuffer);
};
