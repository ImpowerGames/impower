/**
 * A workspace directory or file inside a client.
 */
export interface FileData {
  uri: string;
  name: string;
  src: string;
  ext: string;
  type: string;
  version: number;
  /** File size in bytes. */
  size?: number;
  /** Last-modified time (epoch ms) — OPFS `lastModified` for existing files,
   * write time for freshly-written ones. Drives the "Modified …" caption + sort. */
  modified?: number;
  text?: string;
  languageId?: string | null;
}
