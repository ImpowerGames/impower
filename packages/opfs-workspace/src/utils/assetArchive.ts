import { getFileName } from "./getFileName";

export const buildZippable = (
  entries: { path: string; data: ArrayBuffer | Uint8Array }[],
): Record<string, Uint8Array> => {
  const zippable: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    zippable[entry.path] =
      entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
  }
  return zippable;
};

export const parseUnzipEntries = (
  unzipped: Record<string, Uint8Array>,
): { filename: string; data: ArrayBuffer }[] =>
  Object.entries(unzipped)
    .filter(([filename]) => Boolean(getFileName(filename)) && !filename.endsWith("/"))
    .map(([filename, data]) => ({
      filename,
      data: data.buffer as ArrayBuffer,
    }));
