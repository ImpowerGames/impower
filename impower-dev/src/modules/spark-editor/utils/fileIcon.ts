import {
  Binder,
  FileCode,
  FileText,
  FileTypeHtml,
  FileTypePdf,
  FileZip,
  type IconComponent,
  Link,
  Music,
  Photo,
  Script,
  WaveSaw,
} from "@impower/impower-ui/icons";

/**
 * File extension → icon component. Keyed by the lowercased extension WITHOUT
 * the leading dot. Anything not listed falls back to {@link FileText}.
 *
 * Grouped to mirror how the editor treats these files:
 *  - `.sd` is the screenplay script (its own glyph)
 *  - prose/data text gets a plain document glyph
 *  - code/structured data gets the code glyph
 *  - images / audio / archives / docs get their medium's glyph
 */
const ICON_BY_EXT: Record<string, IconComponent> = {
  // Screenplay script
  sd: Script,

  // Prose & plain text
  txt: FileText,
  md: FileText,
  name: FileText,

  // Code / structured data
  json: FileCode,
  js: FileCode,
  ts: FileCode,
  csv: FileCode,

  // Images
  png: Photo,
  jpg: Photo,
  jpeg: Photo,
  gif: Photo,
  webp: Photo,
  svg: Photo,

  // Audio
  mid: Music,
  mp3: Music,
  ogg: Music,
  wav: Music,
  m4a: Music,

  // Synth instrument
  synth: WaveSaw,

  // Misc media / documents
  url: Link,
  zip: FileZip,
  pdf: FileTypePdf,
  html: FileTypeHtml,
};

/**
 * Lowercased final extension of a path's basename, or `""` when there is none.
 * Leading-dot files (`.folder`) and extension-less names have no extension.
 */
function extOf(path: string): string {
  const basename = path.split("/").slice(-1)[0] ?? path;
  const dotIndex = basename.lastIndexOf(".");
  return dotIndex > 0 ? basename.slice(dotIndex + 1).toLowerCase() : "";
}

/**
 * Pick the icon for a file-tree row.
 *
 * Folders always render the {@link Binder} glyph (the editor has no open/closed
 * variants — the caller conveys expand state via styling, not a different icon).
 * Files key off their final extension; unknown extensions get {@link FileText}.
 *
 * @param path - Project-relative path (e.g. `chapters/intro.sd`). Only the
 *   basename's final extension matters; directories in the path are ignored.
 * @param isDirectory - True for a folder row.
 */
export function iconForPath(path: string, isDirectory: boolean): IconComponent {
  if (isDirectory) {
    return Binder;
  }
  return ICON_BY_EXT[extOf(path)] ?? FileText;
}

/**
 * True when the path is a raster/vector image whose row should show a live
 * thumbnail instead of the {@link Photo} glyph. Derived from the icon map so
 * the image set has a single source of truth (every image ext maps to Photo,
 * and nothing else does).
 */
export function isImagePath(path: string): boolean {
  return ICON_BY_EXT[extOf(path)] === Photo;
}
