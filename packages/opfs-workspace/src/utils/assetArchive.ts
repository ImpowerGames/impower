import { getFileName } from "./getFileName";

// Path logic for the asset/project zip, kept separate from fflate's zipSync /
// unzipSync so it is unit-testable without the binary codec. Both halves
// preserve PROJECT-RELATIVE directory paths so nested assets (and two assets
// sharing a basename in different folders) survive an export/import or a
// Google-Drive zip round-trip instead of collapsing to their basename.

/**
 * Build the fflate `Zippable` map, keyed by each entry's archive PATH. Passing a
 * `path` with `/` separators makes fflate emit nested zip entries.
 */
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

/**
 * Turn fflate's unzip output into file entries, KEEPING the full archive path as
 * `filename` (so the caller can reconstruct the folder via
 * `getFileUri(projectId, filename)`). Pure-directory entries (e.g. `somedir/`,
 * whose basename is empty) are dropped — an empty filename downstream makes
 * `getFileHandle("")` throw "Name is not allowed".
 */
export const parseUnzipEntries = (
  unzipped: Record<string, Uint8Array>,
): { filename: string; data: ArrayBuffer }[] =>
  Object.entries(unzipped)
    .filter(([filename]) => Boolean(getFileName(filename)) && !filename.endsWith("/"))
    .map(([filename, data]) => ({
      filename,
      data: data.buffer as ArrayBuffer,
    }));
