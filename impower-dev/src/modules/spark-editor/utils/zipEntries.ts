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

const CHECK_BATCH_BYTES = 16 * 1024 * 1024;

export const zipInflates = (data: ArrayBuffer, entries: readonly ZipEntry[]): boolean => {
  const bytes = new Uint8Array(data);
  let batch = new Set<string>();
  let size = 0;
  const check = () => {
    const wanted = batch;
    unzipSync(bytes, { filter: (file) => wanted.has(file.name) });
    batch = new Set();
    size = 0;
  };
  try {
    for (const entry of entries) {
      if (batch.size && size + entry.size > CHECK_BATCH_BYTES) {
        check();
      }
      batch.add(entry.path);
      size += entry.size;
    }
    check();
    return true;
  } catch {
    return false;
  }
};
